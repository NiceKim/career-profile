'use server';

import { getCurrentUserId } from '@/lib/session';
import { createObjectVersion, editObjectVersion } from '@/lib/objects/versioning';
import { listLatestObjectsForUser, getObjectHistory } from '@/lib/objects/queries';
import type { ObjectType } from '@/lib/objects/schemas';

export async function createObjectAction(type: ObjectType, fields: unknown, body: string, tags: string[] = []) {
  const userId = await getCurrentUserId();
  const version = await createObjectVersion(userId, type, fields, body, tags);
  return { id: version.id };
}

export async function editObjectAction(existingVersionId: string, fields: unknown, body: string, tags: string[] = []) {
  const userId = await getCurrentUserId();
  const version = await editObjectVersion(userId, existingVersionId, fields, body, tags);
  return { id: version.id };
}

export async function listLatestObjectsAction(type?: ObjectType) {
  const userId = await getCurrentUserId();
  return listLatestObjectsForUser(userId, type);
}

export async function getObjectHistoryAction(rootVersionId: string) {
  const userId = await getCurrentUserId();
  return getObjectHistory(userId, rootVersionId);
}
