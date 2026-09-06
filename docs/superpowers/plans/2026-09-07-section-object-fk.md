# Resume Section → Item Real FK (SectionObject) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ResumeVersionItem` (which references `resumeVersionId` directly and relies on matching the referenced object's `type` to a section's `sectionType` at render time) with `SectionObject`, which has a real FK to `ResumeVersionSection` — making `resume → section → item` an actual FK chain instead of an implicit, unenforced convention.

**Architecture:** `SectionObject.resumeVersionSectionId` is the only path from an item to its resume (no denormalized `resumeVersionId` shortcut — confirmed negligible query cost at this app's scale, since every existing read already fetches sections and items together). Write-time validation now rejects a resume write if an item's object type doesn't match its section's `sectionType`, since the FK makes that mismatch a representable state that previously couldn't occur structurally.

**Tech Stack:** Next.js (App Router, Server Actions), TypeScript, Prisma + Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-resume-version-control-design.md` (Data Model ER diagram, Key Semantics, Core Flows, updated 2026-09-07)

## Global Constraints

- Every mutation/query filters by the authenticated `ownerUserId` — a client-supplied resume/object ID is always checked for ownership before use.
- Every save is an immutable insert, never an update.
- TDD: write the failing test first, then the minimal implementation, for every task below.

## Sequencing note

This plan touches `src/lib/objects/dashboard.ts`, which the separate `2026-09-06-resume-vc-spike-1.5.md` plan (Task 3) also rewrites. **Run this plan first** if both are still pending — Task 4 below is written against `dashboard.ts` as it exists today (pre-Spike-1.5). If Spike 1.5's Task 3 has already been executed by the time this runs, its `getObjectDashboard`/`getVariationDetail` already use `resumeVersionItems`/`item.resumeVersion.name` — adapt Task 4 below to `sectionObjects`/`item.section.resumeVersion.name` on top of that version of the file instead of replacing it wholesale.

---

### Task 1: Schema migration — `SectionObject` replaces `ResumeVersionItem`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_section_object/migration.sql`

**Interfaces:**
- Produces: `SectionObject` model (`id`, `resumeVersionSectionId`, `objectVersionId`, `order`), `@@unique([resumeVersionSectionId, order])`. `ResumeVersionSection.items: SectionObject[]`. `ObjectVersion.sectionObjects: SectionObject[]` (renamed from `resumeVersionItems`). `ResumeVersion` no longer has a direct `items` relation. Consumed by Task 2 (versioning), Task 3 (queries), Task 4 (object dashboard).

- [ ] **Step 1: Update the schema**

In `prisma/schema.prisma`:

Replace `ResumeVersionSection`:

```prisma
model ResumeVersionSection {
  id              String        @id @default(uuid())
  resumeVersionId String
  resumeVersion   ResumeVersion @relation(fields: [resumeVersionId], references: [id])
  sectionType     ObjectType
  order           Int

  items SectionObject[]

  @@unique([resumeVersionId, sectionType])
  @@index([resumeVersionId])
}
```

Replace `ResumeVersionItem` with `SectionObject`:

```prisma
model SectionObject {
  id                     String               @id @default(uuid())
  resumeVersionSectionId String
  section                ResumeVersionSection @relation(fields: [resumeVersionSectionId], references: [id])
  objectVersionId        String
  objectVersion          ObjectVersion        @relation(fields: [objectVersionId], references: [id])
  order                  Int

  @@unique([resumeVersionSectionId, order])
  @@index([resumeVersionSectionId])
  @@index([objectVersionId])
}
```

In `model ResumeVersion`, remove the `items ResumeVersionItem[]` line (keep `sections ResumeVersionSection[]`).

In `model ObjectVersion`, rename the relation field:

```prisma
  sectionObjects SectionObject[]
```

(replacing `resumeVersionItems ResumeVersionItem[]`)

- [ ] **Step 2: Generate an empty migration to edit by hand**

Run: `npx prisma migrate dev --name section_object --create-only`

- [ ] **Step 3: Replace the generated SQL with a backfilling version**

Every existing `ResumeVersionItem` row's section is derivable today by matching its object's `type` to a `ResumeVersionSection` row with the same `resumeVersionId`. Any row where no such match exists is already an orphan under the old design (invisible in `getResumeVersionWithContent` today) and is correctly dropped rather than migrated. Overwrite the migration file's contents with:

```sql
-- CreateTable
CREATE TABLE "SectionObject" (
    "id" TEXT NOT NULL,
    "resumeVersionSectionId" TEXT NOT NULL,
    "objectVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "SectionObject_pkey" PRIMARY KEY ("id")
);

-- Backfill: match each old item to its section via the object's type, exactly what
-- getResumeVersionWithContent did at render time. Rows with no matching section were
-- already orphaned (invisible) under the old design and are intentionally not carried over.
INSERT INTO "SectionObject" ("id", "resumeVersionSectionId", "objectVersionId", "order")
SELECT ri."id", rs."id", ri."objectVersionId", ri."order"
FROM "ResumeVersionItem" ri
JOIN "ObjectVersion" ov ON ov."id" = ri."objectVersionId"
JOIN "ResumeVersionSection" rs ON rs."resumeVersionId" = ri."resumeVersionId" AND rs."sectionType" = ov."type";

DROP TABLE "ResumeVersionItem";

-- CreateIndex
CREATE INDEX "SectionObject_resumeVersionSectionId_idx" ON "SectionObject"("resumeVersionSectionId");

-- CreateIndex
CREATE INDEX "SectionObject_objectVersionId_idx" ON "SectionObject"("objectVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionObject_resumeVersionSectionId_order_key" ON "SectionObject"("resumeVersionSectionId", "order");

-- AddForeignKey
ALTER TABLE "SectionObject" ADD CONSTRAINT "SectionObject_resumeVersionSectionId_fkey" FOREIGN KEY ("resumeVersionSectionId") REFERENCES "ResumeVersionSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionObject" ADD CONSTRAINT "SectionObject_objectVersionId_fkey" FOREIGN KEY ("objectVersionId") REFERENCES "ObjectVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate dev`
Expected: `Your database is now in sync with your schema.` and the Prisma Client regenerates with `SectionObject` and `ObjectVersion.sectionObjects`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: replace ResumeVersionItem with SectionObject (real FK to section)"
```

---

### Task 2: `resumes/versioning.ts` — nest items under sections, validate type match

**Files:**
- Modify: `src/lib/resumes/versioning.ts`
- Modify: `src/lib/resumes/versioning.test.ts`

**Interfaces:**
- `createResumeFromScratch`/`editResume`/`forkResume` keep their existing signatures (`SectionInput[]` shape is unchanged — callers, including `ResumeForm.tsx`, need no changes). Their returned value's shape changes: items now come back nested under `sections[i].items`, not as a flat top-level `items` array.
- Produces: all three functions now reject with `Error('Object type mismatch: ...')` if any item's `objectVersion.type` doesn't match its section's `sectionType`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/resumes/versioning.test.ts`, replace the flat-items assertion:

```ts
    expect(fork.sections).toHaveLength(1);
    expect(fork.sections[0].items[0].objectVersionId).toBe(skill.id);
```

(replacing `expect(fork.items[0].objectVersionId).toBe(skill.id);`)

Add two new tests to the same `describe('resume versioning', ...)` block:

```ts
  it('rejects a resume write where an item\'s object type does not match its section', async () => {
    const user = await makeUser();
    const skill = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const sections = [
      { sectionType: 'EDUCATION', order: 0, items: [{ objectVersionId: skill.id, order: 0 }] },
    ];

    await expect(createResumeFromScratch(user.id, 'Mismatched', sections)).rejects.toThrow(
      'Object type mismatch'
    );
  });

  it('accepts a resume write where every item matches its section type', async () => {
    const user = await makeUser();
    const skill = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const sections = [
      { sectionType: 'SKILLS', order: 0, items: [{ objectVersionId: skill.id, order: 0 }] },
    ];

    const resume = await createResumeFromScratch(user.id, 'Matched', sections);

    expect(resume.sections[0].items[0].objectVersionId).toBe(skill.id);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/resumes/versioning.test.ts`
Expected: FAIL — `fork.sections[0].items` doesn't exist yet (items still come back flat), and there's no type-mismatch rejection.

- [ ] **Step 3: Implement**

Replace the full contents of `src/lib/resumes/versioning.ts`:

```ts
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { ObjectType } from '../objects/schemas';

type SectionInput = {
  sectionType: ObjectType;
  order: number;
  items: Array<{ objectVersionId: string; order: number }>;
};

// Every item's referenced object must be of the same type as the section it's nested under —
// the FK makes this a representable mismatch (unlike the old type-matching design, where it
// couldn't occur structurally), so it's checked once, here, before any write.
async function assertSectionTypesMatch(sections: SectionInput[]) {
  const allObjectVersionIds = sections.flatMap((s) => s.items.map((it) => it.objectVersionId));
  if (allObjectVersionIds.length === 0) return;

  const objectVersions = await prisma.objectVersion.findMany({
    where: { id: { in: allObjectVersionIds } },
    select: { id: true, type: true },
  });
  const typeById = new Map(objectVersions.map((ov) => [ov.id, ov.type]));

  for (const section of sections) {
    for (const item of section.items) {
      const actualType = typeById.get(item.objectVersionId);
      if (actualType !== section.sectionType) {
        throw new Error(
          `Object type mismatch: object ${item.objectVersionId} is ${actualType ?? 'unknown'}, but was placed in a ${section.sectionType} section`
        );
      }
    }
  }
}

function sectionsCreateInput(sections: SectionInput[]) {
  return sections.map((s) => ({
    sectionType: s.sectionType,
    order: s.order,
    items: { create: s.items.map((it) => ({ objectVersionId: it.objectVersionId, order: it.order })) },
  }));
}

const CONTENT_INCLUDE = { sections: { include: { items: { include: { objectVersion: true } } } } } as const;

export async function createResumeFromScratch(userId: string, name: string, sections: SectionInput[] = []) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Resume title is required');
  await assertSectionTypesMatch(sections);

  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: id,
      parentVersionId: null,
      ownerUserId: userId,
      name: trimmedName,
      sections: { create: sectionsCreateInput(sections) },
    },
    include: CONTENT_INCLUDE,
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
  await assertSectionTypesMatch(sections);

  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: existing.rootVersionId,
      parentVersionId: existing.parentVersionId,
      ownerUserId: userId,
      name: trimmedName,
      sections: { create: sectionsCreateInput(sections) },
    },
    include: CONTENT_INCLUDE,
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
  await assertSectionTypesMatch(sections);

  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: id,
      parentVersionId: source.id,
      ownerUserId: userId,
      name: trimmedName,
      sections: { create: sectionsCreateInput(sections) },
    },
    include: CONTENT_INCLUDE,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/resumes/versioning.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/resumes/versioning.ts src/lib/resumes/versioning.test.ts
git commit -m "feat: nest resume items under sections, validate object type matches section"
```

---

### Task 3: `resumes/queries.ts` — drop the type-matching reconstruction

**Files:**
- Modify: `src/lib/resumes/queries.ts`

**Interfaces:**
- `getResumeVersionWithContent`'s return shape is unchanged (`{ ...resume, sections: [{ ...section, items: [...] }] }`) — callers (`resumes/[id]/page.tsx`, `[id]/edit/page.tsx`, `[id]/fork/page.tsx`) need no changes.

No new tests needed — `queries.test.ts`'s existing `'returns full content with sections and items'` test already asserts through `content.sections[0].items[0].objectVersionId`, which this task must keep passing.

- [ ] **Step 1: Run the existing test to confirm current behavior**

Run: `npx vitest run src/lib/resumes/queries.test.ts`
Expected: PASS (this test already passes against the old code — it's the regression guard for this task, not a new failing test).

- [ ] **Step 2: Simplify the implementation**

In `src/lib/resumes/queries.ts`, replace `getResumeVersionWithContent`:

```ts
export async function getResumeVersionWithContent(userId: string, id: string) {
  const resume = await prisma.resumeVersion.findUnique({
    where: { id },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' }, include: { objectVersion: true } } },
      },
    },
  });
  if (!resume) throw new Error('Resume version not found');
  if (resume.ownerUserId !== userId) throw new Error('Not authorized');

  return resume;
}
```

(this replaces the old version's manual `.sort()`/`.filter()` reconstruction — the FK plus Prisma's `orderBy` on the nested includes now does exactly what that code did by hand)

- [ ] **Step 3: Run tests to verify they still pass**

Run: `npx vitest run src/lib/resumes/queries.test.ts`
Expected: PASS — same assertions, now served directly by the query instead of app-level reconstruction.

- [ ] **Step 4: Commit**

```bash
git add src/lib/resumes/queries.ts
git commit -m "refactor: getResumeVersionWithContent reads section/item nesting directly"
```

---

### Task 4: `objects/dashboard.ts` — update the resume-usage join

**Files:**
- Modify: `src/lib/objects/dashboard.ts`

**Interfaces:**
- `getObjectDashboard`'s `usedInResumeNames` computation now reaches the resume through `sectionObjects[].section.resumeVersion` instead of `resumeVersionItems[].resumeVersion` — its own return shape is unchanged.

This task is written against `dashboard.ts` as it exists **today** (single-level object grouping) — see the "Sequencing note" at the top of this plan if `2026-09-06-resume-vc-spike-1.5.md`'s Task 3 has already restructured this file.

- [ ] **Step 1: Run the existing test to confirm current behavior**

Run: `npx vitest run src/lib/objects/dashboard.test.ts`
Expected: PASS beforehand (regression guard — `dashboard.test.ts`'s assertions don't reference the relation name directly, only `usedInResumeNames`, so this task has no new test, only a passing-before/passing-after check).

- [ ] **Step 2: Update the relation name and accessor**

In `src/lib/objects/dashboard.ts`, in `getObjectDashboard`:

```ts
  const versions = await prisma.objectVersion.findMany({
    where: { ownerUserId: userId },
    orderBy: { versionNumber: 'asc' },
    include: {
      sectionObjects: { include: { section: { include: { resumeVersion: true } } } },
    },
  });
```

(replacing the `resumeVersionItems: { include: { resumeVersion: true } }` include)

```ts
      usedInResumeNames: v.sectionObjects.map((item) => item.section.resumeVersion.name),
```

(replacing `usedInResumeNames: v.resumeVersionItems.map((item) => item.resumeVersion.name)`)

- [ ] **Step 3: Run tests to verify they still pass**

Run: `npx vitest run src/lib/objects/dashboard.test.ts`
Expected: PASS — same assertions, same values, reached through the new relation chain.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (confirms nothing else in the codebase still references `resumeVersionItems`/`ResumeVersionItem`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/objects/dashboard.ts
git commit -m "fix: object dashboard resume-usage join follows SectionObject's section FK"
```
