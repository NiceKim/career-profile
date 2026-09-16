import { prisma } from '@/lib/prisma';
import { validateObjectFields, type ObjectType } from './schemas';

export async function createObject(
  userId: string,
  type: ObjectType,
  fields: unknown,
  body: string,
  tags: string[] = []
) {
  const validated = validateObjectFields(type, fields);
  const object = await prisma.resumeObject.create({
    data: {
      ownerUserId: userId,
      type,
      variations: {
        create: [{ tags, revisions: { create: [{ fields: validated, body, versionNumber: 1 }] } }],
      },
    },
    include: { variations: { include: { revisions: true } } },
  });
  const variation = object.variations[0];
  const revision = variation.revisions[0];
  return {
    id: revision.id,
    objectId: object.id,
    objectVariationId: variation.id,
    versionNumber: revision.versionNumber,
    fields: revision.fields,
    body: revision.body,
    tags: variation.tags,
    createdAt: revision.createdAt,
  };
}

export async function editObjectRevision(
  userId: string,
  existingRevisionId: string,
  fields: unknown,
  body: string,
  tags: string[] = []
) {
  const existing = await prisma.objectRevision.findUnique({
    where: { id: existingRevisionId },
    include: { objectVariation: { include: { object: true } } },
  });
  if (!existing) throw new Error('Object revision not found');
  if (existing.objectVariation.object.ownerUserId !== userId) throw new Error('Not authorized');

  const type = existing.objectVariation.object.type as ObjectType;
  const validated = validateObjectFields(type, fields);
  const latest = await prisma.objectRevision.findFirst({
    where: { objectVariationId: existing.objectVariationId },
    orderBy: { versionNumber: 'desc' },
  });

  // Tags live on the variation now (shared by every revision in it), so editing
  // tags updates the variation in place rather than creating tag history.
  const [, revision] = await prisma.$transaction([
    prisma.objectVariation.update({ where: { id: existing.objectVariationId }, data: { tags } }),
    prisma.objectRevision.create({
      data: {
        objectVariationId: existing.objectVariationId,
        fields: validated,
        body,
        versionNumber: latest!.versionNumber + 1,
      },
    }),
  ]);

  return {
    id: revision.id,
    objectId: existing.objectVariation.object.id,
    objectVariationId: existing.objectVariationId,
    versionNumber: revision.versionNumber,
    fields: revision.fields,
    body: revision.body,
    tags,
    createdAt: revision.createdAt,
  };
}

export async function forkObjectVariation(
  userId: string,
  objectId: string,
  fields: unknown,
  body: string,
  tags: string[] = []
) {
  const object = await prisma.resumeObject.findUnique({ where: { id: objectId } });
  if (!object) throw new Error('Object not found');
  if (object.ownerUserId !== userId) throw new Error('Not authorized');

  const validated = validateObjectFields(object.type as ObjectType, fields);
  const variation = await prisma.objectVariation.create({
    data: { objectId, tags, revisions: { create: [{ fields: validated, body, versionNumber: 1 }] } },
    include: { revisions: true },
  });
  const revision = variation.revisions[0];
  return {
    id: revision.id,
    objectId,
    objectVariationId: variation.id,
    versionNumber: revision.versionNumber,
    fields: revision.fields,
    body: revision.body,
    tags,
    createdAt: revision.createdAt,
  };
}
