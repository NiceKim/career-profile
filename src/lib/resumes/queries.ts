import { prisma } from '@/lib/prisma';

export async function getLatestVersionsForUser(userId: string) {
  const resumes = await prisma.resume.findMany({
    where: { ownerUserId: userId },
    include: { revisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return resumes.map((r) => r.revisions[0]);
}

export async function getResumeTreeHistory(userId: string, resumeId: string) {
  return prisma.resumeRevision.findMany({
    where: { resumeId, resume: { ownerUserId: userId } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getResumeVersionWithContent(userId: string, resumeRevisionId: string) {
  const revision = await prisma.resumeRevision.findUnique({
    where: { id: resumeRevisionId },
    include: {
      resume: true,
      sections: {
        orderBy: { order: 'asc' },
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: { objectRevision: { include: { objectVariation: { include: { object: true } } } } },
          },
        },
      },
    },
  });
  if (!revision) throw new Error('Resume revision not found');
  if (revision.resume.ownerUserId !== userId) throw new Error('Not authorized');

  return {
    id: revision.id,
    resumeId: revision.resumeId,
    name: revision.resume.name,
    createdAt: revision.createdAt,
    // Section membership is a real FK now — no more matching items to sections by
    // the referenced object's type at render time.
    sections: revision.sections.map((section) => ({
      id: section.id,
      sectionType: section.sectionType,
      items: section.items.map((item) => ({
        id: item.id,
        objectRevisionId: item.objectRevisionId,
        objectRevision: {
          id: item.objectRevision.id,
          objectId: item.objectRevision.objectVariation.object.id,
          body: item.objectRevision.body,
          fields: item.objectRevision.fields,
          tags: item.objectRevision.objectVariation.tags,
          objectVariationId: item.objectRevision.objectVariationId,
          versionNumber: item.objectRevision.versionNumber,
          createdAt: item.objectRevision.createdAt,
        },
      })),
    })),
  };
}

export async function getResumeForest(userId: string) {
  const resumes = await prisma.resume.findMany({
    where: { ownerUserId: userId },
    include: { revisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  // `parentVersionId` points straight at the source Resume's id now, so unlike the
  // old cross-tree-pointer-to-a-specific-version design, there's no id-to-tree
  // resolution needed here at all.
  return resumes.map((resume) => {
    const head = resume.revisions[0];
    return {
      resumeId: resume.id,
      headVersionId: head.id,
      name: resume.name,
      headCreatedAt: head.createdAt,
      forkedFromResumeId: resume.parentVersionId,
    };
  });
}
