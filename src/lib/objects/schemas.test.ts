import { describe, it, expect } from 'vitest';
import { validateObjectFields } from './schemas';

describe('validateObjectFields', () => {
  it('accepts valid WORK_EXPERIENCE fields', () => {
    const result = validateObjectFields('WORK_EXPERIENCE', {
      company: 'Acme',
      title: 'Engineer',
      location: 'Remote',
      startDate: '2020-01',
      endDate: '2022-01',
    });
    expect(result.company).toBe('Acme');
  });

  it('rejects WORK_EXPERIENCE fields missing company', () => {
    expect(() =>
      validateObjectFields('WORK_EXPERIENCE', { title: 'Engineer' })
    ).toThrow();
  });

  it('accepts valid SKILLS fields', () => {
    const result = validateObjectFields('SKILLS', { category: 'Languages' });
    expect(result.category).toBe('Languages');
  });
});
