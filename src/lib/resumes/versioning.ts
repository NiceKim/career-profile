import { prisma } from '@/lib/prisma';
import type { ObjectType } from '../objects/schemas';

type SectionInput = {
  sectionType: ObjectType;
  order: number;
  items: Array<{ objectRevisionId: string; order: number }>;
};

// Cross-checks every item's underlying object type against the section it's nested
// under — the FK makes membership real, so a type mismatch is now a representable
// (and therefore checked) state, where the old type-matching-at-render design made
// it structurally impossible to even ask the question.
async function validateSectionItemTypes(sections: SectionInput[]) {
  const objectRevisionIds = sections.flatMap((s) => s.items.map((it) => it.objectRevisionId));
  if (objectRevisionIds.length === 0) return;

  const revisions = await prisma.objectRevision.findMany({
    where: { id: { in: objectRevisionIds } },
    include: { objectVariation: { include: { object: true } } },
  });
  const typeById = new Map(revisions.map((r) => [r.id, r.objectVariation.object.type]));

  for (const section of sections) {
    for (const item of section.items) {
      const itemType = typeById.get(item.objectRevisionId);
      if (itemType !== section.sectionType) {
        throw new Error(
          `Object revision ${item.objectRevisionId} has type ${itemType}, but section requires ${section.sectionType}`
        );
      }
    }
  }
}

function toSectionsCreate(sections: SectionInput[]) {
  return sections.map((s) => ({
    sectionType: s.sectionType,
    order: s.order,
    items: { create: s.items.map((it) => ({ objectRevisionId: it.objectRevisionId, order: it.order })) },
  }));
}

function toResult(
  resume: { id: string; parentVersionId: string | null; name: string },
  revision: {
    id: string;
    versionNumber: number;
    createdAt: Date;
    sections: Array<{
      id: string;
      sectionType: ObjectType;
      order: number;
      items: Array<{ id: string; objectRevisionId: string; order: number }>;
    }>;
  }
) {
  return {
    id: revision.id,
    resumeId: resume.id,
    parentVersionId: resume.parentVersionId,
    name: resume.name,
    versionNumber: revision.versionNumber,
    createdAt: revision.createdAt,
    sections: revision.sections,
    items: revision.sections.flatMap((s) => s.items),
  };
}

export async function createResumeFromScratch(userId: string, name: string, sections: SectionInput[] = []) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Resume title is required');
  await validateSectionItemTypes(sections);

  const resume = await prisma.resume.create({
    data: {
      ownerUserId: userId,
      name: trimmedName,
      parentVersionId: null,
      revisions: { create: [{ versionNumber: 1, sections: { create: toSectionsCreate(sections) } }] },
    },
    include: { revisions: { include: { sections: { include: { items: true } } } } },
  });
  return toResult(resume, resume.revisions[0]);
}

export async function isHeadVersion(resumeRevisionId: string): Promise<boolean> {
  const revision = await prisma.resumeRevision.findUniqueOrThrow({ where: { id: resumeRevisionId } });
  const latest = await prisma.resumeRevision.findFirst({
    where: { resumeId: revision.resumeId },
    orderBy: { createdAt: 'desc' },
  });
  return latest?.id === resumeRevisionId;
}

export async function editResume(
  userId: string,
  existingRevisionId: string,
  name: string | undefined,
  sections: SectionInput[]
) {
  const existing = await prisma.resumeRevision.findUnique({
    where: { id: existingRevisionId },
    include: { resume: true },
  });
  if (!existing) throw new Error('Resume revision not found');
  if (existing.resume.ownerUserId !== userId) throw new Error('Not authorized');

  const trimmedName = (name ?? existing.resume.name).trim();
  if (!trimmedName) throw new Error('Resume title is required');
  await validateSectionItemTypes(sections);

  // `name` lives on the Resume identity row now, not per revision — renaming
  // relabels every past revision too, it isn't versioned history anymore.
  if (name !== undefined) {
    await prisma.resume.update({ where: { id: existing.resumeId }, data: { name: trimmedName } });
  }

  const latest = await prisma.resumeRevision.findFirst({
    where: { resumeId: existing.resumeId },
    orderBy: { versionNumber: 'desc' },
  });
  const revision = await prisma.resumeRevision.create({
    data: {
      resumeId: existing.resumeId,
      versionNumber: latest!.versionNumber + 1,
      sections: { create: toSectionsCreate(sections) },
    },
    include: { sections: { include: { items: true } } },
  });
  return toResult({ id: existing.resumeId, parentVersionId: existing.resume.parentVersionId, name: trimmedName }, revision);
}

export async function forkResume(
  userId: string,
  sourceRevisionId: string,
  newName: string | undefined,
  sections: SectionInput[]
) {
  // sections is whatever the user has in the fork form when they submit — the caller
  // (the fork page) is responsible for reading the source and pre-filling the form with
  // it; this function doesn't copy content itself, so it never writes a revision the user
  // never actually confirmed.
  const source = await prisma.resumeRevision.findUnique({
    where: { id: sourceRevisionId },
    include: { resume: true },
  });
  if (!source) throw new Error('Resume revision not found');
  if (source.resume.ownerUserId !== userId) throw new Error('Not authorized');

  const trimmedName = (newName ?? `Fork of ${source.resume.name}`).trim();
  if (!trimmedName) throw new Error('Resume title is required');
  await validateSectionItemTypes(sections);

  const resume = await prisma.resume.create({
    data: {
      ownerUserId: userId,
      name: trimmedName,
      parentVersionId: source.resumeId,
      revisions: { create: [{ versionNumber: 1, sections: { create: toSectionsCreate(sections) } }] },
    },
    include: { revisions: { include: { sections: { include: { items: true } } } } },
  });
  return toResult(resume, resume.revisions[0]);
}
