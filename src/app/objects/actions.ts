'use server';

import { getCurrentUserId } from '@/lib/session';
import { createObjectVersion, editObjectVersion } from '@/lib/objects/versioning';
import { listLatestObjectsForUser, getObjectHistory } from '@/lib/objects/queries';
import type { ObjectType } from '@/lib/objects/schemas';

// Returns the full saved version (not just its id) so callers can update their local
// display state immediately instead of holding onto stale pre-edit fields/body/tags.
export async function createObjectAction(type: ObjectType, fields: unknown, body: string, tags: string[] = []) {
  const userId = await getCurrentUserId();
  const version = await createObjectVersion(userId, type, fields, body, tags);
  return {
    id: version.id,
    rootVersionId: version.rootVersionId,
    versionNumber: version.versionNumber,
    fields: version.fields,
    body: version.body,
    tags: version.tags,
    createdAt: version.createdAt,
  };
}

export async function editObjectAction(existingVersionId: string, fields: unknown, body: string, tags: string[] = []) {
  const userId = await getCurrentUserId();
  const version = await editObjectVersion(userId, existingVersionId, fields, body, tags);
  return {
    id: version.id,
    rootVersionId: version.rootVersionId,
    versionNumber: version.versionNumber,
    fields: version.fields,
    body: version.body,
    tags: version.tags,
    createdAt: version.createdAt,
  };
}

export async function listLatestObjectsAction(type?: ObjectType) {
  const userId = await getCurrentUserId();
  return listLatestObjectsForUser(userId, type);
}

export async function getObjectHistoryAction(rootVersionId: string) {
  const userId = await getCurrentUserId();
  return getObjectHistory(userId, rootVersionId);
}
