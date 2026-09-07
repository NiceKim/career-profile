type ContextObject = { type: string; body: string; fields: unknown };
type ContextProfile = { fullName: string; location: string } | null;

export function buildCareerContext(objects: ContextObject[], profile: ContextProfile): string {
  const header = profile
    ? `Candidate: ${profile.fullName} (${profile.location})`
    : 'Candidate profile not set.';

  if (objects.length === 0) {
    return `${header}\n\nNo objects yet — the candidate has not added any resume content.`;
  }

  const byType = new Map<string, ContextObject[]>();
  for (const obj of objects) {
    const group = byType.get(obj.type) ?? [];
    group.push(obj);
    byType.set(obj.type, group);
  }

  const sections = Array.from(byType.entries())
    .map(([type, items]) => {
      const lines = items.map((o) => `- ${o.body} (fields: ${JSON.stringify(o.fields)})`);
      return `## ${type}\n${lines.join('\n')}`;
    })
    .join('\n\n');

  return `${header}\n\n${sections}`;
}
