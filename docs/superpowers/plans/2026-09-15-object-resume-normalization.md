# Object/Resume Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the flat `ObjectVersion`/`ResumeVersion` tables into real identity + history tables (`ResumeObject`/`ObjectVariation`/`ObjectRevision` and `Resume`/`ResumeRevision`/`ResumeSection`/`SectionObject`), matching the finalized spec, and ship the "New Variation" feature the new object model enables.

**Architecture:** One destructive Prisma migration replaces the old 4-table schema with the new 7-table schema (no data-preserving migration — local dev/test data only, re-seed after). Every consumer (lib → Server Actions → UI) is updated bottom-up in dependency order: schema → object lib → object actions → resume lib → resume actions → UI. Each task's tests are run scoped to the files it touches; the full suite only needs to pass again once every task lands (see Global Constraints).

**Tech Stack:** Next.js (Server Actions), Prisma + Postgres, Vitest (integration tests against a real Postgres test DB via `resetDb()`), Zod.

**Spec:** `docs/superpowers/specs/2026-08-16-resume-version-control-design.md`

## Global Constraints

- **Prisma model naming exception:** the spec's `OBJECT` entity is implemented as a Prisma model named `ResumeObject`, not `Object` — `Object` is a reserved global identifier in TypeScript/JavaScript, and naming a Prisma model that shadows it in generated type imports (`import { Object } from '@prisma/client'`) is a footgun for every file that also uses the real `Object.keys`/`Object.entries`. Every other model name matches the spec's ER diagram exactly.
- **Destructive migration:** this environment has only local dev/test data (one demo seed script, no shared or prod DB). The migration drops the old tables outright; there is no data-preserving migration step. Re-run `npm run db:seed` after migrating.
- **No cascading deletes:** matches the existing schema's convention (see `prisma/seed.ts`'s manual child-before-parent deletes) — do not add `onDelete: Cascade` anywhere new.
- **Mid-plan test state:** after Task 1, the full `npm test` suite will fail (tests still reference old Prisma models) until Task 8 lands — this is expected, not a regression. Every task's own steps run only the test file(s) that task touches; the full suite + lint + typecheck are the final task's job.
- **Behavior change carried by the schema (already confirmed with the user, not a new decision):** an object's `tags` move from per-revision to per-variation (editing tags now updates the whole variation, not just one historic revision); a resume's `name` moves from per-revision to the `Resume` identity row (renaming now relabels every past revision, not just future ones — `HistoryTab` is updated accordingly in Task 11).
- **Section membership is now a real FK** (`SectionObject.resumeSectionId`) instead of being derived by matching `objectVersion.type` at render time — this removes the manual type-matching/sort code in `getResumeVersionWithContent` entirely (Task 7).

---

## File Structure

| File | Change |
|---|---|
| `prisma/schema.prisma` | Replace `ObjectVersion`/`ResumeVersion`/`ResumeVersionSection`/`ResumeVersionItem` with `ResumeObject`/`ObjectVariation`/`ObjectRevision`/`Resume`/`ResumeRevision`/`ResumeSection`/`SectionObject` |
| `prisma/migrations/<ts>_object_resume_normalization/migration.sql` | New migration (generated) |
| `test/db.ts` | `resetDb()` deletes the new tables in FK order |
| `src/lib/objects/versioning.ts` | `createObjectVersion`/`editObjectVersion` → `createObject`/`editObjectRevision`/`forkObjectVariation` |
| `src/lib/objects/versioning.test.ts` | Rewritten for the new functions |
| `src/lib/objects/queries.ts` | `listObjectsForUser`/`listLatestObjectsForUser`/`getObjectHistory`/`listTagsForUser` reimplemented against the split tables |
| `src/lib/objects/queries.test.ts` | Rewritten |
| `src/lib/objects/dashboard.ts` | `getObjectDashboard` groups by object → variation → revisions |
| `src/lib/objects/dashboard.test.ts` | Rewritten |
| `src/app/objects/actions.ts` | Renamed return fields + new `forkObjectVariationAction` |
| `src/app/objects/actions.test.ts` | Rewritten + fork test added |
| `src/lib/resumes/versioning.ts` | `createResumeFromScratch`/`editResume`/`forkResume`/`isHeadVersion` reimplemented; new `validateSectionItemTypes` write-time check |
| `src/lib/resumes/versioning.test.ts` | Rewritten + type-mismatch test added |
| `src/lib/resumes/queries.ts` | `getLatestVersionsForUser`/`getResumeVersionWithContent`/`getResumeForest`/`getResumeTreeHistory` reimplemented (each gets simpler — see Task 7) |
| `src/lib/resumes/queries.test.ts` | Rewritten |
| `src/app/resumes/actions.ts` | `SectionInput.items[].objectVersionId` → `objectRevisionId` |
| `src/app/resumes/actions.test.ts` | Field renames only |
| `src/components/ObjectPickerModal.tsx` | `rootVersionId`/`editingRootVersionId` → `objectVariationId`/`editingObjectVariationId`; new `forkFrom` prop for "New Variation" |
| `src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx` | Nested object → variation rendering; "+ Variation" trigger per variation |
| `src/app/(app)/dashboard/objects/page.tsx` | Tag filter operates on `variation.tags` instead of per-version tags |
| `src/app/(app)/resumes/ResumeForm.tsx` | `objectVersionId` → `objectRevisionId`, `rootVersionId` → `objectVariationId` |
| `src/app/(app)/resumes/[id]/HistoryTab.tsx` | `rootVersionId` prop → `resumeId` |
| `src/app/(app)/resumes/[id]/page.tsx` | `resume.rootVersionId` → `resume.resumeId`; `item.objectVersion` → `item.objectRevision`; drops the `as ObjectType` cast (uses `section.sectionType` directly) |
| `src/app/(app)/resumes/[id]/edit/page.tsx`, `fork/page.tsx` | `it.objectVersion.*` → `it.objectRevision.*` |
| `prisma/seed.ts` | Calls to renamed versioning functions |
| `src/components/ObjectVersionChip.tsx` | **No change** — shape-agnostic, confirmed while reading the codebase |
| `src/lib/objects/schemas.ts`, `fieldConfig.ts` | **No change** — keyed by `ObjectType`, orthogonal to this refactor |
| `src/lib/ai/context.ts`, `src/app/api/qna/route.ts` (+ tests) | **No change** — `listObjectsForUser`'s `{type, body, fields}` output shape is preserved |

---

## Task 1: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_object_resume_normalization/migration.sql` (generated, not hand-written)
- Modify: `test/db.ts`

**Interfaces:**
- Produces: Prisma Client models `ResumeObject`, `ObjectVariation`, `ObjectRevision`, `Resume`, `ResumeRevision`, `ResumeSection`, `SectionObject` — every later task's `prisma.*` calls target these.

- [ ] **Step 1: Replace the schema**

Replace the `User`, `ObjectVersion`, `ResumeVersion`, `ResumeVersionSection`, `ResumeVersionItem` models in `prisma/schema.prisma` (keep `Profile` and the `ObjectType` enum unchanged) with:

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  profile Profile?
  objects ResumeObject[]
  resumes Resume[]
}

model ResumeObject {
  id          String     @id @default(uuid())
  ownerUserId String
  owner       User       @relation(fields: [ownerUserId], references: [id])
  type        ObjectType

  variations ObjectVariation[]

  @@index([ownerUserId])
}

model ObjectVariation {
  id       String       @id @default(uuid())
  objectId String
  object   ResumeObject @relation(fields: [objectId], references: [id])
  tags     String[]     @default([])

  revisions ObjectRevision[]

  @@index([objectId])
}

model ObjectRevision {
  id                String          @id @default(uuid())
  objectVariationId String
  objectVariation   ObjectVariation @relation(fields: [objectVariationId], references: [id])
  fields            Json
  body              String
  versionNumber     Int
  createdAt         DateTime        @default(now())

  sectionObjects SectionObject[]

  @@index([objectVariationId])
}

model Resume {
  id              String   @id @default(uuid())
  parentVersionId String?
  ownerUserId     String
  owner           User     @relation(fields: [ownerUserId], references: [id])
  name            String
  tags            String[] @default([])

  revisions ResumeRevision[]

  @@index([ownerUserId])
  @@index([parentVersionId])
}

model ResumeRevision {
  id            String   @id @default(uuid())
  resumeId      String
  resume        Resume   @relation(fields: [resumeId], references: [id])
  versionNumber Int
  createdAt     DateTime @default(now())

  sections ResumeSection[]

  @@index([resumeId])
}

model ResumeSection {
  id               String         @id @default(uuid())
  resumeRevisionId String
  resumeRevision   ResumeRevision @relation(fields: [resumeRevisionId], references: [id])
  sectionType      ObjectType
  order            Int

  items SectionObject[]

  @@unique([resumeRevisionId, sectionType])
  @@index([resumeRevisionId])
}

model SectionObject {
  id               String         @id @default(uuid())
  resumeSectionId  String
  resumeSection    ResumeSection  @relation(fields: [resumeSectionId], references: [id])
  objectRevisionId String
  objectRevision   ObjectRevision @relation(fields: [objectRevisionId], references: [id])
  order            Int

  @@unique([resumeSectionId, order])
  @@index([resumeSectionId])
  @@index([objectRevisionId])
}
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name object_resume_normalization`
Expected: a new folder under `prisma/migrations/` with a `migration.sql` that drops the four old tables and creates the seven new ones; Prisma Client regenerates without errors.

- [ ] **Step 3: Update `resetDb()`**

```ts
// test/db.ts
import { prisma } from '@/lib/prisma';

export async function resetDb() {
  await prisma.sectionObject.deleteMany();
  await prisma.resumeSection.deleteMany();
  await prisma.resumeRevision.deleteMany();
  await prisma.resume.deleteMany();
  await prisma.objectRevision.deleteMany();
  await prisma.objectVariation.deleteMany();
  await prisma.resumeObject.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 4: Verify the DB-level scaffold test still passes**

Run: `npx vitest run test/db.test.ts test/scaffold.test.ts`
Expected: PASS (these only exercise `resetDb`/`prisma`, not app lib code).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db.ts
git commit -m "refactor(db): split ObjectVersion/ResumeVersion into identity+history tables"
```

---

## Task 2: Object versioning lib

**Files:**
- Modify: `src/lib/objects/versioning.ts`
- Test: `src/lib/objects/versioning.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/prisma`), `validateObjectFields(type, fields)` and `ObjectType` from `./schemas` (unchanged).
- Produces (used by Task 5's actions and Task 4's dashboard tests):
  - `createObject(userId: string, type: ObjectType, fields: unknown, body: string, tags?: string[]): Promise<RevisionSummary>`
  - `editObjectRevision(userId: string, existingRevisionId: string, fields: unknown, body: string, tags?: string[]): Promise<RevisionSummary>`
  - `forkObjectVariation(userId: string, objectId: string, fields: unknown, body: string, tags?: string[]): Promise<RevisionSummary>`
  - where `RevisionSummary = { id, objectId, objectVariationId, versionNumber, fields, body, tags, createdAt }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/objects/versioning.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject, editObjectRevision, forkObjectVariation } from './versioning';

describe('object versioning', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('creates an object with one variation and one revision at version 1', async () => {
    const user = await makeUser();
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python, TypeScript');
    expect(v1.versionNumber).toBe(1);
    expect(v1.objectId).not.toBe(v1.objectVariationId);
    expect(v1.objectVariationId).not.toBe(v1.id);
  });

  it('stores tags passed on create, defaulting to an empty list', async () => {
    const user = await makeUser();
    const tagged = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);
    const untagged = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'React');
    expect(tagged.tags).toEqual(['Backend']);
    expect(untagged.tags).toEqual([]);
  });

  it('edit creates a new revision under the same variation', async () => {
    const user = await makeUser();
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript', ['Backend', 'AI']);
    expect(v2.objectVariationId).toBe(v1.objectVariationId);
    expect(v2.versionNumber).toBe(2);
    expect(v2.id).not.toBe(v1.id);
    expect(v2.tags).toEqual(['Backend', 'AI']);
  });

  it('editing a stale (non-head) revision numbers off the current latest, not the edited-from revision', async () => {
    const user = await makeUser();
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const v3 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, Go');
    expect(v3.objectVariationId).toBe(v1.objectVariationId);
    expect(v3.versionNumber).toBe(v2.versionNumber + 1);
  });

  it('rejects editing a revision owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const v1 = await createObject(owner.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await expect(
      editObjectRevision(attacker.id, v1.id, { category: 'Languages' }, 'hacked')
    ).rejects.toThrow('Not authorized');
  });

  it('new variation starts its own history under the same object', async () => {
    const user = await makeUser();
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const variation2 = await forkObjectVariation(user.id, v1.objectId, { category: 'Languages' }, 'Go', ['Backend']);

    expect(variation2.objectId).toBe(v1.objectId);
    expect(variation2.objectVariationId).not.toBe(v1.objectVariationId);
    expect(variation2.versionNumber).toBe(1);
    expect(variation2.tags).toEqual(['Backend']);
  });

  it('rejects forking a variation for an object owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const v1 = await createObject(owner.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await expect(
      forkObjectVariation(attacker.id, v1.objectId, { category: 'Languages' }, 'hacked')
    ).rejects.toThrow('Not authorized');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/objects/versioning.test.ts`
Expected: FAIL — `createObject`/`editObjectRevision`/`forkObjectVariation` not exported yet.

- [ ] **Step 3: Implement**

```ts
// src/lib/objects/versioning.ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/objects/versioning.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/objects/versioning.ts src/lib/objects/versioning.test.ts
git commit -m "refactor(objects): split versioning into object/variation/revision writes"
```

---

## Task 3: Object queries lib

**Files:**
- Modify: `src/lib/objects/queries.ts`
- Test: `src/lib/objects/queries.test.ts`

**Interfaces:**
- Consumes: `createObject`, `editObjectRevision` from Task 2.
- Produces (used by Task 5's actions, `src/app/api/qna/route.ts` unchanged):
  - `listObjectsForUser(userId, type?): Promise<Array<{ id, objectId, objectVariationId, type, versionNumber, fields, body, tags, createdAt }>>`
  - `listLatestObjectsForUser(userId, type?)` — same shape, one row per variation
  - `getObjectHistory(userId, objectVariationId)` — same shape, oldest-first, one variation's full history
  - `listTagsForUser(userId): Promise<string[]>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/objects/queries.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject, editObjectRevision } from './versioning';
import { listObjectsForUser, listLatestObjectsForUser, getObjectHistory, listTagsForUser } from './queries';

describe('object queries', () => {
  beforeEach(resetDb);

  it('lists every revision of every object, newest first', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const other = await createObject(user.id, 'SUMMARY', {}, 'Backend engineer');

    const list = await listObjectsForUser(user.id);

    expect(list).toHaveLength(3);
    expect(list.map((o) => o.id)).toEqual([other.id, v2.id, v1.id]);
  });

  it('filters to only the given object type', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Go');
    await createObject(user.id, 'SUMMARY', {}, 'Backend engineer');

    const skillsOnly = await listObjectsForUser(user.id, 'SKILLS');

    expect(skillsOnly).toHaveLength(1);
    expect(skillsOnly[0].body).toBe('Go');
  });

  it('returns full variation history oldest first', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const history = await getObjectHistory(user.id, v1.objectVariationId);

    expect(history.map((v) => v.id)).toEqual([v1.id, v2.id]);
  });

  it('lists only the latest revision of each variation, optionally filtered by type', async () => {
    const user = await prisma.user.create({ data: { email: 'u2@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    await createObject(user.id, 'SUMMARY', {}, 'Backend engineer');

    const skillsOnly = await listLatestObjectsForUser(user.id, 'SKILLS');
    expect(skillsOnly).toHaveLength(1);
    expect(skillsOnly[0].id).toBe(v2.id);

    const all = await listLatestObjectsForUser(user.id);
    expect(all).toHaveLength(2);
  });

  it('lists distinct tags across all of a user\'s object variations', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);
    await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'React', ['Frontend', 'Backend']);

    const tags = await listTagsForUser(user.id);

    expect(tags.sort()).toEqual(['Backend', 'Frontend']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/objects/queries.test.ts`
Expected: FAIL — old functions still query `prisma.objectVersion`, which no longer exists.

- [ ] **Step 3: Implement**

```ts
// src/lib/objects/queries.ts
import { prisma } from '@/lib/prisma';
import type { ObjectType } from './schemas';

function toSummary(revision: {
  id: string;
  fields: unknown;
  body: string;
  versionNumber: number;
  createdAt: Date;
  objectVariation: { id: string; tags: string[]; object: { id: string; type: ObjectType } };
}) {
  return {
    id: revision.id,
    objectId: revision.objectVariation.object.id,
    objectVariationId: revision.objectVariation.id,
    type: revision.objectVariation.object.type,
    versionNumber: revision.versionNumber,
    fields: revision.fields,
    body: revision.body,
    tags: revision.objectVariation.tags,
    createdAt: revision.createdAt,
  };
}

export async function listObjectsForUser(userId: string, type?: ObjectType) {
  const revisions = await prisma.objectRevision.findMany({
    where: { objectVariation: { object: { ownerUserId: userId, ...(type ? { type } : {}) } } },
    orderBy: { createdAt: 'desc' },
    include: { objectVariation: { include: { object: true } } },
  });
  return revisions.map(toSummary);
}

export async function listLatestObjectsForUser(userId: string, type?: ObjectType) {
  const revisions = await listObjectsForUser(userId, type);
  const seenVariations = new Set<string>();
  const latest = [];
  for (const r of revisions) {
    if (!seenVariations.has(r.objectVariationId)) {
      seenVariations.add(r.objectVariationId);
      latest.push(r);
    }
  }
  return latest;
}

export async function getObjectHistory(userId: string, objectVariationId: string) {
  const revisions = await prisma.objectRevision.findMany({
    where: { objectVariationId, objectVariation: { object: { ownerUserId: userId } } },
    orderBy: { versionNumber: 'asc' },
    include: { objectVariation: { include: { object: true } } },
  });
  return revisions.map(toSummary);
}

export async function listTagsForUser(userId: string): Promise<string[]> {
  const variations = await prisma.objectVariation.findMany({
    where: { object: { ownerUserId: userId } },
    select: { tags: true },
  });
  const tags = new Set<string>();
  for (const v of variations) {
    for (const tag of v.tags) tags.add(tag);
  }
  return Array.from(tags);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/objects/queries.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/objects/queries.ts src/lib/objects/queries.test.ts
git commit -m "refactor(objects): rebuild queries against the variation/revision split"
```

---

## Task 4: Object dashboard lib

**Files:**
- Modify: `src/lib/objects/dashboard.ts`
- Test: `src/lib/objects/dashboard.test.ts`

**Interfaces:**
- Consumes: `createObject`, `editObjectRevision`, `forkObjectVariation` (Task 2), `createResumeFromScratch`, `editResume` (Task 6 — written after this task; see note in Step 1).
- Produces (used by Task 10's `ObjectDashboardClient`):
  - `getObjectDashboard(userId): Promise<Array<{ objectId, type, variations: Array<{ objectVariationId, tags, revisions: Array<{ id, versionNumber, body, fields, createdAt, tags, usedInResumeNames }> }> }>>`

> **Note:** this task's tests exercise `createResumeFromScratch`/`editResume`, which Task 6 hasn't rewritten yet. Do Task 4 *after* Task 6 in execution order (the numbering here reflects the spec's read order, not execution order) — or write this task's test file now and defer running it until Task 6 lands. Subagent-driven-development should sequence it after Task 6.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/objects/dashboard.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject, editObjectRevision, forkObjectVariation } from './versioning';
import { createResumeFromScratch, editResume } from '../resumes/versioning';
import { getObjectDashboard } from './dashboard';

describe('getObjectDashboard', () => {
  beforeEach(resetDb);

  it('groups revisions by object and variation, and lists which resumes use each revision', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectRevision(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const resumeRoot = await createResumeFromScratch(user.id, 'My Resume');
    await editResume(user.id, resumeRoot.id, undefined, [
      { sectionType: 'SKILLS', order: 0, items: [{ objectRevisionId: v2.id, order: 0 }] },
    ]);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard).toHaveLength(1);
    const [entry] = dashboard;
    expect(entry.variations).toHaveLength(1);
    const [variation] = entry.variations;
    expect(variation.revisions).toHaveLength(2);
    const v1Entry = variation.revisions.find((r) => r.id === v1.id)!;
    const v2Entry = variation.revisions.find((r) => r.id === v2.id)!;
    expect(v1Entry.usedInResumeNames).toEqual([]);
    expect(v2Entry.usedInResumeNames).toEqual(['My Resume']);
  });

  it('lists each variation under its object, keeping their histories separate', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await forkObjectVariation(user.id, v1.objectId, { category: 'Languages' }, 'Go', ['Backend']);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard).toHaveLength(1);
    expect(dashboard[0].variations).toHaveLength(2);
  });

  it('includes each variation\'s tags on every one of its revisions', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);

    const dashboard = await getObjectDashboard(user.id);

    const variation = dashboard[0].variations.find((v) => v.objectVariationId === v1.objectVariationId)!;
    expect(variation.tags).toEqual(['Backend']);
    expect(variation.revisions[0].tags).toEqual(['Backend']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/objects/dashboard.test.ts`
Expected: FAIL — `getObjectDashboard` still queries `prisma.objectVersion`.

- [ ] **Step 3: Implement**

```ts
// src/lib/objects/dashboard.ts
import { prisma } from '@/lib/prisma';

export async function getObjectDashboard(userId: string) {
  const objects = await prisma.resumeObject.findMany({
    where: { ownerUserId: userId },
    include: {
      variations: {
        include: {
          revisions: {
            orderBy: { versionNumber: 'asc' },
            include: {
              sectionObjects: {
                include: { resumeSection: { include: { resumeRevision: { include: { resume: true } } } } },
              },
            },
          },
        },
      },
    },
  });

  return objects.map((object) => ({
    objectId: object.id,
    type: object.type,
    variations: object.variations.map((variation) => ({
      objectVariationId: variation.id,
      tags: variation.tags,
      revisions: variation.revisions.map((revision) => ({
        id: revision.id,
        versionNumber: revision.versionNumber,
        body: revision.body,
        fields: revision.fields,
        createdAt: revision.createdAt,
        tags: variation.tags,
        usedInResumeNames: revision.sectionObjects.map((so) => so.resumeSection.resumeRevision.resume.name),
      })),
    })),
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/objects/dashboard.test.ts` (after Task 6 lands)
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/objects/dashboard.ts src/lib/objects/dashboard.test.ts
git commit -m "refactor(objects): dashboard groups by object then variation"
```

---

## Task 5: Object actions

**Files:**
- Modify: `src/app/objects/actions.ts`
- Test: `src/app/objects/actions.test.ts`

**Interfaces:**
- Consumes: `createObject`, `editObjectRevision`, `forkObjectVariation` (Task 2), `listLatestObjectsForUser`, `getObjectHistory` (Task 3).
- Produces (used by Task 9's `ObjectPickerModal`, Task 11's `ResumeForm`):
  - `createObjectAction(type, fields, body, tags?)`
  - `editObjectAction(existingRevisionId, fields, body, tags?)`
  - `forkObjectVariationAction(objectId, fields, body, tags?)` — new
  - `listLatestObjectsAction(type?)`
  - `getObjectHistoryAction(objectVariationId)`

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/objects/actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';

vi.mock('@/lib/session', () => ({ getCurrentUserId: vi.fn() }));
import { getCurrentUserId } from '@/lib/session';
import {
  createObjectAction,
  editObjectAction,
  forkObjectVariationAction,
  listLatestObjectsAction,
  getObjectHistoryAction,
} from './actions';

describe('object actions', () => {
  beforeEach(resetDb);

  it('creates an object scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);

    const result = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const stored = await prisma.resumeObject.findUnique({ where: { id: result.objectId } });
    expect(stored?.ownerUserId).toBe(user.id);
  });

  it('propagates the not-authenticated error when there is no session', async () => {
    vi.mocked(getCurrentUserId).mockRejectedValue(new Error('Not authenticated'));

    await expect(createObjectAction('SKILLS', { category: 'Languages' }, 'Python')).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('edit action creates a new revision via the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const edited = await editObjectAction(created.id, { category: 'Languages' }, 'Python, TypeScript');

    expect(edited.versionNumber).toBe(2);
  });

  it('passes tags through on create and edit', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Go', ['Backend']);

    const edited = await editObjectAction(created.id, { category: 'Languages' }, 'Go', ['Backend', 'AI']);

    expect(edited.tags).toEqual(['Backend', 'AI']);
  });

  it('forkObjectVariationAction creates a new variation scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u4@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const forked = await forkObjectVariationAction(created.objectId, { category: 'Languages' }, 'Go', ['Backend']);

    expect(forked.objectId).toBe(created.objectId);
    expect(forked.objectVariationId).not.toBe(created.objectVariationId);
    const stored = await prisma.objectRevision.findUnique({ where: { id: forked.id } });
    expect(stored?.body).toBe('Go');
  });

  it('listLatestObjectsAction scopes to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u2@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const result = await listLatestObjectsAction('SKILLS');
    expect(result).toHaveLength(1);
  });

  it('getObjectHistoryAction returns every revision for the given variation', async () => {
    const user = await prisma.user.create({ data: { email: 'u3@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');
    await editObjectAction(created.id, { category: 'Languages' }, 'Python, TypeScript');

    const history = await getObjectHistoryAction(created.objectVariationId);
    expect(history).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/objects/actions.test.ts`
Expected: FAIL — `forkObjectVariationAction` doesn't exist yet; other actions still call the old lib functions.

- [ ] **Step 3: Implement**

```ts
// src/app/objects/actions.ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/objects/actions.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/objects/actions.ts src/app/objects/actions.test.ts
git commit -m "refactor(objects): actions return revision summaries, add forkObjectVariationAction"
```

---

## Task 6: Resume versioning lib

**Files:**
- Modify: `src/lib/resumes/versioning.ts`
- Test: `src/lib/resumes/versioning.test.ts`

**Interfaces:**
- Consumes: `createObject` (Task 2).
- Produces (used by Task 4's dashboard tests, Task 7's queries tests, Task 8's actions):
  - `SectionInput = { sectionType: ObjectType; order: number; items: Array<{ objectRevisionId: string; order: number }> }`
  - `createResumeFromScratch(userId, name, sections?): Promise<RevisionResult>`
  - `editResume(userId, existingRevisionId, name, sections): Promise<RevisionResult>`
  - `forkResume(userId, sourceRevisionId, newName, sections): Promise<RevisionResult>`
  - `isHeadVersion(resumeRevisionId): Promise<boolean>`
  - where `RevisionResult = { id, resumeId, parentVersionId, name, versionNumber, createdAt, sections, items }` (`items` is `sections.flatMap(s => s.items)`, each item `{ id, objectRevisionId, order }`)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/resumes/versioning.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject } from '../objects/versioning';
import { createResumeFromScratch, forkResume, editResume, isHeadVersion } from './versioning';

describe('resume versioning', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('a fresh resume is not forked from anything', async () => {
    const user = await makeUser();
    const resume = await createResumeFromScratch(user.id, 'My Resume');
    expect(resume.parentVersionId).toBeNull();
    expect(resume.versionNumber).toBe(1);
  });

  it('fork starts a new resume, remembering the source as parent', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);

    expect(fork.resumeId).not.toBe(original.resumeId);
    expect(fork.parentVersionId).toBe(original.resumeId);
  });

  it('fork writes whatever content the caller submits (pre-filled from the source by the caller)', async () => {
    const user = await makeUser();
    const skill = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const sections = [
      { sectionType: 'SKILLS' as const, order: 0, items: [{ objectRevisionId: skill.id, order: 0 }] },
    ];
    const original = await createResumeFromScratch(user.id, 'Original', sections);

    // Simulates the user leaving the fork form's pre-filled content unchanged.
    const fork = await forkResume(user.id, original.id, 'Forked', sections);

    expect(fork.sections).toHaveLength(1);
    expect(fork.items[0].objectRevisionId).toBe(skill.id);
  });

  it('edit stays on the same resume and inherits its fork origin, not the edited-from revision\'s id', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);
    const edited = await editResume(user.id, fork.id, 'Renamed', []);

    expect(edited.resumeId).toBe(fork.resumeId);
    expect(edited.parentVersionId).toBe(fork.parentVersionId);
    expect(edited.parentVersionId).toBe(original.resumeId);
  });

  it('editing a stale (non-head) revision succeeds and becomes the new latest for its resume', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    const v3 = await editResume(user.id, v1.id, 'v3 from a stale revision', []);

    expect(v3.resumeId).toBe(v1.resumeId);
    expect(v3.parentVersionId).toBe(v1.parentVersionId);
    expect(await isHeadVersion(v3.id)).toBe(true);
    expect(await isHeadVersion(v2.id)).toBe(false);
  });

  it('renaming on edit updates the resume\'s name, not just this revision', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'Renamed', []);

    expect(v2.name).toBe('Renamed');
    const resume = await prisma.resume.findUniqueOrThrow({ where: { id: v1.resumeId } });
    expect(resume.name).toBe('Renamed');
  });

  it('rejects editing a resume owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const original = await createResumeFromScratch(owner.id, 'Original');

    await expect(editResume(attacker.id, original.id, 'hacked', [])).rejects.toThrow('Not authorized');
  });

  it('rejects forking a resume owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const original = await createResumeFromScratch(owner.id, 'Original');

    await expect(forkResume(attacker.id, original.id, 'hacked', [])).rejects.toThrow('Not authorized');
  });

  it('rejects creating a resume with an empty or whitespace-only title', async () => {
    const user = await makeUser();
    await expect(createResumeFromScratch(user.id, '')).rejects.toThrow('Resume title is required');
    await expect(createResumeFromScratch(user.id, '   ')).rejects.toThrow('Resume title is required');
  });

  it('rejects editing a resume title to empty', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    await expect(editResume(user.id, original.id, '   ', [])).rejects.toThrow('Resume title is required');
  });

  it('rejects forking a resume with an empty title', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    await expect(forkResume(user.id, original.id, '  ', [])).rejects.toThrow('Resume title is required');
  });

  it('isHeadVersion reflects recency, not tree position', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    expect(await isHeadVersion(v1.id)).toBe(true);

    const v2 = await editResume(user.id, v1.id, 'v2', []);
    expect(await isHeadVersion(v1.id)).toBe(false);
    expect(await isHeadVersion(v2.id)).toBe(true);
  });

  it('rejects a resume write when an item\'s object type does not match its section', async () => {
    const user = await makeUser();
    const skill = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const sections = [
      { sectionType: 'EDUCATION' as const, order: 0, items: [{ objectRevisionId: skill.id, order: 0 }] },
    ];
    await expect(createResumeFromScratch(user.id, 'Mismatched', sections)).rejects.toThrow(/type/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/resumes/versioning.test.ts`
Expected: FAIL — old functions still query `prisma.resumeVersion`.

- [ ] **Step 3: Implement**

```ts
// src/lib/resumes/versioning.ts
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

function toResult(resume: { id: string; parentVersionId: string | null; name: string }, revision: {
  id: string;
  versionNumber: number;
  createdAt: Date;
  sections: Array<{ id: string; sectionType: ObjectType; order: number; items: Array<{ id: string; objectRevisionId: string; order: number }> }>;
}) {
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/resumes/versioning.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resumes/versioning.ts src/lib/resumes/versioning.test.ts
git commit -m "refactor(resumes): split versioning into resume/revision writes, add type validation"
```

> After this task, go back and run Task 4's dashboard tests (they depend on `createResumeFromScratch`/`editResume` from this task).

---

## Task 7: Resume queries lib

**Files:**
- Modify: `src/lib/resumes/queries.ts`
- Test: `src/lib/resumes/queries.test.ts`

**Interfaces:**
- Consumes: `createObject` (Task 2), `createResumeFromScratch`, `editResume`, `forkResume` (Task 6).
- Produces (used by Task 11's pages):
  - `getLatestVersionsForUser(userId)` — one `ResumeRevision` per `Resume`, the head
  - `getResumeVersionWithContent(userId, resumeRevisionId)` — `{ id, resumeId, name, createdAt, sections: [{ id, sectionType, items: [{ id, objectRevisionId, objectRevision: { id, body, fields, tags, objectVariationId, versionNumber, createdAt } }] }] }`
  - `getResumeForest(userId)` — `{ resumeId, headVersionId, name, headCreatedAt, forkedFromResumeId }[]`
  - `getResumeTreeHistory(userId, resumeId)` — every revision of one resume, oldest first

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/resumes/queries.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObject } from '../objects/versioning';
import { createResumeFromScratch, editResume, forkResume } from './versioning';
import { getLatestVersionsForUser, getResumeVersionWithContent, getResumeForest, getResumeTreeHistory } from './queries';

describe('resume queries', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('returns exactly one (the head) revision per resume', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    await createResumeFromScratch(user.id, 'A second, unrelated resume');

    const latest = await getLatestVersionsForUser(user.id);

    expect(latest).toHaveLength(2);
    expect(latest.map((r) => r.id)).toContain(v2.id);
    expect(latest.map((r) => r.id)).not.toContain(v1.id);
  });

  it('a revision edited from an older sibling still counts as the latest for its resume', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    const v3 = await editResume(user.id, v1.id, 'v3', []);

    const latest = await getLatestVersionsForUser(user.id);

    expect(latest.map((r) => r.id)).toContain(v3.id);
    expect(latest.map((r) => r.id)).not.toContain(v2.id);
    expect(latest.map((r) => r.id)).not.toContain(v1.id);
  });

  it('returns full content with sections and items', async () => {
    const user = await makeUser();
    const skill = await createObject(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const resume = await editResume(
      user.id,
      (await createResumeFromScratch(user.id, 'Original')).id,
      undefined,
      [{ sectionType: 'SKILLS', order: 0, items: [{ objectRevisionId: skill.id, order: 0 }] }]
    );

    const content = await getResumeVersionWithContent(user.id, resume.id);

    expect(content.sections[0].items[0].objectRevision.id).toBe(skill.id);
  });

  it('returns every revision of one resume, oldest first', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);

    const history = await getResumeTreeHistory(user.id, v1.resumeId);
    expect(history.map((v) => v.id)).toEqual([v1.id, v2.id]);
  });

  it('builds a forest with a fork edge to the source resume', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);

    const forest = await getResumeForest(user.id);

    const forkTree = forest.find((t) => t.resumeId === fork.resumeId);
    expect(forkTree?.forkedFromResumeId).toBe(original.resumeId);

    const originalTree = forest.find((t) => t.resumeId === original.resumeId);
    expect(originalTree?.forkedFromResumeId).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/resumes/queries.test.ts`
Expected: FAIL — old functions still query `prisma.resumeVersion`.

- [ ] **Step 3: Implement**

```ts
// src/lib/resumes/queries.ts
import { prisma } from '@/lib/prisma';

export async function getLatestVersionsForUser(userId: string) {
  const resumes = await prisma.resume.findMany({
    where: { ownerUserId: userId },
    include: { revisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return resumes.map((r) => r.revisions[0]);
}

export async function getResumeTreeHistory(userId: string, resumeId: string) {
  return prisma.resumeRevision.findMany({
    where: { resumeId, resume: { ownerUserId: userId } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getResumeVersionWithContent(userId: string, resumeRevisionId: string) {
  const revision = await prisma.resumeRevision.findUnique({
    where: { id: resumeRevisionId },
    include: {
      resume: true,
      sections: {
        orderBy: { order: 'asc' },
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: { objectRevision: { include: { objectVariation: true } } },
          },
        },
      },
    },
  });
  if (!revision) throw new Error('Resume revision not found');
  if (revision.resume.ownerUserId !== userId) throw new Error('Not authorized');

  return {
    id: revision.id,
    resumeId: revision.resumeId,
    name: revision.resume.name,
    createdAt: revision.createdAt,
    // Section membership is a real FK now — no more matching items to sections by
    // the referenced object's type at render time.
    sections: revision.sections.map((section) => ({
      id: section.id,
      sectionType: section.sectionType,
      items: section.items.map((item) => ({
        id: item.id,
        objectRevisionId: item.objectRevisionId,
        objectRevision: {
          id: item.objectRevision.id,
          body: item.objectRevision.body,
          fields: item.objectRevision.fields,
          tags: item.objectRevision.objectVariation.tags,
          objectVariationId: item.objectRevision.objectVariationId,
          versionNumber: item.objectRevision.versionNumber,
          createdAt: item.objectRevision.createdAt,
        },
      })),
    })),
  };
}

export async function getResumeForest(userId: string) {
  const resumes = await prisma.resume.findMany({
    where: { ownerUserId: userId },
    include: { revisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  // `parentVersionId` points straight at the source Resume's id now, so unlike the
  // old cross-tree-pointer-to-a-specific-version design, there's no id-to-tree
  // resolution needed here at all.
  return resumes.map((resume) => {
    const head = resume.revisions[0];
    return {
      resumeId: resume.id,
      headVersionId: head.id,
      name: resume.name,
      headCreatedAt: head.createdAt,
      forkedFromResumeId: resume.parentVersionId,
    };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/resumes/queries.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resumes/queries.ts src/lib/resumes/queries.test.ts
git commit -m "refactor(resumes): rebuild queries against the resume/revision split"
```

---

## Task 8: Resume actions

**Files:**
- Modify: `src/app/resumes/actions.ts`
- Test: `src/app/resumes/actions.test.ts`

**Interfaces:**
- Consumes: `createResumeFromScratch`, `editResume`, `forkResume` (Task 6).
- Produces (used by Task 11's `ResumeForm`): `createResumeAction(name, sections?)`, `editResumeAction(existingRevisionId, name, sections)`, `forkResumeAction(sourceRevisionId, newName, sections)` — all return `{ id }` (the new head revision's id), same as before.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/resumes/actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';

vi.mock('@/lib/session', () => ({ getCurrentUserId: vi.fn() }));
import { getCurrentUserId } from '@/lib/session';
import { createResumeAction, editResumeAction, forkResumeAction } from './actions';

describe('resume actions', () => {
  beforeEach(resetDb);

  it('creates a resume scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);

    const result = await createResumeAction('My Resume');

    const stored = await prisma.resumeRevision.findUnique({ where: { id: result.id }, include: { resume: true } });
    expect(stored?.resume.ownerUserId).toBe(user.id);
  });

  it('fork action creates a new resume linked to the source', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const original = await createResumeAction('Original');

    const fork = await forkResumeAction(original.id, 'Forked', []);

    const stored = await prisma.resumeRevision.findUnique({ where: { id: fork.id }, include: { resume: true } });
    const originalStored = await prisma.resumeRevision.findUnique({ where: { id: original.id } });
    expect(stored?.resume.parentVersionId).toBe(originalStored?.resumeId);
  });

  it('edit action creates a new revision on the same resume', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const original = await createResumeAction('Original');

    const edited = await editResumeAction(original.id, 'Renamed', []);

    const stored = await prisma.resumeRevision.findUnique({ where: { id: edited.id }, include: { resume: true } });
    expect(stored?.resume.name).toBe('Renamed');
  });

  it('rejects editing a resume owned by another user', async () => {
    const owner = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(owner.id);
    const original = await createResumeAction('Original');

    vi.mocked(getCurrentUserId).mockResolvedValue(attacker.id);
    await expect(editResumeAction(original.id, 'hacked', [])).rejects.toThrow('Not authorized');
  });

  it('rejects forking a resume owned by another user', async () => {
    const owner = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(owner.id);
    const original = await createResumeAction('Original');

    vi.mocked(getCurrentUserId).mockResolvedValue(attacker.id);
    await expect(forkResumeAction(original.id, 'hacked', [])).rejects.toThrow('Not authorized');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/resumes/actions.test.ts`
Expected: FAIL — `SectionInput` still typed with `objectVersionId`, lib calls target old schema.

- [ ] **Step 3: Implement**

```ts
// src/app/resumes/actions.ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/resumes/actions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/resumes/actions.ts src/app/resumes/actions.test.ts
git commit -m "refactor(resumes): actions use objectRevisionId, verify via resume identity row"
```

> Backend is now fully migrated. `npx vitest run` for every file touched in Tasks 1–8 should be green; the full `npm test` still won't pass until the UI (Tasks 9–11) stops calling the old field/prop names.

---

## Task 9: ObjectPickerModal — rename + New Variation

**Files:**
- Modify: `src/components/ObjectPickerModal.tsx`

**Interfaces:**
- Consumes: `createObjectAction`, `editObjectAction`, `forkObjectVariationAction`, `getObjectHistoryAction` (Task 5).
- Produces (used by Task 10's `ObjectDashboardClient`, Task 11's `ResumeForm`):

```ts
type ObjectSummary = {
  id: string;
  objectId?: string;
  objectVariationId?: string;
  body: string;
  versionNumber: number;
  fields?: unknown;
  tags?: string[];
  createdAt?: string | Date;
};

type Props = {
  type: ObjectType;
  recentObjects?: ObjectSummary[];
  onPick: (picked: ObjectSummary) => void;
  triggerLabel?: string;
  editingObjectVariationId?: string;
  prefillFrom?: ObjectSummary;       // edit-in-place: new revision, same variation
  forkFrom?: ObjectSummary;          // new variation: needs objectId set
  onOpen?: () => void;
};
```

This is a **behavior-preserving rename** (`rootVersionId` → `objectVariationId`, `editingRootVersionId` → `editingObjectVariationId`) plus **one new mode**: when `forkFrom` is supplied, the form pre-fills from it but submits via `forkObjectVariationAction(forkFrom.objectId, ...)` instead of `editObjectAction`. No test file exists for this component today (it's a `'use client'` presentational component exercised via the app, not unit-tested) — verify by reading the diff carefully and via Task 12's manual smoke check.

- [ ] **Step 1: Rename `rootVersionId` throughout, add `forkFrom`**

```tsx
// src/components/ObjectPickerModal.tsx
'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { createObjectAction, editObjectAction, forkObjectVariationAction, getObjectHistoryAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';
import { FIELDS_BY_TYPE } from '@/lib/objects/fieldConfig';
import { ObjectVersionChip } from './ObjectVersionChip';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type ObjectSummary = {
  id: string;
  objectId?: string;
  objectVariationId?: string;
  body: string;
  versionNumber: number;
  fields?: unknown;
  tags?: string[];
  createdAt?: string | Date;
};

function parseTags(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

type Props = {
  type: ObjectType;
  recentObjects?: ObjectSummary[];
  // Receives the full saved object, not just its id, so callers can update their
  // display state (body/fields/tags) without a stale copy or a follow-up fetch.
  onPick: (picked: ObjectSummary) => void;
  triggerLabel?: string;
  editingObjectVariationId?: string;
  // Prefills the form from this revision's fields/body/tags. Submitting saves a new
  // revision of this same variation via editObjectAction — an edit-in-place, not a copy.
  prefillFrom?: ObjectSummary;
  // Prefills the form from this revision's content but submits via forkObjectVariationAction,
  // starting a brand-new variation under the same object (requires forkFrom.objectId).
  forkFrom?: ObjectSummary;
  // Fires when the plain "recent picker" view opens (not the editingObjectVariationId browse
  // view, which already fetches on open). Lets a caller lazy-load recentObjects on first open.
  onOpen?: () => void;
};

export function ObjectPickerModal({
  type,
  recentObjects = [],
  onPick,
  triggerLabel = '+ Object',
  editingObjectVariationId,
  prefillFrom,
  forkFrom,
  onOpen,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'recent' | 'allVersions'>('recent');
  const [allVersions, setAllVersions] = useState<ObjectSummary[]>([]);

  async function openAllVersions(objectVariationId: string) {
    setAllVersions(await getObjectHistoryAction(objectVariationId));
    setView('allVersions');
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    if (editingObjectVariationId) {
      openAllVersions(editingObjectVariationId);
    } else {
      setView('recent');
      onOpen?.();
    }
  }

  function pick(picked: ObjectSummary) {
    onPick(picked);
    setOpen(false);
  }

  const prefillContent = forkFrom ?? prefillFrom;
  const prefillFields = (prefillContent?.fields as Record<string, unknown> | undefined) ?? {};
  const isIconTrigger = triggerLabel.length <= 2;
  const dialogTitle = forkFrom ? `New Variation — ${type}` : prefillFrom ? `Edit ${type}` : `Add Object — ${type}`;
  const submitLabel = forkFrom ? 'Save as new variation' : prefillFrom ? 'Save new version' : 'Create';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant={isIconTrigger ? 'ghost' : 'secondary'} size={isIconTrigger ? 'icon' : 'sm'} aria-label={triggerLabel === '✎' ? 'Edit' : triggerLabel === '→' ? 'See all versions' : undefined}>
            {triggerLabel === '✎' ? <Pencil className="size-3.5" /> : triggerLabel === '+ Object' ? (
              <>
                <Plus className="size-3.5" /> Object
              </>
            ) : (
              triggerLabel
            )}
          </Button>
        }
      />
      <DialogContent>
        {view === 'recent' && (
          <>
            <DialogTitle>{dialogTitle}</DialogTitle>
            {!prefillContent && recentObjects.length > 0 && (
              <fieldset className="mt-4 flex flex-col gap-2 rounded-none border-0 p-0">
                <legend className="mb-1 p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent objects</legend>
                <div className="flex flex-wrap gap-2">
                  {recentObjects.map((o) => (
                    <ObjectVersionChip
                      key={o.id}
                      type={type}
                      version={o}
                      clampBody
                      onClick={() => pick(o)}
                      editTrigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => o.objectVariationId && openAllVersions(o.objectVariationId)}
                          aria-label="See all versions"
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      }
                    />
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="mt-4 flex flex-col gap-3 rounded-none border-0 p-0">
              <legend className="mb-1 p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {prefillContent ? 'Edit fields, then save' : 'or create new'}
              </legend>
              <form
                className="flex max-w-none flex-col gap-3 mb-0"
                action={async (formData) => {
                  const fields = Object.fromEntries(
                    FIELDS_BY_TYPE[type].map((f) => [f.name, String(formData.get(f.name) ?? '')])
                  );
                  const body = String(formData.get('body'));
                  const tags = parseTags(formData.get('tags'));
                  const saved = forkFrom
                    ? await forkObjectVariationAction(forkFrom.objectId!, fields, body, tags)
                    : prefillFrom
                      ? await editObjectAction(prefillFrom.id, fields, body, tags)
                      : await createObjectAction(type, fields, body, tags);
                  pick(saved);
                }}
              >
                {FIELDS_BY_TYPE[type].map((f) => (
                  <div key={f.name} className="flex flex-col gap-1">
                    <Label htmlFor={f.name}>{f.label}</Label>
                    <Input
                      id={f.name}
                      name={f.name}
                      type={f.type ?? 'text'}
                      required={f.required}
                      defaultValue={String(prefillFields[f.name] ?? '')}
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="body">Markdown content</Label>
                  <Textarea id="body" name="body" required defaultValue={prefillContent?.body ?? ''} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tags">Tags, comma-separated</Label>
                  <Input id="tags" name="tags" defaultValue={prefillContent?.tags?.join(', ') ?? ''} />
                </div>
                <Button type="submit" className="mt-1 self-start">
                  {submitLabel}
                </Button>
              </form>
            </fieldset>
          </>
        )}

        {view === 'allVersions' && (
          <>
            <DialogTitle>All versions</DialogTitle>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...allVersions].reverse().map((v) => (
                <ObjectVersionChip
                  key={v.id}
                  type={type}
                  version={v}
                  onClick={editingObjectVariationId ? undefined : () => pick(v)}
                  editTrigger={<ObjectPickerModal type={type} prefillFrom={v} onPick={onPick} triggerLabel="✎" />}
                />
              ))}
            </div>
            {!editingObjectVariationId && (
              <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => setView('recent')}>
                ← Back
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in files not yet updated (Tasks 10–11) — none in `ObjectPickerModal.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/ObjectPickerModal.tsx
git commit -m "refactor(objects): ObjectPickerModal supports New Variation via forkFrom"
```

---

## Task 10: ObjectDashboardClient — nested rendering + New Variation trigger

**Files:**
- Modify: `src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx`
- Modify: `src/app/(app)/dashboard/objects/page.tsx`

**Interfaces:**
- Consumes: `getObjectDashboard` (Task 4), `listTagsForUser` (Task 3), `ObjectPickerModal` (Task 9).

- [ ] **Step 1: Update the tag filter in `page.tsx`**

```tsx
// src/app/(app)/dashboard/objects/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getObjectDashboard } from '@/lib/objects/dashboard';
import { listTagsForUser } from '@/lib/objects/queries';
import { ObjectDashboardClient } from './ObjectDashboardClient';

export default async function ObjectDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tags?: string }>;
}) {
  const { tags } = await searchParams;
  const userId = await getCurrentUserId();
  const [dashboard, allTags] = await Promise.all([getObjectDashboard(userId), listTagsForUser(userId)]);

  const activeTags = tags ? tags.split(',').map((t) => t.trim()) : [];
  const filtered = dashboard.filter((entry) => {
    if (activeTags.length === 0) return true;
    return entry.variations.some((v) => v.tags.some((t) => activeTags.includes(t)));
  });

  return <ObjectDashboardClient dashboard={filtered} allTags={allTags} searchTags={tags} />;
}
```

- [ ] **Step 2: Nest `ObjectDashboardClient` by object → variation**

```tsx
// src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx
'use client';

import { useRouter } from 'next/navigation';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import type { ObjectType } from '@/lib/objects/schemas';
import { getIdentityLabel } from '@/lib/objects/fieldConfig';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const TYPES: ObjectType[] = [
  'WORK_EXPERIENCE',
  'EDUCATION',
  'SKILLS',
  'SUMMARY',
  'PROJECT',
  'CERTIFICATION',
  'EXTRACURRICULAR',
];

// How many recent revisions to show before you have to open "→" for the rest.
// 4 = exactly 2 full rows at the 2-column chip grid width.
const CHIP_LIMIT = 4;

type DashboardEntry = {
  objectId: string;
  type: string;
  variations: Array<{
    objectVariationId: string;
    tags: string[];
    revisions: Array<{
      id: string;
      versionNumber: number;
      body: string;
      fields: unknown;
      createdAt: string | Date;
      tags: string[];
      usedInResumeNames: string[];
    }>;
  }>;
};

export function ObjectDashboardClient({
  dashboard,
  allTags,
  searchTags,
}: {
  dashboard: DashboardEntry[];
  allTags: string[];
  searchTags?: string;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="mb-0 text-2xl font-semibold tracking-tight text-foreground">Objects</h1>

      <form className="flex max-w-none flex-row gap-2 mb-0">
        <Input name="tags" defaultValue={searchTags ?? ''} placeholder="Tags, comma-separated" list="known-tags" className="max-w-xs" />
        <datalist id="known-tags">
          {allTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {TYPES.map((type) => {
        const entries = dashboard.filter((e) => e.type === type);
        return (
          <section key={type} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="my-0 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">{type}</h2>
              <ObjectPickerModal type={type} onPick={refresh} triggerLabel={`+ New ${type}`} />
            </div>
            <div className="flex flex-col gap-4">
              {entries.map((entry) => (
                <div key={entry.objectId} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
                  {entry.variations.map((variation) => {
                    const latest = variation.revisions[variation.revisions.length - 1];
                    // Newest first (left-to-right): reverse the ascending list, then take the recent window.
                    const shown = [...variation.revisions].reverse().slice(0, CHIP_LIMIT);
                    return (
                      <div key={variation.objectVariationId}>
                        <div className="mb-2 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                          <span>{getIdentityLabel(type, latest.fields)}</span>
                          <ObjectPickerModal
                            type={type}
                            forkFrom={{
                              objectId: entry.objectId,
                              id: latest.id,
                              body: latest.body,
                              fields: latest.fields,
                              tags: latest.tags,
                              versionNumber: latest.versionNumber,
                            }}
                            onPick={refresh}
                            triggerLabel="+ Variation"
                          />
                        </div>
                        <div className="grid grid-cols-2 items-start gap-3">
                          {shown.map((v) => (
                            <ObjectVersionChip
                              key={v.id}
                              type={type}
                              version={v}
                              editTrigger={
                                <ObjectPickerModal type={type} prefillFrom={v} onPick={refresh} triggerLabel="✎" />
                              }
                            />
                          ))}
                          {variation.revisions.length > CHIP_LIMIT && (
                            <ObjectPickerModal
                              type={type}
                              editingObjectVariationId={variation.objectVariationId}
                              onPick={refresh}
                              triggerLabel="→"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

> Note: the identity label now reads from each variation's **latest** revision instead of the object's oldest — there's no single "root" fields blob left at the object level to read from once an object has more than one variation, and latest is the freshest truth anyway.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in these two files.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/dashboard/objects/ObjectDashboardClient.tsx src/app/\(app\)/dashboard/objects/page.tsx
git commit -m "feat(objects): dashboard renders variations, adds New Variation trigger"
```

---

## Task 11: Resume UI — field renames

**Files:**
- Modify: `src/app/(app)/resumes/ResumeForm.tsx`
- Modify: `src/app/(app)/resumes/[id]/HistoryTab.tsx`
- Modify: `src/app/(app)/resumes/[id]/page.tsx`
- Modify: `src/app/(app)/resumes/[id]/edit/page.tsx`
- Modify: `src/app/(app)/resumes/[id]/fork/page.tsx`

**Interfaces:**
- Consumes: `createResumeAction`/`editResumeAction`/`forkResumeAction` (Task 8), `getResumeVersionWithContent`/`getResumeTreeHistory` (Task 7), `listLatestObjectsAction` (Task 5), `ObjectPickerModal` (Task 9).
- Produces: `HistoryTab` now takes `{ userId, resumeId, resumeName, currentId }` (added `resumeName`, renamed `rootVersionId` → `resumeId`).

This task is a mechanical rename pass: `objectVersionId` → `objectRevisionId`, `rootVersionId` → `objectVariationId` (for objects) or `resumeId` (for resumes), `item.objectVersion.*` → `item.objectRevision.*`.

- [ ] **Step 1: `ResumeForm.tsx`**

```tsx
// src/app/(app)/resumes/ResumeForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createResumeAction, editResumeAction, forkResumeAction } from '@/app/resumes/actions';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import { listLatestObjectsAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TYPES: ObjectType[] = ['WORK_EXPERIENCE', 'EDUCATION', 'SKILLS', 'SUMMARY', 'PROJECT', 'CERTIFICATION', 'EXTRACURRICULAR'];

// Mirrors ObjectPickerModal's ObjectSummary (objectRevisionId instead of id, since that's
// what a resume section stores) so recentObjects/prefillFrom never have to fabricate data.
type Item = {
  objectRevisionId: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  objectVariationId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
};
// What ObjectPickerModal's onPick now hands back (the full saved/picked object).
type Picked = {
  id: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  objectVariationId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
};

function toItem(picked: Picked): Item {
  return {
    objectRevisionId: picked.id,
    body: picked.body,
    fields: picked.fields,
    tags: picked.tags,
    objectVariationId: picked.objectVariationId,
    versionNumber: picked.versionNumber,
    createdAt: picked.createdAt,
  };
}

type Props = {
  mode: 'create' | 'edit' | 'fork';
  sourceId?: string;
  initialName?: string;
  initialSections?: Array<{ sectionType: ObjectType; items: Item[] }>;
  versionInfo?: string; // e.g. "v3" or "forked from Senior PM Resume"
};

export function ResumeForm({ mode, sourceId, initialName = '', initialSections = [], versionInfo }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [sections, setSections] = useState(initialSections);
  const [recent, setRecent] = useState<Record<string, Item[]>>({});

  function addSectionType(type: ObjectType) {
    if (sections.some((s) => s.sectionType === type)) return;
    setSections([...sections, { sectionType: type, items: [] }]);
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSections((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  async function openPickerFor(type: ObjectType) {
    if (!recent[type]) {
      const objs = await listLatestObjectsAction(type);
      setRecent((r) => ({
        ...r,
        [type]: objs.map((o) => ({
          objectRevisionId: o.id,
          body: o.body,
          fields: o.fields,
          tags: o.tags,
          objectVariationId: o.objectVariationId,
          versionNumber: o.versionNumber,
          createdAt: o.createdAt,
        })),
      }));
    }
  }

  function addItem(type: ObjectType, item: Item) {
    setSections((prev) => prev.map((s) => (s.sectionType === type ? { ...s, items: [...s.items, item] } : s)));
  }

  // Item-level edit (Figma's per-item "Edit" button): reuses ObjectPickerModal's prefillFrom,
  // same edit-in-place semantics as the dashboard's chip pencil icon (new revision, same variation).
  function replaceItem(type: ObjectType, oldObjectRevisionId: string, picked: Picked) {
    setSections((prev) =>
      prev.map((s) =>
        s.sectionType === type
          ? {
              ...s,
              items: s.items.map((it) => (it.objectRevisionId === oldObjectRevisionId ? toItem(picked) : it)),
            }
          : s
      )
    );
  }

  // Canonical form: name + ordered objectRevisionIds per section. Editing an item's content
  // yields a new objectRevisionId (a new object revision), so this also catches content edits,
  // not just add/remove/reorder.
  function canonical(n: string, s: typeof sections) {
    return JSON.stringify({
      name: n.trim(),
      sections: s.map((sec) => ({ type: sec.sectionType, items: sec.items.map((it) => it.objectRevisionId) })),
    });
  }

  const unchanged =
    mode !== 'create' && canonical(name, sections) === canonical(initialName, initialSections);
  const hasNoItems = sections.every((s) => s.items.length === 0);

  async function handleSubmit() {
    const payload = sections.map((s, i) => ({
      sectionType: s.sectionType,
      order: i,
      items: s.items.map((it, j) => ({ objectRevisionId: it.objectRevisionId, order: j })),
    }));

    const result =
      mode === 'create'
        ? await createResumeAction(name, payload)
        : mode === 'edit'
          ? await editResumeAction(sourceId!, name, payload)
          : await forkResumeAction(sourceId!, name, payload);

    router.push(`/resumes/${result.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {versionInfo && <p className="text-sm text-muted-foreground">{versionInfo}</p>}
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Resume name" required className="max-w-md" />

      {sections.map((section, index) => (
        <fieldset key={section.sectionType} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <legend className="flex items-center gap-2 px-1 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {section.sectionType}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => moveSection(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => moveSection(index, 1)}
              disabled={index === sections.length - 1}
              aria-label="Move down"
            >
              <ArrowDown className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeSection(index)} aria-label="Delete section">
              <X className="size-3.5" />
            </Button>
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {section.items.map((item) => (
              <ObjectVersionChip
                key={item.objectRevisionId}
                type={section.sectionType}
                version={{ id: item.objectRevisionId, body: item.body, fields: item.fields, tags: item.tags }}
                editTrigger={
                  <ObjectPickerModal
                    type={section.sectionType}
                    prefillFrom={{ id: item.objectRevisionId, body: item.body, fields: item.fields, tags: item.tags, versionNumber: 0 }}
                    onPick={(picked) => replaceItem(section.sectionType, item.objectRevisionId, picked)}
                    triggerLabel="✎"
                  />
                }
              />
            ))}
          </div>
          <ObjectPickerModal
            type={section.sectionType}
            recentObjects={(recent[section.sectionType] ?? []).map((r) => ({
              id: r.objectRevisionId,
              objectVariationId: r.objectVariationId,
              body: r.body,
              versionNumber: r.versionNumber ?? 0,
              fields: r.fields,
              tags: r.tags,
              createdAt: r.createdAt,
            }))}
            onOpen={() => openPickerFor(section.sectionType)}
            onPick={(picked) => addItem(section.sectionType, toItem(picked))}
          />
        </fieldset>
      ))}

      <select
        onChange={(e) => e.target.value && addSectionType(e.target.value as ObjectType)}
        value=""
        className="h-9 max-w-xs rounded-md border border-border bg-background px-3 py-0 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">+ Add Section</option>
        {TYPES.filter((t) => !sections.some((s) => s.sectionType === t)).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!name.trim() || hasNoItems || unchanged}
        className="self-start"
        title={
          !name.trim()
            ? 'Resume title is required'
            : hasNoItems
              ? 'Add at least one object'
              : unchanged
                ? 'No changes to save'
                : undefined
        }
      >
        {mode === 'create' ? 'Done' : mode === 'edit' ? 'Save new version' : 'Save fork'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: `HistoryTab.tsx`**

```tsx
// src/app/(app)/resumes/[id]/HistoryTab.tsx
import { getResumeTreeHistory } from '@/lib/resumes/queries';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export async function HistoryTab({
  userId,
  resumeId,
  resumeName,
  currentId,
}: {
  userId: string;
  resumeId: string;
  // Name is on the Resume identity row now, shared by every revision — the caller
  // already has it (from getResumeVersionWithContent), so it's passed down instead
  // of this component running its own extra query for it.
  resumeName: string;
  currentId: string;
}) {
  const history = await getResumeTreeHistory(userId, resumeId);

  return (
    <ul className="flex flex-col gap-1">
      {history.map((v, i) => (
        <li key={v.id} className="mb-0">
          <Link
            href={`/resumes/${v.id}`}
            className={cn(
              'block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
              v.id === currentId ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            Version {i + 1} {v.id === currentId && '(current)'} — {resumeName}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: `resumes/[id]/page.tsx`**

```tsx
// src/app/(app)/resumes/[id]/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { HistoryTab } from './HistoryTab';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function ViewResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const userId = await getCurrentUserId();
  const resume = await getResumeVersionWithContent(userId, id);
  const tab = tabParam ?? 'resume';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="mb-0 text-2xl font-semibold tracking-tight text-foreground">{resume.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">edited {resume.createdAt.toISOString().slice(0, 10)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" render={<Link href={`/resumes/${resume.id}/fork`} />}>
            Fork
          </Button>
          <Button render={<Link href={`/resumes/${resume.id}/edit`} />}>Edit</Button>
        </div>
      </div>

      <nav className="mb-0 flex gap-5 border-b border-border pb-2 text-sm">
        <Link
          href={`/resumes/${resume.id}?tab=resume`}
          className={cn('transition-colors', tab === 'resume' ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          Resume
        </Link>
        <Link
          href={`/resumes/${resume.id}?tab=history`}
          className={cn('transition-colors', tab === 'history' ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          History
        </Link>
        <span className="text-muted-foreground" title="Coming later — per-resume AI chat, not in Spike 1">
          Chat
        </span>
      </nav>

      {tab === 'resume' &&
        resume.sections.map((section) => (
          <div key={section.id} className="flex flex-col gap-2">
            <h2 className="my-0 font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">{section.sectionType}</h2>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-dashed border-border p-3">
              {section.items.map((item) => (
                <ObjectVersionChip key={item.id} type={section.sectionType} version={item.objectRevision} />
              ))}
            </div>
          </div>
        ))}

      {tab === 'history' && (
        <HistoryTab userId={userId} resumeId={resume.resumeId} resumeName={resume.name} currentId={resume.id} />
      )}
    </div>
  );
}
```

Note: `type={section.sectionType}` replaces `type={item.objectVersion.type as ObjectType}` — section membership is FK-real now, so the section's own type is always the item's type; the cast is gone along with the import of `ObjectType` (no longer referenced directly in this file).

- [ ] **Step 4: `resumes/[id]/edit/page.tsx`**

```tsx
// src/app/(app)/resumes/[id]/edit/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { ResumeForm } from '../../ResumeForm';

export default async function EditResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const resume = await getResumeVersionWithContent(userId, id);

  return (
    <ResumeForm
      mode="edit"
      sourceId={resume.id}
      initialName={resume.name}
      initialSections={resume.sections.map((s) => ({
        sectionType: s.sectionType,
        items: s.items.map((it) => ({
          objectRevisionId: it.objectRevisionId,
          body: it.objectRevision.body,
          fields: it.objectRevision.fields,
          tags: it.objectRevision.tags,
          objectVariationId: it.objectRevision.objectVariationId,
          versionNumber: it.objectRevision.versionNumber,
          createdAt: it.objectRevision.createdAt,
        })),
      }))}
      versionInfo={`Editing from v${resume.id.slice(0, 8)}`}
    />
  );
}
```

- [ ] **Step 5: `resumes/[id]/fork/page.tsx`**

```tsx
// src/app/(app)/resumes/[id]/fork/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { ResumeForm } from '../../ResumeForm';

export default async function ForkResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const source = await getResumeVersionWithContent(userId, id);

  return (
    <ResumeForm
      mode="fork"
      sourceId={source.id}
      initialName={`Fork of ${source.name}`}
      initialSections={source.sections.map((s) => ({
        sectionType: s.sectionType,
        items: s.items.map((it) => ({
          objectRevisionId: it.objectRevisionId,
          body: it.objectRevision.body,
          fields: it.objectRevision.fields,
          tags: it.objectRevision.tags,
          objectVariationId: it.objectRevision.objectVariationId,
          versionNumber: it.objectRevision.versionNumber,
          createdAt: it.objectRevision.createdAt,
        })),
      }))}
      versionInfo={`Forked from ${source.name}`}
    />
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere under `src/app/(app)/resumes/`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/resumes"
git commit -m "refactor(resumes): UI uses objectRevisionId/objectVariationId/resumeId"
```

---

## Task 12: Seed script + final verification

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `createObject`, `editObjectRevision` (Task 2), `createResumeFromScratch` (Task 6).

- [ ] **Step 1: Update the seed script's function calls and cleanup**

```ts
// prisma/seed.ts — only the changed lines shown; the sample data itself is unchanged
import { prisma } from '@/lib/prisma';
import { createObject, editObjectRevision } from '@/lib/objects/versioning';
import { createResumeFromScratch } from '@/lib/resumes/versioning';
import { hashPassword } from '@/lib/password';

// ...

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: { email: DEMO_EMAIL, passwordHash },
  });

  // Delete children before parents (no onDelete: Cascade in the schema).
  await prisma.sectionObject.deleteMany({ where: { resumeSection: { resumeRevision: { resume: { ownerUserId: user.id } } } } });
  await prisma.resumeSection.deleteMany({ where: { resumeRevision: { resume: { ownerUserId: user.id } } } });
  await prisma.resumeRevision.deleteMany({ where: { resume: { ownerUserId: user.id } } });
  await prisma.resume.deleteMany({ where: { ownerUserId: user.id } });
  await prisma.objectRevision.deleteMany({ where: { objectVariation: { object: { ownerUserId: user.id } } } });
  await prisma.objectVariation.deleteMany({ where: { object: { ownerUserId: user.id } } });
  await prisma.resumeObject.deleteMany({ where: { ownerUserId: user.id } });

  const techCorpV1 = await createObject(
    user.id,
    'WORK_EXPERIENCE',
    { company: 'TechCorp', title: 'Software Engineer', location: 'San Francisco, CA', startDate: '2022-01' },
    'Built and maintained internal tooling for the platform team.',
    ['current']
  );
  const techCorp = await editObjectRevision(
    user.id,
    techCorpV1.id,
    { company: 'TechCorp', title: 'Senior Software Engineer', location: 'San Francisco, CA', startDate: '2022-01' },
    '- Led the migration of the internal tooling platform to a service-oriented architecture.\n- Mentored two junior engineers.\n- Shipped a self-serve deployment pipeline used by 8 teams.',
    ['current']
  );

  // ... (every other createObjectVersion call in this file becomes createObject, unchanged arguments)

  await createResumeFromScratch(user.id, 'Software Engineer Resume', [
    { sectionType: 'SUMMARY', order: 0, items: [{ objectRevisionId: summary.id, order: 0 }] },
    {
      sectionType: 'WORK_EXPERIENCE',
      order: 1,
      items: [
        { objectRevisionId: techCorp.id, order: 0 },
        { objectRevisionId: startupXYZ.id, order: 1 },
      ],
    },
    { sectionType: 'EDUCATION', order: 2, items: [{ objectRevisionId: education.id, order: 0 }] },
    {
      sectionType: 'SKILLS',
      order: 3,
      items: [
        { objectRevisionId: skillsLangs.id, order: 0 },
        { objectRevisionId: skillsTools.id, order: 1 },
      ],
    },
    { sectionType: 'PROJECT', order: 4, items: [{ objectRevisionId: project.id, order: 0 }] },
    { sectionType: 'CERTIFICATION', order: 5, items: [{ objectRevisionId: certification.id, order: 0 }] },
  ]);

  const count = await prisma.objectRevision.count({ where: { objectVariation: { object: { ownerUserId: user.id } } } });
  console.log(`Seeded ${count} object revisions and 1 resume for ${DEMO_EMAIL}.`);
}
```

Every other `createObjectVersion(...)` call in the file (StartupXYZ, education, skillsLangs, skillsTools, summary, project, certification, extracurricular) becomes `createObject(...)` with the same arguments — no other changes needed.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file from Tasks 1–8 now runs against the fully-migrated schema.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Smoke-test the seed script against your local dev DB**

Run: `npm run db:seed`
Expected: `Seeded 9 object revisions and 1 resume for demo@example.com.` (or similar), no errors.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, log in as `demo@example.com` / `devpassword123`, and check:
- `/dashboard/objects` renders variation sub-cards; clicking "+ Variation" on one opens a form pre-filled from that variation's latest content and creates a sibling variation on save.
- `/dashboard/resumes` still shows the seeded resume with correct fork-tree indentation (none expected here, single resume).
- Opening the seeded resume, then its History tab, still lists its version(s).
- Editing the resume and saving still redirects to a new version's page.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): update seed script for the object/resume normalization"
```
