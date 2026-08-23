import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion } from '../objects/versioning';
import { createResumeFromScratch, editResume, forkResume } from './versioning';
import { getLatestVersionsForUser, getResumeVersionWithContent, getResumeForest } from './queries';

describe('resume queries', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('returns exactly one (the head) version per tree', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    await createResumeFromScratch(user.id, 'A second, unrelated resume');

    const latest = await getLatestVersionsForUser(user.id);

    expect(latest).toHaveLength(2);
    expect(latest.map((r) => r.id)).toContain(v2.id);
    expect(latest.map((r) => r.id)).not.toContain(v1.id);
  });

  it('a version edited from an older sibling still counts as the latest for its tree', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    const v3 = await editResume(user.id, v1.id, 'v3', []);

    const latest = await getLatestVersionsForUser(user.id);

    expect(latest.map((r) => r.id)).toContain(v3.id);
    expect(latest.map((r) => r.id)).not.toContain(v2.id);
    expect(latest.map((r) => r.id)).not.toContain(v1.id);
  });

  it('returns full content with sections and items', async () => {
    const user = await makeUser();
    const skill = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const resume = await editResume(
      user.id,
      (await createResumeFromScratch(user.id, 'Original')).id,
      undefined,
      [{ sectionType: 'SKILLS', order: 0, items: [{ objectVersionId: skill.id, order: 0 }] }]
    );

    const content = await getResumeVersionWithContent(user.id, resume.id);

    expect(content.sections[0].items[0].objectVersionId).toBe(skill.id);
  });

  it('builds a forest with a fork edge to the source tree', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);

    const forest = await getResumeForest(user.id);

    const forkTree = forest.find((t) => t.rootVersionId === fork.rootVersionId);
    expect(forkTree?.forkedFromRootVersionId).toBe(original.rootVersionId);

    const originalTree = forest.find((t) => t.rootVersionId === original.rootVersionId);
    expect(originalTree?.forkedFromRootVersionId).toBeNull();
  });
});
