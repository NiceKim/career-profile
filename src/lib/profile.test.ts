import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../test/db';
import { getProfile, upsertProfile } from './profile';

describe('profile', () => {
  beforeEach(resetDb);

  it('creates then updates the same profile row in place (live, unversioned)', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });

    const created = await upsertProfile(user.id, {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '555-0100',
      location: 'London',
      links: { linkedin: 'https://linkedin.com/in/ada' },
    });

    const updated = await upsertProfile(user.id, {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '555-0101',
      location: 'London',
      links: { linkedin: 'https://linkedin.com/in/ada' },
    });

    expect(updated.id).toBe(created.id);
    expect((await getProfile(user.id))?.phone).toBe('555-0101');
  });
});
