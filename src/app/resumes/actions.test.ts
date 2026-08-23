import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';

vi.mock('@/lib/session', () => ({ getCurrentUserId: vi.fn() }));
import { getCurrentUserId } from '@/lib/session';
import { createResumeAction, editResumeAction, forkResumeAction } from './actions';

describe('resume actions', () => {
  beforeEach(resetDb);

  it('creates a resume scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);

    const result = await createResumeAction('My Resume');

    const stored = await prisma.resumeVersion.findUnique({ where: { id: result.id } });
    expect(stored?.ownerUserId).toBe(user.id);
  });

  it('fork action creates a new tree linked to the source', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const original = await createResumeAction('Original');

    const fork = await forkResumeAction(original.id, 'Forked', []);

    const stored = await prisma.resumeVersion.findUnique({ where: { id: fork.id } });
    expect(stored?.parentVersionId).toBe(original.id);
    expect(stored?.rootVersionId).toBe(fork.id);
  });

  it('edit action creates a new version in the same tree', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const original = await createResumeAction('Original');

    const edited = await editResumeAction(original.id, 'Renamed', []);

    const stored = await prisma.resumeVersion.findUnique({ where: { id: edited.id } });
    expect(stored?.name).toBe('Renamed');
  });

  it('rejects editing a resume owned by another user', async () => {
    const owner = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(owner.id);
    const original = await createResumeAction('Original');

    vi.mocked(getCurrentUserId).mockResolvedValue(attacker.id);
    await expect(editResumeAction(original.id, 'hacked', [])).rejects.toThrow('Not authorized');
  });

  it('rejects forking a resume owned by another user', async () => {
    const owner = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(owner.id);
    const original = await createResumeAction('Original');

    vi.mocked(getCurrentUserId).mockResolvedValue(attacker.id);
    await expect(forkResumeAction(original.id, 'hacked', [])).rejects.toThrow('Not authorized');
  });
});
