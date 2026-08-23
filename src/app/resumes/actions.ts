'use server';

import { getCurrentUserId } from '@/lib/session';
import { createResumeFromScratch, editResume, forkResume } from '@/lib/resumes/versioning';
import type { ObjectType } from '@/lib/objects/schemas';

type SectionInput = {
  sectionType: ObjectType;
  order: number;
  items: Array<{ objectVersionId: string; order: number }>;
};

export async function createResumeAction(name: string, sections: SectionInput[] = []) {
  const userId = await getCurrentUserId();
  const resume = await createResumeFromScratch(userId, name, sections);
  return { id: resume.id };
}

export async function editResumeAction(
  existingVersionId: string,
  name: string | undefined,
  sections: SectionInput[]
) {
  const userId = await getCurrentUserId();
  const resume = await editResume(userId, existingVersionId, name, sections);
  return { id: resume.id };
}

export async function forkResumeAction(
  sourceVersionId: string,
  newName: string | undefined,
  sections: SectionInput[]
) {
  const userId = await getCurrentUserId();
  const resume = await forkResume(userId, sourceVersionId, newName, sections);
  return { id: resume.id };
}
