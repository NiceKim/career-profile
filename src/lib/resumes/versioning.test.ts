import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion } from '../objects/versioning';
import { createResumeFromScratch, forkResume, editResume, isHeadVersion } from './versioning';

describe('resume versioning', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('a fresh resume is the root of its own tree', async () => {
    const user = await makeUser();
    const resume = await createResumeFromScratch(user.id, 'My Resume');
    expect(resume.rootVersionId).toBe(resume.id);
    expect(resume.parentVersionId).toBeNull();
  });

  it('fork starts a new tree, remembering the source as parent', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);

    expect(fork.rootVersionId).toBe(fork.id);
    expect(fork.parentVersionId).toBe(original.id);
  });

  it('fork writes whatever content the caller submits (pre-filled from the source by the caller)', async () => {
    const user = await makeUser();
    const skill = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const sections = [
      { sectionType: 'SKILLS', order: 0, items: [{ objectVersionId: skill.id, order: 0 }] },
    ];
    const original = await createResumeFromScratch(user.id, 'Original', sections);

    // Simulates the user leaving the fork form's pre-filled content unchanged.
    const fork = await forkResume(user.id, original.id, 'Forked', sections);

    expect(fork.sections).toHaveLength(1);
    expect(fork.items[0].objectVersionId).toBe(skill.id);
  });

  it('edit stays in the same tree and inherits the tree\'s fork origin, not the edited-from version\'s id', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);
    const edited = await editResume(user.id, fork.id, 'Renamed', []);

    expect(edited.rootVersionId).toBe(fork.rootVersionId);
    expect(edited.parentVersionId).toBe(fork.parentVersionId);
    expect(edited.parentVersionId).toBe(original.id);
  });

  it('editing a stale (non-head) version succeeds and becomes the new latest for its tree', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    const v3 = await editResume(user.id, v1.id, 'v3 from a stale version', []);

    expect(v3.rootVersionId).toBe(v1.rootVersionId);
    expect(v3.parentVersionId).toBe(v1.parentVersionId);
    expect(await isHeadVersion(v3.id)).toBe(true);
    expect(await isHeadVersion(v2.id)).toBe(false);
  });

  it('rejects editing a resume owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const original = await createResumeFromScratch(owner.id, 'Original');

    await expect(editResume(attacker.id, original.id, 'hacked', [])).rejects.toThrow('Not authorized');
  });

  it('rejects forking a resume owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const original = await createResumeFromScratch(owner.id, 'Original');

    await expect(forkResume(attacker.id, original.id, 'hacked', [])).rejects.toThrow('Not authorized');
  });

  it('isHeadVersion reflects recency, not tree position', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    expect(await isHeadVersion(v1.id)).toBe(true);

    const v2 = await editResume(user.id, v1.id, 'v2', []);
    expect(await isHeadVersion(v1.id)).toBe(false);
    expect(await isHeadVersion(v2.id)).toBe(true);
  });
});
