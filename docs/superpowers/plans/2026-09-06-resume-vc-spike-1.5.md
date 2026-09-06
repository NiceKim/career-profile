# Object Version Three-Tier Redesign (Spike 1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third identity field (`originVersionId`) to `ObjectVersion` so objects can have multiple tailored **variations** (each with its own linear edit history under `rootVersionId`) grouped under one **object**, and update the Object Dashboard to show object cards containing variation sub-cards with Edit / New Variation actions and a history+usage detail popup. Also defer object writes made *while authoring a resume* until the resume itself is submitted, instead of writing them immediately.

**Architecture:** No new tables (same "identity lives on the version row" principle as the rest of the schema). `rootVersionId`'s meaning narrows from "this object" to "this variation" — it now resets when a new variation is forked instead of being permanent. `originVersionId` is the new permanent anchor, propagated unchanged through every edit and every fork, however many variations deep.

**Tech Stack:** Next.js (App Router, Server Actions), TypeScript, Prisma + Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-resume-version-control-design.md` (Data Model + Core Flows → Dashboards sections, updated 2026-09-06; Core Flows → Writing a resume version + Error Handling, updated 2026-09-07)

## Sequencing note

`docs/superpowers/plans/2026-09-07-section-object-fk.md` also rewrites `src/lib/objects/dashboard.ts` (its Task 4), and recommends running before this plan. If that plan has already been executed by the time you reach Task 3 below, `ObjectVersion`'s resume-usage relation is `sectionObjects` (not `resumeVersionItems`) and reaching a resume now takes one more hop: `item.section.resumeVersion.name` (not `item.resumeVersion.name`). Adapt Task 3's code to that shape instead of replacing the file wholesale.

## Global Constraints

- Every mutation/query filters by the authenticated `ownerUserId` — a client-supplied id is always checked for ownership before use (spec's "Error Handling" section).
- Every save is an immutable insert, never an update (spec's "Concurrent saves" rule) — `forkObjectVersion` follows this same pattern as `createObjectVersion`/`editObjectVersion`.
- `fields` is validated by `validateObjectFields` (Zod, per `type`) before persistence — every write path uses it.
- TDD: write the failing test first, then the minimal implementation, for every task below.

---

### Task 1: Schema migration — add `originVersionId`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_object_origin_version_id/migration.sql`

**Interfaces:**
- Produces: `ObjectVersion.originVersionId` (`String`, not null, indexed) — consumed by Task 2 (versioning), Task 3 (dashboard).

- [ ] **Step 1: Add the field to the schema**

In `prisma/schema.prisma`, in `model ObjectVersion`, add the field right after `rootVersionId` and add its index next to the existing ones:

```prisma
model ObjectVersion {
  id              String     @id @default(uuid())
  originVersionId String
  rootVersionId   String
  ownerUserId     String
  owner           User       @relation(fields: [ownerUserId], references: [id])
  type            ObjectType
  versionNumber   Int
  fields          Json
  body            String
  tags            String[]   @default([])
  createdAt       DateTime   @default(now())

  resumeVersionItems ResumeVersionItem[]

  @@index([ownerUserId])
  @@index([rootVersionId])
  @@index([originVersionId])
}
```

- [ ] **Step 2: Generate an empty migration to edit by hand**

Run: `npx prisma migrate dev --name add_object_origin_version_id --create-only`

This creates `prisma/migrations/<timestamp>_add_object_origin_version_id/migration.sql` with Prisma's auto-generated (nullable-first) SQL. It won't be applied yet.

- [ ] **Step 3: Replace the generated SQL with a backfilling version**

Every existing `ObjectVersion` row today is its own object with no variations yet (this redesign is what *introduces* variations) — so backfill is exactly `originVersionId = rootVersionId`. Overwrite the migration file's contents with:

```sql
-- AlterTable
ALTER TABLE "ObjectVersion" ADD COLUMN "originVersionId" TEXT;

-- Backfill: every existing row is currently its own object (no variations exist yet)
UPDATE "ObjectVersion" SET "originVersionId" = "rootVersionId";

-- Now safe to enforce NOT NULL
ALTER TABLE "ObjectVersion" ALTER COLUMN "originVersionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ObjectVersion_originVersionId_idx" ON "ObjectVersion"("originVersionId");
```

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate dev`
Expected: `Your database is now in sync with your schema.` and the Prisma Client is regenerated (so `ObjectVersion` types include `originVersionId`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add ObjectVersion.originVersionId"
```

---

### Task 2: `originVersionId` propagation + `forkObjectVersion`

**Files:**
- Modify: `src/lib/objects/versioning.ts`
- Test: `src/lib/objects/versioning.test.ts`

**Interfaces:**
- Consumes: `validateObjectFields(type, fields)` from `./schemas` (existing).
- Produces: `forkObjectVersion(userId: string, sourceVersionId: string, fields: unknown, body: string, tags?: string[]): Promise<ObjectVersion>` — consumed by Task 4 (`forkObjectAction`).
- `createObjectVersion`/`editObjectVersion` signatures are unchanged; only their written `originVersionId` value is new.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/objects/versioning.test.ts` (inside the existing `describe('object versioning', ...)` block, using the existing local `makeUser` helper):

```ts
  it('creates a first version whose originVersionId equals its own id', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    expect(v1.originVersionId).toBe(v1.id);
  });

  it('edit propagates originVersionId unchanged', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    expect(v2.originVersionId).toBe(v1.originVersionId);
  });

  it('forking starts a new variation: new rootVersionId, same originVersionId, versionNumber 1', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const fork = await forkObjectVersion(user.id, v2.id, { category: 'Languages' }, 'Python (data focus)', ['Data']);

    expect(fork.rootVersionId).toBe(fork.id);
    expect(fork.rootVersionId).not.toBe(v1.rootVersionId);
    expect(fork.originVersionId).toBe(v1.originVersionId);
    expect(fork.versionNumber).toBe(1);
    expect(fork.tags).toEqual(['Data']);
  });

  it('forking from an already-forked variation still traces back to the true origin', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const forkA = await forkObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python (backend)');
    const forkB = await forkObjectVersion(user.id, forkA.id, { category: 'Languages' }, 'Python (backend, senior)');

    expect(forkB.originVersionId).toBe(v1.originVersionId);
    expect(forkB.rootVersionId).not.toBe(forkA.rootVersionId);
  });

  it('rejects forking a version owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b2@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(owner.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await expect(
      forkObjectVersion(attacker.id, v1.id, { category: 'Languages' }, 'hacked')
    ).rejects.toThrow('Not authorized');
  });
```

Update the import line at the top of the test file to include the new function:

```ts
import { createObjectVersion, editObjectVersion, forkObjectVersion } from './versioning';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/objects/versioning.test.ts`
Expected: FAIL — `originVersionId` is `undefined` on existing rows, and `forkObjectVersion` is not exported.

- [ ] **Step 3: Implement**

Replace the full contents of `src/lib/objects/versioning.ts`:

```ts
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { validateObjectFields, type ObjectType } from './schemas';

export async function createObjectVersion(
  userId: string,
  type: ObjectType,
  fields: unknown,
  body: string,
  tags: string[] = []
) {
  const validated = validateObjectFields(type, fields);
  const id = randomUUID();
  return prisma.objectVersion.create({
    data: {
      id,
      originVersionId: id,
      rootVersionId: id,
      ownerUserId: userId,
      type,
      versionNumber: 1,
      fields: validated,
      body,
      tags,
    },
  });
}

export async function editObjectVersion(
  userId: string,
  existingVersionId: string,
  fields: unknown,
  body: string,
  tags: string[] = []
) {
  const existing = await prisma.objectVersion.findUnique({ where: { id: existingVersionId } });
  if (!existing) throw new Error('Object version not found');
  if (existing.ownerUserId !== userId) throw new Error('Not authorized');

  const validated = validateObjectFields(existing.type as ObjectType, fields);
  const latest = await prisma.objectVersion.findFirst({
    where: { rootVersionId: existing.rootVersionId },
    orderBy: { versionNumber: 'desc' },
  });
  const id = randomUUID();
  return prisma.objectVersion.create({
    data: {
      id,
      originVersionId: existing.originVersionId,
      rootVersionId: existing.rootVersionId,
      ownerUserId: userId,
      type: existing.type,
      versionNumber: latest!.versionNumber + 1,
      fields: validated,
      body,
      tags,
    },
  });
}

// Starts a new variation (a tailored branch of the same object), pre-filled from sourceVersionId's
// content. Unlike editObjectVersion, rootVersionId resets to the new row's own id (new variation,
// new linear history) while originVersionId propagates from the source — so it keeps tracing back
// to the object's true origin no matter how many variations deep the fork chain goes.
export async function forkObjectVersion(
  userId: string,
  sourceVersionId: string,
  fields: unknown,
  body: string,
  tags: string[] = []
) {
  const source = await prisma.objectVersion.findUnique({ where: { id: sourceVersionId } });
  if (!source) throw new Error('Object version not found');
  if (source.ownerUserId !== userId) throw new Error('Not authorized');

  const validated = validateObjectFields(source.type as ObjectType, fields);
  const id = randomUUID();
  return prisma.objectVersion.create({
    data: {
      id,
      originVersionId: source.originVersionId,
      rootVersionId: id,
      ownerUserId: userId,
      type: source.type,
      versionNumber: 1,
      fields: validated,
      body,
      tags,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/objects/versioning.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/objects/versioning.ts src/lib/objects/versioning.test.ts
git commit -m "feat: propagate originVersionId, add forkObjectVersion"
```

---

### Task 3: Two-level `getObjectDashboard` + `getVariationDetail`

**Files:**
- Modify: `src/lib/objects/dashboard.ts`
- Modify: `src/lib/objects/dashboard.test.ts`

**Interfaces:**
- Produces:
  - `getObjectDashboard(userId: string): Promise<ObjectEntry[]>` where
    `ObjectEntry = { originVersionId: string; type: ObjectType; variations: VariationSummary[] }`
    `VariationSummary = { rootVersionId: string; id: string; versionNumber: number; fields: unknown; body: string; tags: string[]; createdAt: Date }`
    (one `VariationSummary` per variation — its **latest** version only)
  - `getVariationDetail(userId: string, rootVersionId: string): Promise<VariationDetail>` where
    `VariationDetail = { rootVersionId: string; type: ObjectType; versions: Array<VariationSummary & { usedInResumeNames: string[] }>; usedInResumeNames: string[] }`
    (`versions` oldest-to-newest; the outer `usedInResumeNames` is deduped across every version sharing this `rootVersionId`)
  - Both consumed by Task 4 (`actions.ts`) and Task 7 (UI).

This replaces the old single-level `getObjectDashboard` shape (`{ rootVersionId, type, versions: [...with usedInResumeNames per version] }`) — the per-version resume-usage list moves from the dashboard card into the new detail popup, per the spec's Dashboards section update.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/lib/objects/dashboard.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion, editObjectVersion, forkObjectVersion } from './versioning';
import { createResumeFromScratch, editResume } from '../resumes/versioning';
import { getObjectDashboard, getVariationDetail } from './dashboard';

describe('getObjectDashboard', () => {
  beforeEach(resetDb);

  it('groups variations under one object entry, showing only the latest version of each', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const fork = await forkObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python (data)', ['Data']);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard).toHaveLength(1);
    const [entry] = dashboard;
    expect(entry.originVersionId).toBe(v1.originVersionId);
    expect(entry.variations).toHaveLength(2);
    const editedVariation = entry.variations.find((v) => v.rootVersionId === v1.rootVersionId)!;
    const forkedVariation = entry.variations.find((v) => v.rootVersionId === fork.rootVersionId)!;
    expect(editedVariation.body).toBe('Python, TypeScript'); // latest of the edited variation, not v1
    expect(forkedVariation.body).toBe('Python (data)');
  });

  it('keeps unrelated objects in separate entries', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await createObjectVersion(user.id, 'SKILLS', { category: 'Tools' }, 'Docker');

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard).toHaveLength(2);
  });
});

describe('getVariationDetail', () => {
  beforeEach(resetDb);

  it('returns full history oldest-first and the resumes using any version of this variation', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const resumeRoot = await createResumeFromScratch(user.id, 'My Resume');
    await editResume(user.id, resumeRoot.id, undefined, [
      { sectionType: 'SKILLS', order: 0, items: [{ objectVersionId: v1.id, order: 0 }] },
    ]);

    const detail = await getVariationDetail(user.id, v1.rootVersionId);

    expect(detail.versions.map((v) => v.id)).toEqual([v1.id, v2.id]);
    expect(detail.versions.find((v) => v.id === v1.id)?.usedInResumeNames).toEqual(['My Resume']);
    expect(detail.versions.find((v) => v.id === v2.id)?.usedInResumeNames).toEqual([]);
    expect(detail.usedInResumeNames).toEqual(['My Resume']);
  });

  it('scopes to the requesting user, returning an empty history for another user\'s variation', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner@example.com', passwordHash: 'x' } });
    const attacker = await prisma.user.create({ data: { email: 'attacker@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(owner.id, 'SKILLS', { category: 'Languages' }, 'Python');

    const detail = await getVariationDetail(attacker.id, v1.rootVersionId);

    expect(detail.versions).toEqual([]);
    expect(detail.usedInResumeNames).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/objects/dashboard.test.ts`
Expected: FAIL — `getVariationDetail` is not exported, and `getObjectDashboard`'s return shape doesn't have `originVersionId`/`variations`.

- [ ] **Step 3: Implement**

Replace the full contents of `src/lib/objects/dashboard.ts`:

```ts
import { prisma } from '@/lib/prisma';

export async function getObjectDashboard(userId: string) {
  const versions = await prisma.objectVersion.findMany({
    where: { ownerUserId: userId },
    orderBy: { versionNumber: 'asc' },
  });

  // One entry per variation (rootVersionId), keeping only its latest version.
  const latestByVariation = new Map<string, (typeof versions)[number]>();
  for (const v of versions) {
    latestByVariation.set(v.rootVersionId, v); // versionNumber asc, so the last write wins
  }

  // Group those latest-per-variation rows by originVersionId (the object).
  const objectGroups = new Map<string, (typeof versions)[number][]>();
  for (const v of latestByVariation.values()) {
    const group = objectGroups.get(v.originVersionId) ?? [];
    group.push(v);
    objectGroups.set(v.originVersionId, group);
  }

  return Array.from(objectGroups.entries()).map(([originVersionId, variations]) => ({
    originVersionId,
    type: variations[0].type,
    variations: variations.map((v) => ({
      rootVersionId: v.rootVersionId,
      id: v.id,
      versionNumber: v.versionNumber,
      fields: v.fields,
      body: v.body,
      tags: v.tags,
      createdAt: v.createdAt,
    })),
  }));
}

export async function getVariationDetail(userId: string, rootVersionId: string) {
  const versions = await prisma.objectVersion.findMany({
    where: { ownerUserId: userId, rootVersionId },
    orderBy: { versionNumber: 'asc' },
    include: {
      resumeVersionItems: { include: { resumeVersion: true } },
    },
  });

  const versionsWithUsage = versions.map((v) => ({
    rootVersionId: v.rootVersionId,
    id: v.id,
    versionNumber: v.versionNumber,
    fields: v.fields,
    body: v.body,
    tags: v.tags,
    createdAt: v.createdAt,
    usedInResumeNames: v.resumeVersionItems.map((item) => item.resumeVersion.name),
  }));

  const usedInResumeNames = Array.from(new Set(versionsWithUsage.flatMap((v) => v.usedInResumeNames)));

  return {
    rootVersionId,
    type: versions[0]?.type,
    versions: versionsWithUsage,
    usedInResumeNames,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/objects/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/objects/dashboard.ts src/lib/objects/dashboard.test.ts
git commit -m "feat: two-level object/variation dashboard grouping + getVariationDetail"
```

---

### Task 4: Server actions — `forkObjectAction`, `getVariationDetailAction`

**Files:**
- Modify: `src/app/objects/actions.ts`
- Modify: `src/app/objects/actions.test.ts`

**Interfaces:**
- Consumes: `forkObjectVersion` (Task 2), `getVariationDetail` (Task 3).
- Produces: `forkObjectAction(sourceVersionId: string, fields: unknown, body: string, tags?: string[])`, `getVariationDetailAction(rootVersionId: string)` — both consumed by Task 7 (UI).

- [ ] **Step 1: Write the failing tests**

Add to `src/app/objects/actions.test.ts`:

```ts
  it('forkObjectAction starts a new variation scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'fork@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const forked = await forkObjectAction(created.id, { category: 'Languages' }, 'Python (data)', ['Data']);

    expect(forked.rootVersionId).not.toBe(created.rootVersionId);
    const stored = await prisma.objectVersion.findUnique({ where: { id: forked.id } });
    expect(stored?.ownerUserId).toBe(user.id);
    expect(stored?.originVersionId).toBe(created.rootVersionId);
  });

  it('getVariationDetailAction returns history and resume usage for the given variation', async () => {
    const user = await prisma.user.create({ data: { email: 'detail@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');
    await editObjectAction(created.id, { category: 'Languages' }, 'Python, TypeScript');

    const detail = await getVariationDetailAction(created.rootVersionId);

    expect(detail.versions).toHaveLength(2);
    expect(detail.usedInResumeNames).toEqual([]);
  });
```

Update the import line at the top of the test file:

```ts
import {
  createObjectAction,
  editObjectAction,
  forkObjectAction,
  listLatestObjectsAction,
  getObjectHistoryAction,
  getVariationDetailAction,
} from './actions';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/objects/actions.test.ts`
Expected: FAIL — `forkObjectAction`/`getVariationDetailAction` are not exported.

- [ ] **Step 3: Implement**

In `src/app/objects/actions.ts`, update the imports and add the two new actions:

```ts
'use server';

import { getCurrentUserId } from '@/lib/session';
import { createObjectVersion, editObjectVersion, forkObjectVersion } from '@/lib/objects/versioning';
import { listLatestObjectsForUser, getObjectHistory } from '@/lib/objects/queries';
import { getVariationDetail } from '@/lib/objects/dashboard';
import type { ObjectType } from '@/lib/objects/schemas';
```

(keep `createObjectAction`, `editObjectAction`, `listLatestObjectsAction`, `getObjectHistoryAction` as they are), then append:

```ts
export async function forkObjectAction(sourceVersionId: string, fields: unknown, body: string, tags: string[] = []) {
  const userId = await getCurrentUserId();
  const version = await forkObjectVersion(userId, sourceVersionId, fields, body, tags);
  return {
    id: version.id,
    rootVersionId: version.rootVersionId,
    originVersionId: version.originVersionId,
    versionNumber: version.versionNumber,
    fields: version.fields,
    body: version.body,
    tags: version.tags,
    createdAt: version.createdAt,
  };
}

export async function getVariationDetailAction(rootVersionId: string) {
  const userId = await getCurrentUserId();
  return getVariationDetail(userId, rootVersionId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/objects/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/objects/actions.ts src/app/objects/actions.test.ts
git commit -m "feat: add forkObjectAction and getVariationDetailAction"
```

---

### Task 5: `ObjectPickerModal` — support fork mode

**Files:**
- Modify: `src/components/ObjectPickerModal.tsx`

**Interfaces:**
- Consumes: `forkObjectAction` (Task 4), existing `editObjectAction`/`createObjectAction`.
- Produces: new prop `mode?: 'edit' | 'fork'` (only meaningful when `prefillFrom` is set; defaults to `'edit'`, preserving every existing caller's behavior) — consumed by Task 7 (UI, for the "New Variation" button).

No test file exists for this component (it's a client component exercised via the object dashboard's own tests/manual QA, consistent with the rest of `src/components/`) — this task is UI wiring, verified in Task 7's manual check.

- [ ] **Step 1: Add the `mode` prop and branch the submit handler**

In `src/components/ObjectPickerModal.tsx`:

1. Import `forkObjectAction` alongside the existing imports:

```ts
import { createObjectAction, editObjectAction, forkObjectAction, getObjectHistoryAction } from '@/app/objects/actions';
```

2. Add `mode` to the `Props` type and destructure it with a default:

```ts
type Props = {
  type: ObjectType;
  recentObjects?: ObjectSummary[];
  onPick: (picked: ObjectSummary) => void;
  triggerLabel?: string;
  editingRootVersionId?: string;
  prefillFrom?: ObjectSummary;
  // 'edit' (default) saves a new version of prefillFrom's own variation (same rootVersionId).
  // 'fork' starts a brand-new variation pre-filled from prefillFrom's content (new rootVersionId,
  // same originVersionId) — only meaningful together with prefillFrom.
  mode?: 'edit' | 'fork';
  onOpen?: () => void;
};
```

```ts
export function ObjectPickerModal({
  type,
  recentObjects = [],
  onPick,
  triggerLabel = '+ Object',
  editingRootVersionId,
  prefillFrom,
  mode = 'edit',
  onOpen,
}: Props) {
```

3. Update the form's heading/legend and submit handler to branch on `mode`:

```tsx
            <h2>{prefillFrom ? (mode === 'fork' ? `New ${type} variation` : `Edit ${type}`) : `Add Object — ${type}`}</h2>
```

```tsx
            <fieldset>
              <legend>{prefillFrom ? (mode === 'fork' ? 'Edit fields for the new variation, then save' : 'Edit fields, then save') : 'or create new'}</legend>
              <form
                action={async (formData) => {
                  const fields = Object.fromEntries(
                    FIELDS_BY_TYPE[type].map((f) => [f.name, String(formData.get(f.name) ?? '')])
                  );
                  const body = String(formData.get('body'));
                  const tags = parseTags(formData.get('tags'));
                  const saved = prefillFrom
                    ? mode === 'fork'
                      ? await forkObjectAction(prefillFrom.id, fields, body, tags)
                      : await editObjectAction(prefillFrom.id, fields, body, tags)
                    : await createObjectAction(type, fields, body, tags);
                  pick(saved);
                }}
              >
```

4. Update the submit button label:

```tsx
                <button type="submit">{prefillFrom ? (mode === 'fork' ? 'Create variation' : 'Save new version') : 'Create'}</button>
```

- [ ] **Step 2: Manual check (no automated test for this component)**

Run: `npx vitest run` (confirm nothing else broke) and proceed to Task 7 where this prop is exercised end-to-end.
Expected: PASS (existing suite unaffected — every current caller passes `prefillFrom` without `mode`, defaulting to `'edit'`, so behavior for existing callers is unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/components/ObjectPickerModal.tsx
git commit -m "feat: ObjectPickerModal supports fork mode for new variations"
```

---

### Task 6: Object Dashboard page — update tag filtering for the two-level shape

**Files:**
- Modify: `src/app/(app)/dashboard/objects/page.tsx`

**Interfaces:**
- Consumes: `getObjectDashboard` (Task 3)'s new `ObjectEntry[]` shape.

- [ ] **Step 1: Update the tag filter to check every variation's latest version**

Replace the full contents of `src/app/(app)/dashboard/objects/page.tsx`:

```tsx
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

(the only change from today is `entry.versions.some(...)` → `entry.variations.some(...)`, matching Task 3's renamed field)

- [ ] **Step 2: Commit**

```bash
git add "src/app/(app)/dashboard/objects/page.tsx"
git commit -m "fix: update object dashboard tag filter for two-level shape"
```

(No standalone test — this page is a thin server component; it's exercised by Task 7's manual check of the full dashboard.)

---

### Task 7: Object Dashboard UI — object cards, variation sub-cards, detail popup

**Files:**
- Modify: `src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx`
- Modify: `src/app/(app)/dashboard/objects/ObjectDashboardClient.module.css`

**Interfaces:**
- Consumes: `getObjectDashboard`'s `ObjectEntry[]` (Task 3), `getVariationDetailAction` (Task 4), `ObjectPickerModal`'s `mode` prop (Task 5), existing `ObjectVersionChip`.

- [ ] **Step 1: Replace `ObjectDashboardClient.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getVariationDetailAction } from '@/app/objects/actions';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import type { ObjectType } from '@/lib/objects/schemas';
import { getIdentityLabel } from '@/lib/objects/fieldConfig';
import styles from './ObjectDashboardClient.module.css';

const TYPES: ObjectType[] = [
  'WORK_EXPERIENCE',
  'EDUCATION',
  'SKILLS',
  'SUMMARY',
  'PROJECT',
  'CERTIFICATION',
  'EXTRACURRICULAR',
];

type VariationSummary = {
  rootVersionId: string;
  id: string;
  versionNumber: number;
  body: string;
  fields: unknown;
  createdAt: string | Date;
  tags: string[];
};

type ObjectEntry = {
  originVersionId: string;
  type: string;
  variations: VariationSummary[];
};

type VariationDetail = {
  rootVersionId: string;
  type: ObjectType;
  versions: Array<VariationSummary & { usedInResumeNames: string[] }>;
  usedInResumeNames: string[];
};

export function ObjectDashboardClient({
  dashboard,
  allTags,
  searchTags,
}: {
  dashboard: ObjectEntry[];
  allTags: string[];
  searchTags?: string;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [detail, setDetail] = useState<VariationDetail | null>(null);

  async function openDetail(rootVersionId: string) {
    setDetail(await getVariationDetailAction(rootVersionId));
  }

  return (
    <div>
      <h1>Objects</h1>

      <form>
        <input name="tags" defaultValue={searchTags ?? ''} placeholder="Tags, comma-separated" list="known-tags" />
        <datalist id="known-tags">
          {allTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="submit">Filter</button>
      </form>

      {TYPES.map((type) => {
        const entries = dashboard.filter((e) => e.type === type);
        return (
          <section key={type}>
            <div className={styles.sectionHeader}>
              <h2>{type}</h2>
              <ObjectPickerModal type={type} onPick={refresh} triggerLabel={`+ New ${type}`} />
            </div>
            <div className={styles.entriesGrid}>
              {entries.map((entry) => {
                const first = entry.variations[0];
                return (
                  <div key={entry.originVersionId} className={styles.card}>
                    <div className={styles.caption}>{getIdentityLabel(type, first.fields)}</div>
                    <div className={styles.versionRow}>
                      {entry.variations.map((variation) => (
                        <div key={variation.rootVersionId} className={styles.variationCard}>
                          <div onClick={() => openDetail(variation.rootVersionId)}>
                            <ObjectVersionChip type={type} version={variation} />
                          </div>
                          <div className={styles.variationActions}>
                            <ObjectPickerModal
                              type={type}
                              prefillFrom={variation}
                              mode="edit"
                              onPick={refresh}
                              triggerLabel="Edit"
                            />
                            <ObjectPickerModal
                              type={type}
                              prefillFrom={variation}
                              mode="fork"
                              onPick={refresh}
                              triggerLabel="New Variation"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {detail && (
        <dialog open className={styles.detailDialog}>
          <button type="button" onClick={() => setDetail(null)}>
            ✕
          </button>
          <h2>History</h2>
          <div className={styles.versionRow}>
            {[...detail.versions].reverse().map((v) => (
              <ObjectVersionChip key={v.id} type={detail.type} version={v} />
            ))}
          </div>
          <h3>Used in resumes</h3>
          {detail.usedInResumeNames.length > 0 ? (
            <ul>
              {detail.usedInResumeNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <p>Not used in any resume yet.</p>
          )}
        </dialog>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the new CSS classes**

Append to `src/app/(app)/dashboard/objects/ObjectDashboardClient.module.css`:

```css
.variationCard {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.variationActions {
  display: flex;
  gap: 6px;
}

.detailDialog {
  max-width: 600px;
  width: 90vw;
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (this task has no new unit tests of its own — client component behavior is verified manually next — but it must not break any existing test).

- [ ] **Step 4: Manual check in the running app**

Run: `npm run dev`, sign in with the seeded demo account, go to `/dashboard/objects`, and confirm:
- Each object shows one card with a sub-card per variation (initially one, since no forks exist yet).
- "New Variation" on a sub-card opens a form pre-filled from that variation, and saving creates a **second** sub-card in the same object card (not a new object).
- "Edit" on a sub-card saves a new version of that same sub-card (still one sub-card, just updated content).
- Clicking a sub-card's chip (not its buttons) opens the history + resume-usage popup.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx" "src/app/(app)/dashboard/objects/ObjectDashboardClient.module.css"
git commit -m "feat: object dashboard shows variation sub-cards with edit/fork actions and a history popup"
```

---

### Task 8: `ObjectPickerModal` — stage instead of write (`deferWrite`)

**Files:**
- Modify: `src/components/ObjectPickerModal.tsx`

**Interfaces:**
- Produces: new prop `deferWrite?: boolean` (default `false`, so every existing caller — the Object Dashboard, Task 7 — is unaffected). When `true`, submitting the inline create/edit form no longer calls `createObjectAction`/`editObjectAction` — it calls `onPick` with a **draft** `ObjectSummary` (no real DB row) instead. Consumed by Task 9 (`ResumeForm`).
- `ObjectSummary` gains an optional `draft` field: `{ op: 'create' | 'edit'; sourceId?: string; type: ObjectType }`. Present only on a not-yet-written object; its own `id` field doubles as a stable client-side key until the draft is resolved. Consumed by Task 9.

This task has no automated test (same as Task 5 — `ObjectPickerModal` is a client component with no existing test file; verified manually in Task 9's end-to-end check).

- [ ] **Step 1: Add the `deferWrite` prop and the `draft` field**

In `src/components/ObjectPickerModal.tsx`, extend `ObjectSummary`:

```ts
type ObjectSummary = {
  id: string;
  rootVersionId?: string;
  body: string;
  versionNumber: number;
  fields?: unknown;
  tags?: string[];
  createdAt?: string | Date;
  // Present only for a staged-but-not-yet-written object (deferWrite mode): what write to
  // perform when this draft is finally resolved (see ResumeForm.resolveItem). `id` above
  // doubles as this draft's stable client-side key until it's resolved to a real objectVersionId.
  draft?: { op: 'create' | 'edit'; sourceId?: string; type: ObjectType };
};
```

Add `deferWrite` to `Props` and destructure it:

```ts
type Props = {
  type: ObjectType;
  recentObjects?: ObjectSummary[];
  onPick: (picked: ObjectSummary) => void;
  triggerLabel?: string;
  editingRootVersionId?: string;
  prefillFrom?: ObjectSummary;
  mode?: 'edit' | 'fork';
  // When true, submitting the inline form stages a draft (onPick receives an ObjectSummary
  // with `draft` set) instead of writing to the DB. Used only inside the resume form, where
  // object edits/creates are only meant to persist once the whole resume is submitted.
  deferWrite?: boolean;
  onOpen?: () => void;
};
```

```ts
export function ObjectPickerModal({
  type,
  recentObjects = [],
  onPick,
  triggerLabel = '+ Object',
  editingRootVersionId,
  prefillFrom,
  mode = 'edit',
  deferWrite = false,
  onOpen,
}: Props) {
```

- [ ] **Step 2: Branch the submit handler on `deferWrite`**

Replace the form's `action` handler:

```tsx
              <form
                action={async (formData) => {
                  const fields = Object.fromEntries(
                    FIELDS_BY_TYPE[type].map((f) => [f.name, String(formData.get(f.name) ?? '')])
                  );
                  const body = String(formData.get('body'));
                  const tags = parseTags(formData.get('tags'));

                  if (deferWrite) {
                    // Re-editing an already-staged draft inherits its original op/sourceId (so
                    // three pre-submit edits of the same not-yet-real item still resolve to one
                    // write); editing a real, previously-saved item starts a fresh 'edit' draft.
                    const op = prefillFrom?.draft ? prefillFrom.draft.op : prefillFrom ? 'edit' : 'create';
                    const sourceId = prefillFrom?.draft ? prefillFrom.draft.sourceId : prefillFrom?.id;
                    pick({
                      id: prefillFrom?.id ?? crypto.randomUUID(),
                      body,
                      fields,
                      tags,
                      versionNumber: 0,
                      draft: { op, sourceId, type },
                    });
                    return;
                  }

                  const saved = prefillFrom
                    ? mode === 'fork'
                      ? await forkObjectAction(prefillFrom.id, fields, body, tags)
                      : await editObjectAction(prefillFrom.id, fields, body, tags)
                    : await createObjectAction(type, fields, body, tags);
                  pick(saved);
                }}
              >
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — `deferWrite` defaults to `false`, so no existing caller's behavior changes.

- [ ] **Step 4: Commit**

```bash
git add src/components/ObjectPickerModal.tsx
git commit -m "feat: ObjectPickerModal supports deferWrite staging mode"
```

---

### Task 9: `ResumeForm` — resolve staged drafts at submit

**Files:**
- Modify: `src/app/(app)/resumes/ResumeForm.tsx`
- Modify: `src/app/(app)/resumes/ResumeForm.module.css`

**Interfaces:**
- Consumes: `ObjectPickerModal`'s `deferWrite` prop and `draft`-carrying `ObjectSummary` (Task 8), `createObjectAction`/`editObjectAction` (existing).

No automated test for this task (`ResumeForm.tsx` has no existing test file — it's a client component verified manually, same as the rest of `src/app/(app)/resumes/`). Verified via Step 4's manual check.

- [ ] **Step 1: Thread `draft` through `Item`/`Picked` and pass `deferWrite` to both pickers**

In `src/app/(app)/resumes/ResumeForm.tsx`:

1. Add the import:

```ts
import { createObjectAction, editObjectAction, listLatestObjectsAction } from '@/app/objects/actions';
```

(replacing the existing `import { listLatestObjectsAction } from '@/app/objects/actions';` line)

2. Add `draft` to both `Item` and `Picked`:

```ts
type Item = {
  objectVersionId: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  rootVersionId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
  draft?: { op: 'create' | 'edit'; sourceId?: string; type: ObjectType };
};
type Picked = {
  id: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  rootVersionId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
  draft?: { op: 'create' | 'edit'; sourceId?: string; type: ObjectType };
};
```

3. Carry `draft` through in `toItem`:

```ts
function toItem(picked: Picked): Item {
  return {
    objectVersionId: picked.id,
    body: picked.body,
    fields: picked.fields,
    tags: picked.tags,
    rootVersionId: picked.rootVersionId,
    versionNumber: picked.versionNumber,
    createdAt: picked.createdAt,
    draft: picked.draft,
  };
}
```

4. Pass `deferWrite` on both `ObjectPickerModal` usages inside the render (the item-level edit trigger and the section's add-object picker):

```tsx
                <ObjectVersionChip
                  type={section.sectionType}
                  version={{ id: item.objectVersionId, body: item.body, fields: item.fields, tags: item.tags }}
                  editTrigger={
                    <ObjectPickerModal
                      type={section.sectionType}
                      prefillFrom={{
                        id: item.objectVersionId,
                        body: item.body,
                        fields: item.fields,
                        tags: item.tags,
                        versionNumber: 0,
                        draft: item.draft,
                      }}
                      deferWrite
                      onPick={(picked) => replaceItem(section.sectionType, item.objectVersionId, picked)}
                      triggerLabel="Edit"
                    />
                  }
                />
```

```tsx
          <ObjectPickerModal
            type={section.sectionType}
            recentObjects={(recent[section.sectionType] ?? []).map((r) => ({
              id: r.objectVersionId,
              rootVersionId: r.rootVersionId,
              body: r.body,
              versionNumber: r.versionNumber ?? 0,
              fields: r.fields,
              tags: r.tags,
              createdAt: r.createdAt,
            }))}
            deferWrite
            onOpen={() => openPickerFor(section.sectionType)}
            onPick={(picked) => addItem(section.sectionType, toItem(picked))}
          />
```

- [ ] **Step 2: Resolve drafts in `handleSubmit`, with per-item error attribution**

Replace `handleSubmit` and add a `submitError` state:

```ts
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function resolveItem(item: Item): Promise<string> {
    if (!item.draft) return item.objectVersionId;
    const saved =
      item.draft.op === 'edit'
        ? await editObjectAction(item.draft.sourceId!, item.fields, item.body, item.tags ?? [])
        : await createObjectAction(item.draft.type, item.fields, item.body, item.tags ?? []);
    return saved.id;
  }

  async function handleSubmit() {
    setSubmitError(null);

    let payload;
    try {
      payload = await Promise.all(
        sections.map(async (s, i) => ({
          sectionType: s.sectionType,
          order: i,
          items: await Promise.all(
            s.items.map(async (it, j) => {
              try {
                return { objectVersionId: await resolveItem(it), order: j };
              } catch (err) {
                throw new Error(`${s.sectionType} item ${j + 1}: ${(err as Error).message}`);
              }
            })
          ),
        }))
      );
    } catch (err) {
      setSubmitError((err as Error).message);
      return;
    }

    const result =
      mode === 'create'
        ? await createResumeAction(name, payload)
        : mode === 'edit'
          ? await editResumeAction(sourceId!, name, payload)
          : await forkResumeAction(sourceId!, name, payload);

    router.push(`/resumes/${result.id}`);
  }
```

- [ ] **Step 3: Render the submit error**

Add just above the submit `<button>`:

```tsx
      {submitError && <p className={styles.error}>{submitError}</p>}
      <button
```

Append to `src/app/(app)/resumes/ResumeForm.module.css`:

```css
.error {
  color: #b00020;
}
```

- [ ] **Step 4: Manual check in the running app**

Run: `npx vitest run` (confirm nothing else broke — no new automated tests, this task is UI wiring), then `npm run dev` and, signed in as the seeded demo account:
- Start a new resume, add a brand-new object via a section's "+ Object" form, and confirm no new row appears in `/dashboard/objects` yet (check via a second tab, or `npx prisma studio`).
- Edit that same item's content twice before submitting; confirm still no DB row exists.
- Edit an item that came from an *existing* real object (picked from "Recent objects"); confirm no new version exists yet.
- Click Save. Confirm exactly one new `object_versions` row appears for the brand-new item (`versionNumber: 1`) and exactly one new version for the edited existing item (`versionNumber` = its prior latest + 1) — not two versions each, despite multiple pre-submit edits.
- Navigate to a new resume form, stage an object edit, and navigate away (browser back) without submitting; confirm no `object_versions` row was created.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/resumes/ResumeForm.tsx" "src/app/(app)/resumes/ResumeForm.module.css"
git commit -m "feat: resolve staged object drafts only when the resume is submitted"
```
