import { prisma } from '@/lib/prisma';
import type { ObjectType } from './schemas';

function toSummary(revision: {
  id: string;
  fields: unknown;
  body: string;
  versionNumber: number;
  createdAt: Date;
  objectVariation: { id: string; tags: string[]; object: { id: string; type: ObjectType } };
}) {
  return {
    id: revision.id,
    objectId: revision.objectVariation.object.id,
    objectVariationId: revision.objectVariation.id,
    type: revision.objectVariation.object.type,
    versionNumber: revision.versionNumber,
    fields: revision.fields,
    body: revision.body,
    tags: revision.objectVariation.tags,
    createdAt: revision.createdAt,
  };
}

export async function listObjectsForUser(userId: string, type?: ObjectType) {
  const revisions = await prisma.objectRevision.findMany({
    where: { objectVariation: { object: { ownerUserId: userId, ...(type ? { type } : {}) } } },
    orderBy: { createdAt: 'desc' },
    include: { objectVariation: { include: { object: true } } },
  });
  return revisions.map(toSummary);
}

export async function listLatestObjectsForUser(userId: string, type?: ObjectType) {
  const revisions = await listObjectsForUser(userId, type);
  const seenVariations = new Set<string>();
  const latest = [];
  for (const r of revisions) {
    if (!seenVariations.has(r.objectVariationId)) {
      seenVariations.add(r.objectVariationId);
      latest.push(r);
    }
  }
  return latest;
}

export async function getObjectHistory(userId: string, objectVariationId: string) {
  const revisions = await prisma.objectRevision.findMany({
    where: { objectVariationId, objectVariation: { object: { ownerUserId: userId } } },
    orderBy: { versionNumber: 'asc' },
    include: { objectVariation: { include: { object: true } } },
  });
  return revisions.map(toSummary);
}

export async function listTagsForUser(userId: string): Promise<string[]> {
  const variations = await prisma.objectVariation.findMany({
    where: { object: { ownerUserId: userId } },
    select: { tags: true },
  });
  const tags = new Set<string>();
  for (const v of variations) {
    for (const tag of v.tags) tags.add(tag);
  }
  return Array.from(tags);
}
