import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';

vi.mock('@/lib/session', () => ({ getCurrentUserId: vi.fn() }));
import { getCurrentUserId } from '@/lib/session';
import {
  createObjectAction,
  editObjectAction,
  forkObjectVariationAction,
  listLatestObjectsAction,
  getObjectHistoryAction,
} from './actions';

describe('object actions', () => {
  beforeEach(resetDb);

  it('creates an object scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);

    const result = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const stored = await prisma.resumeObject.findUnique({ where: { id: result.objectId } });
    expect(stored?.ownerUserId).toBe(user.id);
  });

  it('propagates the not-authenticated error when there is no session', async () => {
    vi.mocked(getCurrentUserId).mockRejectedValue(new Error('Not authenticated'));

    await expect(createObjectAction('SKILLS', { category: 'Languages' }, 'Python')).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('edit action creates a new revision via the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const edited = await editObjectAction(created.id, { category: 'Languages' }, 'Python, TypeScript');

    expect(edited.versionNumber).toBe(2);
  });

  it('passes tags through on create and edit', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Go', ['Backend']);

    const edited = await editObjectAction(created.id, { category: 'Languages' }, 'Go', ['Backend', 'AI']);

    expect(edited.tags).toEqual(['Backend', 'AI']);
  });

  it('forkObjectVariationAction creates a new variation scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u4@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const forked = await forkObjectVariationAction(created.objectId, { category: 'Languages' }, 'Go', ['Backend']);

    expect(forked.objectId).toBe(created.objectId);
    expect(forked.objectVariationId).not.toBe(created.objectVariationId);
    const stored = await prisma.objectRevision.findUnique({ where: { id: forked.id } });
    expect(stored?.body).toBe('Go');
  });

  it('listLatestObjectsAction scopes to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u2@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const result = await listLatestObjectsAction('SKILLS');
    expect(result).toHaveLength(1);
  });

  it('getObjectHistoryAction returns every revision for the given variation', async () => {
    const user = await prisma.user.create({ data: { email: 'u3@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');
    await editObjectAction(created.id, { category: 'Languages' }, 'Python, TypeScript');

    const history = await getObjectHistoryAction(created.objectVariationId);
    expect(history).toHaveLength(2);
  });
});
