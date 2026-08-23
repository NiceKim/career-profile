import { prisma } from '@/lib/prisma';

export async function getObjectDashboard(userId: string) {
  const versions = await prisma.objectVersion.findMany({
    where: { ownerUserId: userId },
    orderBy: { versionNumber: 'asc' },
    include: {
      resumeVersionItems: { include: { resumeVersion: true } },
    },
  });

  const groups = new Map<string, typeof versions>();
  for (const v of versions) {
    const group = groups.get(v.rootVersionId) ?? [];
    group.push(v);
    groups.set(v.rootVersionId, group);
  }

  return Array.from(groups.entries()).map(([rootVersionId, group]) => ({
    rootVersionId,
    type: group[0].type,
    versions: group.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      body: v.body,
      tags: v.tags,
      usedInResumeNames: v.resumeVersionItems.map((item) => item.resumeVersion.name),
    })),
  }));
}
