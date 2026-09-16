import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject, editObjectRevision, forkObjectVariation } from './versioning';
import { createResumeFromScratch, editResume } from '../resumes/versioning';
import { getObjectDashboard } from './dashboard';

describe('getObjectDashboard', () => {
  beforeEach(resetDb);

  it('groups revisions by object and variation, and lists which resumes use each revision', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const resumeRoot = await createResumeFromScratch(user.id, 'My Resume');
    await editResume(user.id, resumeRoot.id, undefined, [
      { sectionType: 'SKILLS', order: 0, items: [{ objectRevisionId: v2.id, order: 0 }] },
    ]);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard).toHaveLength(1);
    const [entry] = dashboard;
    expect(entry.variations).toHaveLength(1);
    const [variation] = entry.variations;
    expect(variation.revisions).toHaveLength(2);
    const v1Entry = variation.revisions.find((r) => r.id === v1.id)!;
    const v2Entry = variation.revisions.find((r) => r.id === v2.id)!;
    expect(v1Entry.usedInResumeNames).toEqual([]);
    expect(v2Entry.usedInResumeNames).toEqual(['My Resume']);
  });

  it('lists each variation under its object, keeping their histories separate', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await forkObjectVariation(user.id, v1.objectId, { category: 'Languages' }, 'Go', ['Backend']);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard).toHaveLength(1);
    expect(dashboard[0].variations).toHaveLength(2);
  });

  it('includes each variation\'s tags on every one of its revisions', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);

    const dashboard = await getObjectDashboard(user.id);

    const variation = dashboard[0].variations.find((v) => v.objectVariationId === v1.objectVariationId)!;
    expect(variation.tags).toEqual(['Backend']);
    expect(variation.revisions[0].tags).toEqual(['Backend']);
  });
});
