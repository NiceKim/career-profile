'use server';

import { getCurrentUserId } from '@/lib/session';
import { createResumeFromScratch, editResume, forkResume } from '@/lib/resumes/versioning';
import type { ObjectType } from '@/lib/objects/schemas';

type SectionInput = {
  sectionType: ObjectType;
  order: number;
  items: Array<{ objectRevisionId: string; order: number }>;
};

export async function createResumeAction(name: string, sections: SectionInput[] = []) {
  const userId = await getCurrentUserId();
  const resume = await createResumeFromScratch(userId, name, sections);
  return { id: resume.id };
}

export async function editResumeAction(
  existingRevisionId: string,
  name: string | undefined,
  sections: SectionInput[]
) {
  const userId = await getCurrentUserId();
  const resume = await editResume(userId, existingRevisionId, name, sections);
  return { id: resume.id };
}

export async function forkResumeAction(
  sourceRevisionId: string,
  newName: string | undefined,
  sections: SectionInput[]
) {
  const userId = await getCurrentUserId();
  const resume = await forkResume(userId, sourceRevisionId, newName, sections);
  return { id: resume.id };
}
