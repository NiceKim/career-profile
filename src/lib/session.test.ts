import { describe, it, expect, vi } from 'vitest';

vi.mock('./auth', () => ({
  auth: vi.fn(),
}));

import { auth } from './auth';
import { getCurrentUserId } from './session';

describe('getCurrentUserId', () => {
  it('returns the user id from an active session', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any);
    expect(await getCurrentUserId()).toBe('user-1');
  });

  it('throws when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(getCurrentUserId()).rejects.toThrow('Not authenticated');
  });
});
