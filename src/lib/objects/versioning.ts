import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { validateObjectFields, type ObjectType } from './schemas';

export async function createObjectVersion(
  userId: string,
  type: ObjectType,
  fields: unknown,
  body: string,
  tags: string[] = []
) {
  const validated = validateObjectFields(type, fields);
  const id = randomUUID();
  return prisma.objectVersion.create({
    data: {
      id,
      rootVersionId: id,
      ownerUserId: userId,
      type,
      versionNumber: 1,
      fields: validated,
      body,
      tags,
    },
  });
}

export async function editObjectVersion(
  userId: string,
  existingVersionId: string,
  fields: unknown,
  body: string,
  tags: string[] = []
) {
  const existing = await prisma.objectVersion.findUnique({ where: { id: existingVersionId } });
  if (!existing) throw new Error('Object version not found');
  if (existing.ownerUserId !== userId) throw new Error('Not authorized');

  const validated = validateObjectFields(existing.type as ObjectType, fields);
  const id = randomUUID();
  return prisma.objectVersion.create({
    data: {
      id,
      rootVersionId: existing.rootVersionId,
      ownerUserId: userId,
      type: existing.type,
      versionNumber: existing.versionNumber + 1,
      fields: validated,
      body,
      tags,
    },
  });
}
