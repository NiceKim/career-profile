import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion, editObjectVersion } from './versioning';

describe('object versioning', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('creates a first version whose rootVersionId equals its own id', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python, TypeScript');
    expect(v1.rootVersionId).toBe(v1.id);
    expect(v1.versionNumber).toBe(1);
  });

  it('stores tags passed on create, defaulting to an empty list', async () => {
    const user = await makeUser();
    const tagged = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);
    const untagged = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'React');
    expect(tagged.tags).toEqual(['Backend']);
    expect(untagged.tags).toEqual([]);
  });

  it('edit creates a new version under the same rootVersionId', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript', ['Backend', 'AI']);
    expect(v2.rootVersionId).toBe(v1.rootVersionId);
    expect(v2.versionNumber).toBe(2);
    expect(v2.id).not.toBe(v1.id);
    expect(v2.tags).toEqual(['Backend', 'AI']);
  });

  it('rejects editing a version owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(owner.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await expect(
      editObjectVersion(attacker.id, v1.id, { category: 'Languages' }, 'hacked')
    ).rejects.toThrow('Not authorized');
  });
});
