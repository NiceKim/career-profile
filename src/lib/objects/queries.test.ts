import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject, editObjectRevision } from './versioning';
import { createResumeFromScratch, editResume } from '../resumes/versioning';
import { listObjectsForUser, listLatestObjectsForUser, getObjectHistory, getObjectVariationUsage, listTagsForUser } from './queries';

describe('object queries', () => {
  beforeEach(resetDb);

  it('lists every revision of every object, newest first', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const other = await createObject(user.id, 'SUMMARY', {}, 'Backend engineer');

    const list = await listObjectsForUser(user.id);

    expect(list).toHaveLength(3);
    expect(list.map((o) => o.id)).toEqual([other.id, v2.id, v1.id]);
  });

  it('filters to only the given object type', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Go');
    await createObject(user.id, 'SUMMARY', {}, 'Backend engineer');

    const skillsOnly = await listObjectsForUser(user.id, 'SKILLS');

    expect(skillsOnly).toHaveLength(1);
    expect(skillsOnly[0].body).toBe('Go');
  });

  it('returns full variation history oldest first', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const history = await getObjectHistory(user.id, v1.objectVariationId);

    expect(history.map((v) => v.id)).toEqual([v1.id, v2.id]);
  });

  it('includes which resumes use each revision', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const resume = await createResumeFromScratch(user.id, 'My Resume');
    await editResume(user.id, resume.id, undefined, [
      { sectionType: 'SKILLS', order: 0, items: [{ objectRevisionId: v2.id, order: 0 }] },
    ]);

    const history = await getObjectHistory(user.id, v1.objectVariationId);

    expect(history.find((r) => r.id === v1.id)?.usedInResumeNames).toEqual([]);
    expect(history.find((r) => r.id === v2.id)?.usedInResumeNames).toEqual(['My Resume']);
  });

  it('lists every resume using any revision of a variation, with which version each uses', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const resumeA = await createResumeFromScratch(user.id, 'Resume A', [
      { sectionType: 'SKILLS', order: 0, items: [{ objectRevisionId: v1.id, order: 0 }] },
    ]);
    const resumeB = await createResumeFromScratch(user.id, 'Resume B', [
      { sectionType: 'SKILLS', order: 0, items: [{ objectRevisionId: v2.id, order: 0 }] },
    ]);

    const usage = await getObjectVariationUsage(user.id, v1.objectVariationId);

    expect(usage).toHaveLength(2);
    expect(usage).toContainEqual({ resumeName: 'Resume A', resumeRevisionId: resumeA.id, versionNumber: 1 });
    expect(usage).toContainEqual({ resumeName: 'Resume B', resumeRevisionId: resumeB.id, versionNumber: 2 });
  });

  it('lists only the latest revision of each variation, optionally filtered by type', async () => {
    const user = await prisma.user.create({ data: { email: 'u2@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    await createObject(user.id, 'SUMMARY', {}, 'Backend engineer');

    const skillsOnly = await listLatestObjectsForUser(user.id, 'SKILLS');
    expect(skillsOnly).toHaveLength(1);
    expect(skillsOnly[0].id).toBe(v2.id);

    const all = await listLatestObjectsForUser(user.id);
    expect(all).toHaveLength(2);
  });

  it('lists distinct tags across all of a user\'s object variations', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);
    await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'React', ['Frontend', 'Backend']);

    const tags = await listTagsForUser(user.id);

    expect(tags.sort()).toEqual(['Backend', 'Frontend']);
  });
});
