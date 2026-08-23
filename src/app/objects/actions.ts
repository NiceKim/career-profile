'use server';

import { getCurrentUserId } from '@/lib/session';
import { createObjectVersion, editObjectVersion } from '@/lib/objects/versioning';
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
