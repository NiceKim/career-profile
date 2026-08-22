import { prisma } from '@/lib/prisma';
import type { ObjectType } from './schemas';

export async function listObjectsForUser(userId: string, type?: ObjectType) {
  return prisma.objectVersion.findMany({
    where: {
      ownerUserId: userId,
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getObjectHistory(userId: string, rootVersionId: string) {
  return prisma.objectVersion.findMany({
    where: { ownerUserId: userId, rootVersionId },
    orderBy: { versionNumber: 'asc' },
  });
}

export async function listTagsForUser(userId: string): Promise<string[]> {
  const versions = await prisma.objectVersion.findMany({
    where: { ownerUserId: userId },
    select: { tags: true },
  });
  const tags = new Set<string>();
  for (const v of versions) {
    for (const tag of v.tags) tags.add(tag);
  }
  return Array.from(tags);
}
