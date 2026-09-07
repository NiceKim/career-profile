import { describe, it, expect } from 'vitest';
import { buildCareerContext } from './context';

describe('buildCareerContext', () => {
  it('includes profile name and every object body, grouped by type', () => {
    const context = buildCareerContext(
      [
        { type: 'SKILLS', body: 'Python, TypeScript', fields: { category: 'Languages' } },
        { type: 'WORK_EXPERIENCE', body: 'Led backend team', fields: { company: 'Acme' } },
      ],
      { fullName: 'Ada Lovelace', location: 'London' }
    );

    expect(context).toContain('Ada Lovelace');
    expect(context).toContain('SKILLS');
    expect(context).toContain('Python, TypeScript');
    expect(context).toContain('WORK_EXPERIENCE');
    expect(context).toContain('Led backend team');
  });

  it('handles a missing profile gracefully', () => {
    const context = buildCareerContext([], null);
    expect(context).toContain('No objects yet');
  });
});
