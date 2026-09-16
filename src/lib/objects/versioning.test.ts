import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject, editObjectRevision, forkObjectVariation } from './versioning';

describe('object versioning', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('creates an object with one variation and one revision at version 1', async () => {
    const user = await makeUser();
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python, TypeScript');
    expect(v1.versionNumber).toBe(1);
    expect(v1.objectId).not.toBe(v1.objectVariationId);
    expect(v1.objectVariationId).not.toBe(v1.id);
  });

  it('stores tags passed on create, defaulting to an empty list', async () => {
    const user = await makeUser();
    const tagged = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);
    const untagged = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'React');
    expect(tagged.tags).toEqual(['Backend']);
    expect(untagged.tags).toEqual([]);
  });

  it('edit creates a new revision under the same variation', async () => {
    const user = await makeUser();
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript', ['Backend', 'AI']);
    expect(v2.objectVariationId).toBe(v1.objectVariationId);
    expect(v2.versionNumber).toBe(2);
    expect(v2.id).not.toBe(v1.id);
    expect(v2.tags).toEqual(['Backend', 'AI']);
  });

  it('editing a stale (non-head) revision numbers off the current latest, not the edited-from revision', async () => {
    const user = await makeUser();
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const v3 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, Go');
    expect(v3.objectVariationId).toBe(v1.objectVariationId);
    expect(v3.versionNumber).toBe(v2.versionNumber + 1);
  });

  it('rejects editing a revision owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const v1 = await createObject(owner.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await expect(
      editObjectRevision(attacker.id, v1.id, { category: 'Languages' }, 'hacked')
    ).rejects.toThrow('Not authorized');
  });

  it('new variation starts its own history under the same object', async () => {
    const user = await makeUser();
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const variation2 = await forkObjectVariation(user.id, v1.objectId, { category: 'Languages' }, 'Go', ['Backend']);

    expect(variation2.objectId).toBe(v1.objectId);
    expect(variation2.objectVariationId).not.toBe(v1.objectVariationId);
    expect(variation2.versionNumber).toBe(1);
    expect(variation2.tags).toEqual(['Backend']);
  });

  it('rejects forking a variation for an object owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const v1 = await createObject(owner.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await expect(
      forkObjectVariation(attacker.id, v1.objectId, { category: 'Languages' }, 'hacked')
    ).rejects.toThrow('Not authorized');
  });
});
