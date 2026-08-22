// test/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from './db';

describe('schema', () => {
  beforeEach(resetDb);

  it('creates and reads a user', async () => {
    const user = await prisma.user.create({
      data: { email: 'a@example.com', passwordHash: 'hash' },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe('a@example.com');
  });
});
