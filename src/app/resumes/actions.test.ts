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

    const stored = await prisma.resumeRevision.findUnique({ where: { id: result.id }, include: { resume: true } });
    expect(stored?.resume.ownerUserId).toBe(user.id);
  });

  it('fork action creates a new resume linked to the source', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const original = await createResumeAction('Original');

    const fork = await forkResumeAction(original.id, 'Forked', []);

    const stored = await prisma.resumeRevision.findUnique({ where: { id: fork.id }, include: { resume: true } });
    const originalStored = await prisma.resumeRevision.findUnique({ where: { id: original.id } });
    expect(stored?.resume.parentVersionId).toBe(originalStored?.resumeId);
  });

  it('edit action creates a new revision on the same resume', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const original = await createResumeAction('Original');

    const edited = await editResumeAction(original.id, 'Renamed', []);

    const stored = await prisma.resumeRevision.findUnique({ where: { id: edited.id }, include: { resume: true } });
    expect(stored?.resume.name).toBe('Renamed');
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
