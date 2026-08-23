import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';

vi.mock('@/lib/session', () => ({ getCurrentUserId: vi.fn() }));
import { getCurrentUserId } from '@/lib/session';
import { createObjectAction, editObjectAction } from './actions';

describe('object actions', () => {
  beforeEach(resetDb);

  it('creates an object scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);

    const result = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const stored = await prisma.objectVersion.findUnique({ where: { id: result.id } });
    expect(stored?.ownerUserId).toBe(user.id);
  });

  it('propagates the not-authenticated error when there is no session', async () => {
    vi.mocked(getCurrentUserId).mockRejectedValue(new Error('Not authenticated'));

    await expect(createObjectAction('SKILLS', { category: 'Languages' }, 'Python')).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('edit action creates a new version via the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const edited = await editObjectAction(created.id, { category: 'Languages' }, 'Python, TypeScript');

    const stored = await prisma.objectVersion.findUnique({ where: { id: edited.id } });
    expect(stored?.versionNumber).toBe(2);
  });

  it('passes tags through on create and edit', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Go', ['Backend']);

    const edited = await editObjectAction(created.id, { category: 'Languages' }, 'Go', ['Backend', 'AI']);

    const stored = await prisma.objectVersion.findUnique({ where: { id: edited.id } });
    expect(stored?.tags).toEqual(['Backend', 'AI']);
  });
});
