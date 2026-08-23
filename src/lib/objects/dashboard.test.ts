import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion, editObjectVersion } from './versioning';
import { createResumeFromScratch, editResume } from '../resumes/versioning';
import { getObjectDashboard } from './dashboard';

describe('getObjectDashboard', () => {
  beforeEach(resetDb);

  it('groups versions by object and lists which resumes use each version', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const resumeRoot = await createResumeFromScratch(user.id, 'My Resume');
    await editResume(user.id, resumeRoot.id, undefined, [
      { sectionType: 'SKILLS', order: 0, items: [{ objectVersionId: v2.id, order: 0 }] },
    ]);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard).toHaveLength(1);
    const [entry] = dashboard;
    expect(entry.versions).toHaveLength(2);
    const v1Entry = entry.versions.find((v) => v.id === v1.id)!;
    const v2Entry = entry.versions.find((v) => v.id === v2.id)!;
    expect(v1Entry.usedInResumeNames).toEqual([]);
    expect(v2Entry.usedInResumeNames).toEqual(['My Resume']);
  });

  it('includes each version\'s tags', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard[0].versions.find((v) => v.id === v1.id)?.tags).toEqual(['Backend']);
  });
});
