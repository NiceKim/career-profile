import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion, editObjectVersion } from './versioning';
import { listObjectsForUser, listLatestObjectsForUser, getObjectHistory, listTagsForUser } from './queries';

describe('object queries', () => {
  beforeEach(resetDb);

  it('lists every version of every object, newest first', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const other = await createObjectVersion(user.id, 'SUMMARY', {}, 'Backend engineer');

    const list = await listObjectsForUser(user.id);

    expect(list).toHaveLength(3);
    expect(list.map((o) => o.id)).toEqual([other.id, v2.id, v1.id]);
  });

  it('filters to only the given object type', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Go');
    await createObjectVersion(user.id, 'SUMMARY', {}, 'Backend engineer');

    const skillsOnly = await listObjectsForUser(user.id, 'SKILLS');

    expect(skillsOnly).toHaveLength(1);
    expect(skillsOnly[0].body).toBe('Go');
  });

  it('returns full history oldest first', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const history = await getObjectHistory(user.id, v1.rootVersionId);

    expect(history.map((v) => v.id)).toEqual([v1.id, v2.id]);
  });

  it('lists only the latest version of each object, optionally filtered by type', async () => {
    const user = await prisma.user.create({ data: { email: 'u2@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    await createObjectVersion(user.id, 'SUMMARY', {}, 'Backend engineer');

    const skillsOnly = await listLatestObjectsForUser(user.id, 'SKILLS');
    expect(skillsOnly).toHaveLength(1);
    expect(skillsOnly[0].id).toBe(v2.id);

    const all = await listLatestObjectsForUser(user.id);
    expect(all).toHaveLength(2);
  });

  it('lists distinct tags across all of a user\'s object versions', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);
    await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'React', ['Frontend', 'Backend']);

    const tags = await listTagsForUser(user.id);

    expect(tags.sort()).toEqual(['Backend', 'Frontend']);
  });
});
