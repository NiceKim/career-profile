import { prisma } from '@/lib/prisma';

export async function getLatestVersionsForUser(userId: string) {
  const versions = await prisma.resumeVersion.findMany({
    where: { ownerUserId: userId },
    orderBy: { createdAt: 'desc' },
  });
  const seenRoots = new Set<string>();
  const latest = [];
  for (const v of versions) {
    if (!seenRoots.has(v.rootVersionId)) {
      seenRoots.add(v.rootVersionId);
      latest.push(v);
    }
  }
  return latest;
}

export async function getResumeVersionWithContent(userId: string, id: string) {
  const resume = await prisma.resumeVersion.findUnique({
    where: { id },
    include: { sections: true, items: { include: { objectVersion: true } } },
  });
  if (!resume) throw new Error('Resume version not found');
  if (resume.ownerUserId !== userId) throw new Error('Not authorized');

  // Section membership isn't stored on the item — match by the referenced object's type.
  const sections = [...resume.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      ...section,
      items: resume.items
        .filter((item) => item.objectVersion.type === section.sectionType)
        .sort((a, b) => a.order - b.order),
    }));

  return { ...resume, sections };
}

export async function getResumeForest(userId: string) {
  const versions = await prisma.resumeVersion.findMany({ where: { ownerUserId: userId } });

  // Map every version id to the rootVersionId of the tree it belongs to,
  // so a cross-tree parentVersionId can be resolved back to a tree.
  const idToRoot = new Map(versions.map((v) => [v.id, v.rootVersionId]));

  const trees = new Map<string, typeof versions>();
  for (const v of versions) {
    const group = trees.get(v.rootVersionId) ?? [];
    group.push(v);
    trees.set(v.rootVersionId, group);
  }

  return Array.from(trees.entries()).map(([rootVersionId, group]) => {
    const head = group.reduce((latest, v) => (v.createdAt > latest.createdAt ? v : latest));
    const forkedFromRootVersionId = head.parentVersionId
      ? idToRoot.get(head.parentVersionId) ?? null
      : null;

    return {
      rootVersionId,
      headVersionId: head.id,
      name: head.name,
      forkedFromRootVersionId,
    };
  });
}
