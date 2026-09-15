'use server';

import { getCurrentUserId } from '@/lib/session';
import { createObject, editObjectRevision, forkObjectVariation } from '@/lib/objects/versioning';
import { listLatestObjectsForUser, getObjectHistory } from '@/lib/objects/queries';
import type { ObjectType } from '@/lib/objects/schemas';

export async function createObjectAction(type: ObjectType, fields: unknown, body: string, tags: string[] = []) {
  const userId = await getCurrentUserId();
  return createObject(userId, type, fields, body, tags);
}

export async function editObjectAction(existingRevisionId: string, fields: unknown, body: string, tags: string[] = []) {
  const userId = await getCurrentUserId();
  return editObjectRevision(userId, existingRevisionId, fields, body, tags);
}

export async function forkObjectVariationAction(objectId: string, fields: unknown, body: string, tags: string[] = []) {
  const userId = await getCurrentUserId();
  return forkObjectVariation(userId, objectId, fields, body, tags);
}

export async function listLatestObjectsAction(type?: ObjectType) {
  const userId = await getCurrentUserId();
  return listLatestObjectsForUser(userId, type);
}

export async function getObjectHistoryAction(objectVariationId: string) {
  const userId = await getCurrentUserId();
  return getObjectHistory(userId, objectVariationId);
}
