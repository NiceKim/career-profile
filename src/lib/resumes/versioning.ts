import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { ObjectType } from '../objects/schemas';

type SectionInput = {
  sectionType: ObjectType;
  order: number;
  items: Array<{ objectVersionId: string; order: number }>;
};

export async function createResumeFromScratch(userId: string, name: string, sections: SectionInput[] = []) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Resume title is required');

  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: id,
      parentVersionId: null,
      ownerUserId: userId,
      name: trimmedName,
      sections: {
        create: sections.map((s) => ({ sectionType: s.sectionType, order: s.order })),
      },
      items: {
        create: sections.flatMap((s) =>
          s.items.map((it) => ({ objectVersionId: it.objectVersionId, order: it.order }))
        ),
      },
    },
    include: { sections: true, items: { include: { objectVersion: true } } },
  });
}

export async function isHeadVersion(resumeVersionId: string): Promise<boolean> {
  const version = await prisma.resumeVersion.findUniqueOrThrow({ where: { id: resumeVersionId } });
  const latest = await prisma.resumeVersion.findFirst({
    where: { rootVersionId: version.rootVersionId },
    orderBy: { createdAt: 'desc' },
  });
  return latest?.id === resumeVersionId;
}

export async function editResume(
  userId: string,
  existingVersionId: string,
  name: string | undefined,
  sections: SectionInput[]
) {
  const existing = await prisma.resumeVersion.findUnique({ where: { id: existingVersionId } });
  if (!existing) throw new Error('Resume version not found');
  if (existing.ownerUserId !== userId) throw new Error('Not authorized');

  const trimmedName = (name ?? existing.name).trim();
  if (!trimmedName) throw new Error('Resume title is required');

  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: existing.rootVersionId,
      parentVersionId: existing.parentVersionId,
      ownerUserId: userId,
      name: trimmedName,
      sections: {
        create: sections.map((s) => ({ sectionType: s.sectionType, order: s.order })),
      },
      items: {
        create: sections.flatMap((s) =>
          s.items.map((it) => ({ objectVersionId: it.objectVersionId, order: it.order }))
        ),
      },
    },
    include: { sections: true, items: { include: { objectVersion: true } } },
  });
}

export async function forkResume(
  userId: string,
  sourceVersionId: string,
  newName: string | undefined,
  sections: SectionInput[]
) {
  // sections is whatever the user has in the fork form when they submit — the caller
  // (the edit page) is responsible for reading the source and pre-filling the form with
  // it; this function doesn't copy content itself, so it never writes a version the user
  // never actually confirmed.
  const source = await prisma.resumeVersion.findUnique({ where: { id: sourceVersionId } });
  if (!source) throw new Error('Resume version not found');
  if (source.ownerUserId !== userId) throw new Error('Not authorized');

  const trimmedName = (newName ?? `Fork of ${source.name}`).trim();
  if (!trimmedName) throw new Error('Resume title is required');

  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: id,
      parentVersionId: source.id,
      ownerUserId: userId,
      name: trimmedName,
      sections: {
        create: sections.map((s) => ({ sectionType: s.sectionType, order: s.order })),
      },
      items: {
        create: sections.flatMap((s) =>
          s.items.map((it) => ({ objectVersionId: it.objectVersionId, order: it.order }))
        ),
      },
    },
    include: { sections: true, items: { include: { objectVersion: true } } },
  });
}
