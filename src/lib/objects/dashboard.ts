import { prisma } from '@/lib/prisma';

export async function getObjectDashboard(userId: string) {
  const objects = await prisma.resumeObject.findMany({
    where: { ownerUserId: userId },
    include: {
      variations: {
        include: {
          revisions: {
            orderBy: { versionNumber: 'asc' },
            include: {
              sectionObjects: {
                include: { resumeSection: { include: { resumeRevision: { include: { resume: true } } } } },
              },
            },
          },
        },
      },
    },
  });

  return objects.map((object) => ({
    objectId: object.id,
    type: object.type,
    variations: object.variations.map((variation) => ({
      objectVariationId: variation.id,
      tags: variation.tags,
      revisions: variation.revisions.map((revision) => ({
        id: revision.id,
        versionNumber: revision.versionNumber,
        body: revision.body,
        fields: revision.fields,
        createdAt: revision.createdAt,
        tags: variation.tags,
        usedInResumeNames: revision.sectionObjects.map((so) => so.resumeSection.resumeRevision.resume.name),
      })),
    })),
  }));
}
