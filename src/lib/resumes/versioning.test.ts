import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject } from '../objects/versioning';
import { createResumeFromScratch, forkResume, editResume, isHeadVersion } from './versioning';

describe('resume versioning', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('a fresh resume is not forked from anything', async () => {
    const user = await makeUser();
    const resume = await createResumeFromScratch(user.id, 'My Resume');
    expect(resume.parentVersionId).toBeNull();
    expect(resume.versionNumber).toBe(1);
  });

  it('fork starts a new resume, remembering the source as parent', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);

    expect(fork.resumeId).not.toBe(original.resumeId);
    expect(fork.parentVersionId).toBe(original.resumeId);
  });

  it('fork writes whatever content the caller submits (pre-filled from the source by the caller)', async () => {
    const user = await makeUser();
    const skill = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const sections = [
      { sectionType: 'SKILLS' as const, order: 0, items: [{ objectRevisionId: skill.id, order: 0 }] },
    ];
    const original = await createResumeFromScratch(user.id, 'Original', sections);

    // Simulates the user leaving the fork form's pre-filled content unchanged.
    const fork = await forkResume(user.id, original.id, 'Forked', sections);

    expect(fork.sections).toHaveLength(1);
    expect(fork.items[0].objectRevisionId).toBe(skill.id);
  });

  it('edit stays on the same resume and inherits its fork origin, not the edited-from revision\'s id', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);
    const edited = await editResume(user.id, fork.id, 'Renamed', []);

    expect(edited.resumeId).toBe(fork.resumeId);
    expect(edited.parentVersionId).toBe(fork.parentVersionId);
    expect(edited.parentVersionId).toBe(original.resumeId);
  });

  it('editing a stale (non-head) revision succeeds and becomes the new latest for its resume', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    const v3 = await editResume(user.id, v1.id, 'v3 from a stale revision', []);

    expect(v3.resumeId).toBe(v1.resumeId);
    expect(v3.parentVersionId).toBe(v1.parentVersionId);
    expect(await isHeadVersion(v3.id)).toBe(true);
    expect(await isHeadVersion(v2.id)).toBe(false);
  });

  it('renaming on edit updates the resume\'s name, not just this revision', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'Renamed', []);

    expect(v2.name).toBe('Renamed');
    const resume = await prisma.resume.findUniqueOrThrow({ where: { id: v1.resumeId } });
    expect(resume.name).toBe('Renamed');
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

  it('rejects creating a resume with an empty or whitespace-only title', async () => {
    const user = await makeUser();
    await expect(createResumeFromScratch(user.id, '')).rejects.toThrow('Resume title is required');
    await expect(createResumeFromScratch(user.id, '   ')).rejects.toThrow('Resume title is required');
  });

  it('rejects editing a resume title to empty', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    await expect(editResume(user.id, original.id, '   ', [])).rejects.toThrow('Resume title is required');
  });

  it('rejects forking a resume with an empty title', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    await expect(forkResume(user.id, original.id, '  ', [])).rejects.toThrow('Resume title is required');
  });

  it('isHeadVersion reflects recency, not tree position', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    expect(await isHeadVersion(v1.id)).toBe(true);

    const v2 = await editResume(user.id, v1.id, 'v2', []);
    expect(await isHeadVersion(v1.id)).toBe(false);
    expect(await isHeadVersion(v2.id)).toBe(true);
  });

  it('rejects a resume write when an item\'s object type does not match its section', async () => {
    const user = await makeUser();
    const skill = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const sections = [
      { sectionType: 'EDUCATION' as const, order: 0, items: [{ objectRevisionId: skill.id, order: 0 }] },
    ];
    await expect(createResumeFromScratch(user.id, 'Mismatched', sections)).rejects.toThrow(/type/);
  });
});
