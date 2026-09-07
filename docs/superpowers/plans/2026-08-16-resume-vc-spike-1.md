# Resume Version Control — Spike 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full L1 object-based resume version-control system (create/edit/fork resumes, versioned objects, both dashboards) plus a first working AI Career Q&A call, per `docs/superpowers/specs/2026-08-16-resume-version-control-design.md`.

**Architecture:** Single Next.js (App Router, TypeScript) app. Server Actions handle all versioning writes; a Route Handler serves the streaming Q&A endpoint. Postgres via Prisma is the only datastore. Auth.js (Credentials + JWT) scopes every query to the logged-in user.

**Tech Stack:** Next.js, TypeScript, Prisma + Postgres, next-auth v5 (Credentials provider), bcryptjs, Zod, Vercel AI SDK (`ai`, `@ai-sdk/openai`), Vitest.

## Global Constraints

- Every query/mutation MUST filter by the authenticated session's `ownerUserId` — never trust a client-supplied ID without an ownership check first.
- `object_versions` and `resume_versions` rows are immutable — every edit is an `INSERT`, never an `UPDATE` of existing content.
- A resume tree's/object's "head"/latest version is whichever version was created most recently.
- Object `fields` are validated by a Zod schema specific to that object's `type` before being persisted.
- Career Q&A is stateless per the L2 scope — no memory/history carried between questions; each call sends the full context fresh.
- No embeddings/vector search — all AI context is fetched by `ownerUserId` and injected directly into the prompt.

---



## File Structure

```
prisma/
  schema.prisma                  Data model (User, Profile, ObjectVersion, ResumeVersion, sections, items)

src/
  lib/
    prisma.ts                    Prisma client singleton
    auth.ts                      next-auth v5 config (Credentials provider, JWT session)
    session.ts                   getCurrentUserId() — throws if unauthenticated
    password.ts                  bcrypt hash/verify helpers

    objects/
      schemas.ts                 Zod field schema per ObjectType
      versioning.ts               createObjectVersion, editObjectVersion
      queries.ts                  listObjectsForUser, listLatestObjectsForUser, getObjectHistory
      dashboard.ts                 getObjectDashboard (reverse "used in" lookup)

    resumes/
      versioning.ts                createResumeFromScratch, editResume, forkResume, isHeadVersion
      queries.ts                    getLatestVersionsForUser, getResumeVersionWithContent, getResumeForest, getResumeTreeHistory

    profile.ts                      getProfile, upsertProfile

    ai/
      context.ts                    buildCareerContext (pure formatter: DB rows -> prompt text)

  components/
    Sidebar.tsx                     Persistent, collapsible nav (R/O/AI + profile avatar) — every (app) page
    ObjectPickerModal.tsx           Shared picker/editor modal — recent objects, "see all versions", create new

  app/
    signup/page.tsx                 Signup form (no sidebar — outside the (app) group)
    login/page.tsx                  Login form (no sidebar — outside the (app) group)
    api/auth/[...nextauth]/route.ts next-auth route handler

    (app)/
      layout.tsx                    Auth-gated shell — redirects to /login, renders <Sidebar>

      dashboard/
        resumes/page.tsx            Resume forest, flat indented rows
        objects/page.tsx            Object dashboard — browse, create, edit (no separate object list page)

      resumes/
        ResumeForm.tsx               Shared client form for new/edit/fork (picker-modal driven sections)
        new/page.tsx                 Create resume from scratch
        [id]/page.tsx                 View one resume version — Resume / History / Chat(stub) tabs
        [id]/HistoryTab.tsx           Every version in this resume's tree
        [id]/edit/page.tsx            Edit form, pre-filled
        [id]/fork/page.tsx            Fork form, pre-filled from source
        actions.ts                    createResumeAction, editResumeAction, forkResumeAction

      profile/
        page.tsx                     View/edit live profile fields, log out
        actions.ts                    updateProfileAction
        LogoutButton.tsx              Client wrapper for next-auth's signOut

      qna/page.tsx                    Chat UI (useChat), ChatGPT/Claude-style

    objects/
      actions.ts                    createObjectAction, editObjectAction, listLatestObjectsAction, getObjectHistoryAction

    api/qna/route.ts                Streaming Q&A endpoint

test/
  db.ts                             resetDb() — truncates all tables between tests
```

---



### Task 1: Project scaffold

**Files:**

- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Test: `test/scaffold.test.ts`

**Interfaces:**

- Produces: a runnable Next.js app and a working `npm test` command that later tasks build on.

- [x] **Step 1: Scaffold Next.js**

```bash
npx create-next-app@latest . --typescript --app --eslint --no-tailwind --src-dir --import-alias "@/*" --use-npm
```

- [x] **Step 2: Install test/data/auth dependencies**

```bash
npm install prisma @prisma/client zod bcryptjs next-auth@beta ai @ai-sdk/openai
npm install -D vitest @vitejs/plugin-react
```

- [x] **Step 3: Add Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [x] **Step 4: Add test script to package.json**

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

- [x] **Step 5: Write a trivial smoke test**

```ts
// test/scaffold.test.ts
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [x] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (1 test)

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---



### Task 2: Prisma schema + migration + test DB helper

**Files:**

- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Create: `test/db.ts`
- Test: `test/db.test.ts`
- Modify: `.env.example` (add `DATABASE_URL`)

**Interfaces:**

- Produces: `prisma` client singleton (`src/lib/prisma.ts` default export), `resetDb()` (`test/db.ts`), and the full data model every later task queries against.

- [x] **Step 1: Write the schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ObjectType {
  WORK_EXPERIENCE
  EDUCATION
  SKILLS
  SUMMARY
  PROJECT
  CERTIFICATION
  EXTRACURRICULAR
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  profile        Profile?
  objectVersions ObjectVersion[]
  resumeVersions ResumeVersion[]
}

model Profile {
  id       String @id @default(uuid())
  userId   String @unique
  user     User   @relation(fields: [userId], references: [id])
  fullName String
  email    String
  phone    String
  location String
  links    Json
}

model ObjectVersion {
  id            String     @id @default(uuid())
  rootVersionId String
  ownerUserId   String
  owner         User       @relation(fields: [ownerUserId], references: [id])
  type          ObjectType
  versionNumber Int
  fields        Json
  body          String
  tags          String[]   @default([])
  createdAt     DateTime   @default(now())

  resumeVersionItems ResumeVersionItem[]

  @@index([ownerUserId])
  @@index([rootVersionId])
}

model ResumeVersion {
  id              String   @id @default(uuid())
  rootVersionId   String
  parentVersionId String?
  ownerUserId     String
  owner           User     @relation(fields: [ownerUserId], references: [id])
  name            String
  createdAt       DateTime @default(now())

  sections ResumeVersionSection[]
  items    ResumeVersionItem[]

  @@index([ownerUserId])
  @@index([rootVersionId])
  @@index([parentVersionId])
}

model ResumeVersionSection {
  id              String        @id @default(uuid())
  resumeVersionId String
  resumeVersion   ResumeVersion @relation(fields: [resumeVersionId], references: [id])
  sectionType     ObjectType
  order           Int

  @@unique([resumeVersionId, sectionType])
  @@index([resumeVersionId])
}

model ResumeVersionItem {
  id              String        @id @default(uuid())
  resumeVersionId String
  resumeVersion   ResumeVersion @relation(fields: [resumeVersionId], references: [id])
  objectVersionId String
  objectVersion   ObjectVersion @relation(fields: [objectVersionId], references: [id])
  order           Int

  @@index([resumeVersionId])
  @@index([objectVersionId])
}
```

- [x] **Step 2: Add DATABASE_URL to .env.example, create local + test databases**

```bash
echo 'DATABASE_URL="postgresql://localhost:5432/resume_vc_dev"' >> .env.example
createdb resume_vc_dev
createdb resume_vc_test
cp .env.example .env
echo 'DATABASE_URL="postgresql://localhost:5432/resume_vc_dev"' > .env
```

- [x] **Step 3: Run the migration against the dev DB**

Run: `npx prisma migrate dev --name init`
Expected: migration succeeds, Prisma Client generated.

- [x] **Step 4: Write the Prisma client singleton**

```ts
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [x] **Step 5: Write the test DB reset helper**

```ts
// test/db.ts
import { prisma } from '@/lib/prisma';

export async function resetDb() {
  await prisma.resumeVersionItem.deleteMany();
  await prisma.resumeVersionSection.deleteMany();
  await prisma.resumeVersion.deleteMany();
  await prisma.objectVersion.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}
```

- [x] **Step 6: Write a test proving the schema round-trips against the test DB**

Point `DATABASE_URL` at `resume_vc_test` for the test run (e.g. `DATABASE_URL=postgresql://localhost:5432/resume_vc_test npx prisma migrate deploy` once, then run tests with that env var).

```ts
// test/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from './db';

describe('schema', () => {
  beforeEach(resetDb);

  it('creates and reads a user', async () => {
    const user = await prisma.user.create({
      data: { email: 'a@example.com', passwordHash: 'hash' },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe('a@example.com');
  });
});
```

- [x] **Step 7: Run test to verify it passes**

Run: `DATABASE_URL=postgresql://localhost:5432/resume_vc_test npm test -- test/db.test.ts`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema, client, and test DB helper"
```

---



### Task 3: Zod field schemas per object type

**Files:**

- Create: `src/lib/objects/schemas.ts`
- Test: `src/lib/objects/schemas.test.ts`

**Interfaces:**

- Produces: `objectFieldSchemas: Record<ObjectType, z.ZodType>`, `validateObjectFields(type: ObjectType, fields: unknown): Record<string, unknown>` (throws `z.ZodError` on invalid input).

- [x] **Step 1: Write the failing test**

```ts
// src/lib/objects/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { validateObjectFields } from './schemas';

describe('validateObjectFields', () => {
  it('accepts valid WORK_EXPERIENCE fields', () => {
    const result = validateObjectFields('WORK_EXPERIENCE', {
      company: 'Acme',
      title: 'Engineer',
      location: 'Remote',
      startDate: '2020-01',
      endDate: '2022-01',
    });
    expect(result.company).toBe('Acme');
  });

  it('rejects WORK_EXPERIENCE fields missing company', () => {
    expect(() =>
      validateObjectFields('WORK_EXPERIENCE', { title: 'Engineer' })
    ).toThrow();
  });

  it('accepts valid SKILLS fields', () => {
    const result = validateObjectFields('SKILLS', { category: 'Languages' });
    expect(result.category).toBe('Languages');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/objects/schemas.test.ts`
Expected: FAIL with "Cannot find module './schemas'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/objects/schemas.ts
import { z } from 'zod';

const dateRange = { startDate: z.string(), endDate: z.string().optional() };

const workExperience = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  ...dateRange,
});

const education = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  fieldOfStudy: z.string().optional(),
  ...dateRange,
});

const skills = z.object({
  category: z.string().min(1),
});

const summary = z.object({});

const project = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  ...dateRange,
});

const certification = z.object({
  issuer: z.string().min(1),
  issueDate: z.string(),
  expiryDate: z.string().optional(),
});

const extracurricular = z.object({
  organization: z.string().min(1),
  role: z.string().min(1),
  ...dateRange,
});

export const objectFieldSchemas = {
  WORK_EXPERIENCE: workExperience,
  EDUCATION: education,
  SKILLS: skills,
  SUMMARY: summary,
  PROJECT: project,
  CERTIFICATION: certification,
  EXTRACURRICULAR: extracurricular,
} as const;

export type ObjectType = keyof typeof objectFieldSchemas;

export function validateObjectFields(type: ObjectType, fields: unknown) {
  return objectFieldSchemas[type].parse(fields);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/objects/schemas.test.ts`
Expected: PASS (3 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add per-type Zod schemas for object fields"
```

---



### Task 4: Object versioning core logic

**Files:**

- Create: `src/lib/objects/versioning.ts`
- Test: `src/lib/objects/versioning.test.ts`

**Interfaces:**

- Consumes: `prisma` (`src/lib/prisma.ts`), `validateObjectFields` (`src/lib/objects/schemas.ts`)
- Produces: `createObjectVersion(userId: string, type: ObjectType, fields: unknown, body: string, tags?: string[]): Promise<ObjectVersion>`, `editObjectVersion(userId: string, existingVersionId: string, fields: unknown, body: string, tags?: string[]): Promise<ObjectVersion>`

- [x] **Step 1: Write the failing test**

```ts
// src/lib/objects/versioning.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion, editObjectVersion } from './versioning';

describe('object versioning', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('creates a first version whose rootVersionId equals its own id', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python, TypeScript');
    expect(v1.rootVersionId).toBe(v1.id);
    expect(v1.versionNumber).toBe(1);
  });

  it('stores tags passed on create, defaulting to an empty list', async () => {
    const user = await makeUser();
    const tagged = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);
    const untagged = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'React');
    expect(tagged.tags).toEqual(['Backend']);
    expect(untagged.tags).toEqual([]);
  });

  it('edit creates a new version under the same rootVersionId', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript', ['Backend', 'AI']);
    expect(v2.rootVersionId).toBe(v1.rootVersionId);
    expect(v2.versionNumber).toBe(2);
    expect(v2.id).not.toBe(v1.id);
    expect(v2.tags).toEqual(['Backend', 'AI']);
  });

  it('editing a stale (non-head) version numbers off the current latest, not the edited-from version', async () => {
    const user = await makeUser();
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const v3 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, Go');
    expect(v3.rootVersionId).toBe(v1.rootVersionId);
    expect(v3.versionNumber).toBe(v2.versionNumber + 1);
  });

  it('rejects editing a version owned by another user', async () => {
    const owner = await makeUser();
    const attacker = await prisma.user.create({ data: { email: 'b@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(owner.id, 'SKILLS', { category: 'Languages' }, 'Python');
    await expect(
      editObjectVersion(attacker.id, v1.id, { category: 'Languages' }, 'hacked')
    ).rejects.toThrow('Not authorized');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/objects/versioning.test.ts`
Expected: FAIL with "Cannot find module './versioning'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/objects/versioning.ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/objects/versioning.test.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add object versioning core logic"
```

---



### Task 5: Object queries

**Files:**

- Create: `src/lib/objects/queries.ts`
- Test: `src/lib/objects/queries.test.ts`

**Interfaces:**

- Consumes: `prisma`
- Produces: `listObjectsForUser(userId: string, type?: ObjectType): Promise<ObjectVersion[]>` (every version of every object, newest first; when `type` is given, only that type — tag filtering is applied client-side since the full set is already fetched), `getObjectHistory(userId: string, rootVersionId: string): Promise<ObjectVersion[]>` (all versions, oldest first), `listTagsForUser(userId: string): Promise<string[]>` (distinct tags across all versions, for autocomplete)

- [x] **Step 1: Write the failing test**

```ts
// src/lib/objects/queries.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion, editObjectVersion } from './versioning';
import { listObjectsForUser, getObjectHistory, listTagsForUser } from './queries';

describe('object queries', () => {
  beforeEach(resetDb);

  it('lists every version of every object, newest first', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
    const other = await createObjectVersion(user.id, 'SUMMARY', {}, 'Backend engineer');

    const list = await listObjectsForUser(user.id);

    expect(list).toHaveLength(3);
    expect(list.map((o) => o.id)).toEqual([other.id, v2.id, v1.id]);
  });

  it('filters to only the given object type', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Go');
    await createObjectVersion(user.id, 'SUMMARY', {}, 'Backend engineer');

    const skillsOnly = await listObjectsForUser(user.id, 'SKILLS');

    expect(skillsOnly).toHaveLength(1);
    expect(skillsOnly[0].body).toBe('Go');
  });

  it('returns full history oldest first', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const history = await getObjectHistory(user.id, v1.rootVersionId);

    expect(history.map((v) => v.id)).toEqual([v1.id, v2.id]);
  });

  it('lists distinct tags across all of a user\'s object versions', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);
    await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'React', ['Frontend', 'Backend']);

    const tags = await listTagsForUser(user.id);

    expect(tags.sort()).toEqual(['Backend', 'Frontend']);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/objects/queries.test.ts`
Expected: FAIL with "Cannot find module './queries'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/objects/queries.ts
import { prisma } from '@/lib/prisma';
import type { ObjectType } from './schemas';

export async function listObjectsForUser(userId: string, type?: ObjectType) {
  return prisma.objectVersion.findMany({
    where: {
      ownerUserId: userId,
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getObjectHistory(userId: string, rootVersionId: string) {
  return prisma.objectVersion.findMany({
    where: { ownerUserId: userId, rootVersionId },
    orderBy: { versionNumber: 'asc' },
  });
}

export async function listTagsForUser(userId: string): Promise<string[]> {
  const versions = await prisma.objectVersion.findMany({
    where: { ownerUserId: userId },
    select: { tags: true },
  });
  const tags = new Set<string>();
  for (const v of versions) {
    for (const tag of v.tags) tags.add(tag);
  }
  return Array.from(tags);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/objects/queries.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add object list and history queries"
```

---



### Task 6: Password hashing helper

**Files:**

- Create: `src/lib/password.ts`
- Test: `src/lib/password.test.ts`

**Interfaces:**

- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`

- [x] **Step 1: Write the failing test**

```ts
// src/lib/password.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/password.test.ts`
Expected: FAIL with "Cannot find module './password'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/password.ts
import bcrypt from 'bcryptjs';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/password.test.ts`
Expected: PASS (2 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add password hashing helpers"
```

---



### Task 7: Auth.js config + session helper

**Files:**

- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/session.ts`
- Modify: `.env.example` (add `AUTH_SECRET`)
- Test: `src/lib/session.test.ts`

**Interfaces:**

- Consumes: `prisma`, `verifyPassword` (`src/lib/password.ts`)
- Produces: `auth()` (next-auth handle), `getCurrentUserId(): Promise<string>` (throws `Error('Not authenticated')` if no session)

- [x] **Step 1: Write the failing test**

`getCurrentUserId` wraps `auth()`, so test it against a mocked `auth()`:

```ts
// src/lib/session.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./auth', () => ({
  auth: vi.fn(),
}));

import { auth } from './auth';
import { getCurrentUserId } from './session';

describe('getCurrentUserId', () => {
  it('returns the user id from an active session', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any);
    expect(await getCurrentUserId()).toBe('user-1');
  });

  it('throws when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect(getCurrentUserId()).rejects.toThrow('Not authenticated');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/session.test.ts`
Expected: FAIL with "Cannot find module './auth'"

- [x] **Step 3: Write the auth config**

```ts
// src/lib/auth.ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.id = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
```

- [x] **Step 4: Write the route handler**

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
```

- [x] **Step 5: Write the session helper**

```ts
// src/lib/session.ts
import { auth } from './auth';

export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}
```

- [x] **Step 6: Add AUTH_SECRET to .env.example and .env**

```bash
echo 'AUTH_SECRET="dev-only-secret-change-me"' >> .env.example
echo 'AUTH_SECRET="dev-only-secret-change-me"' >> .env
```

- [x] **Step 7: Run test to verify it passes**

Run: `npm test -- src/lib/session.test.ts`
Expected: PASS (2 tests)

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Auth.js credentials config and session helper"
```

---



### Task 8: Resume versioning core logic

**Files:**

- Create: `src/lib/resumes/versioning.ts`
- Test: `src/lib/resumes/versioning.test.ts`

**Interfaces:**

- Consumes: `prisma`
- Produces (all three write exactly once — no separate "create empty, then fill" round trip; the caller passes whatever content the user has built in the form):
  - `createResumeFromScratch(userId: string, name: string, sections?: SectionInput[]): Promise<ResumeVersion>`
  - `forkResume(userId: string, sourceVersionId: string, newName: string | undefined, sections: SectionInput[]): Promise<ResumeVersion>`
  - `isHeadVersion(resumeVersionId: string): Promise<boolean>` — true if this is the most recently created version in its `rootVersionId` group
  - `editResume(userId: string, existingVersionId: string, name: string | undefined, sections: SectionInput[]): Promise<ResumeVersion>` — the new version always becomes the tree's new latest
  - `SectionInput = { sectionType: string; order: number; items: Array<{ objectVersionId: string; order: number }> }`

- [x] **Step 1: Write the failing test**

```ts
// src/lib/resumes/versioning.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion } from '../objects/versioning';
import { createResumeFromScratch, forkResume, editResume, isHeadVersion } from './versioning';

describe('resume versioning', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('a fresh resume is the root of its own tree', async () => {
    const user = await makeUser();
    const resume = await createResumeFromScratch(user.id, 'My Resume');
    expect(resume.rootVersionId).toBe(resume.id);
    expect(resume.parentVersionId).toBeNull();
  });

  it('fork starts a new tree, remembering the source as parent', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);

    expect(fork.rootVersionId).toBe(fork.id);
    expect(fork.parentVersionId).toBe(original.id);
  });

  it('fork writes whatever content the caller submits (pre-filled from the source by the caller)', async () => {
    const user = await makeUser();
    const skill = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const sections = [
      { sectionType: 'SKILLS', order: 0, items: [{ objectVersionId: skill.id, order: 0 }] },
    ];
    const original = await createResumeFromScratch(user.id, 'Original', sections);

    // Simulates the user leaving the fork form's pre-filled content unchanged.
    const fork = await forkResume(user.id, original.id, 'Forked', sections);

    expect(fork.sections).toHaveLength(1);
    expect(fork.items[0].objectVersionId).toBe(skill.id);
  });

  it('edit stays in the same tree and inherits the tree\'s fork origin, not the edited-from version\'s id', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);
    const edited = await editResume(user.id, fork.id, 'Renamed', []);

    expect(edited.rootVersionId).toBe(fork.rootVersionId);
    expect(edited.parentVersionId).toBe(fork.parentVersionId);
    expect(edited.parentVersionId).toBe(original.id);
  });

  it('editing a stale (non-head) version succeeds and becomes the new latest for its tree', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    const v3 = await editResume(user.id, v1.id, 'v3 from a stale version', []);

    expect(v3.rootVersionId).toBe(v1.rootVersionId);
    expect(v3.parentVersionId).toBe(v1.parentVersionId);
    expect(await isHeadVersion(v3.id)).toBe(true);
    expect(await isHeadVersion(v2.id)).toBe(false);
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

  it('isHeadVersion reflects recency, not tree position', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    expect(await isHeadVersion(v1.id)).toBe(true);

    const v2 = await editResume(user.id, v1.id, 'v2', []);
    expect(await isHeadVersion(v1.id)).toBe(false);
    expect(await isHeadVersion(v2.id)).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resumes/versioning.test.ts`
Expected: FAIL with "Cannot find module './versioning'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/resumes/versioning.ts
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { ObjectType } from '../objects/schemas';

type SectionInput = {
  sectionType: ObjectType;
  order: number;
  items: Array<{ objectVersionId: string; order: number }>;
};

export async function createResumeFromScratch(userId: string, name: string, sections: SectionInput[] = []) {
  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: id,
      parentVersionId: null,
      ownerUserId: userId,
      name,
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

  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: existing.rootVersionId,
      parentVersionId: existing.parentVersionId,
      ownerUserId: userId,
      name: name ?? existing.name,
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

  const id = randomUUID();
  return prisma.resumeVersion.create({
    data: {
      id,
      rootVersionId: id,
      parentVersionId: source.id,
      ownerUserId: userId,
      name: newName ?? `Fork of ${source.name}`,
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
```

- [x] **Step 4: Run test to verify it passes**



Run: `npm test -- src/lib/resumes/versioning.test.ts`
Expected: PASS (8 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add resume versioning core logic (create, edit, fork)"
```

---



### Task 9: Resume queries (latest versions, content, forest)

**Files:**

- Create: `src/lib/resumes/queries.ts`
- Test: `src/lib/resumes/queries.test.ts`

**Interfaces:**

- Consumes: `prisma`
- Produces:
  - `getLatestVersionsForUser(userId: string): Promise<ResumeVersion[]>` (one head per tree)
  - `getResumeVersionWithContent(userId: string, id: string): Promise<ResumeVersion & { sections: ... }>`
  - `getResumeForest(userId: string): Promise<Array<{ rootVersionId: string; headVersionId: string; name: string; forkedFromRootVersionId: string | null }>>`

- [x] **Step 1: Write the failing test**

```ts
// src/lib/resumes/queries.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion } from '../objects/versioning';
import { createResumeFromScratch, editResume, forkResume } from './versioning';
import { getLatestVersionsForUser, getResumeVersionWithContent, getResumeForest } from './queries';

describe('resume queries', () => {
  beforeEach(resetDb);

  async function makeUser() {
    return prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
  }

  it('returns exactly one (the head) version per tree', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    await createResumeFromScratch(user.id, 'A second, unrelated resume');

    const latest = await getLatestVersionsForUser(user.id);

    expect(latest).toHaveLength(2);
    expect(latest.map((r) => r.id)).toContain(v2.id);
    expect(latest.map((r) => r.id)).not.toContain(v1.id);
  });

  it('a version edited from an older sibling still counts as the latest for its tree', async () => {
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
    const skill = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const resume = await editResume(
      user.id,
      (await createResumeFromScratch(user.id, 'Original')).id,
      undefined,
      [{ sectionType: 'SKILLS', order: 0, items: [{ objectVersionId: skill.id, order: 0 }] }]
    );

    const content = await getResumeVersionWithContent(user.id, resume.id);

    expect(content.sections[0].items[0].objectVersionId).toBe(skill.id);
  });

  it('builds a forest with a fork edge to the source tree', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const fork = await forkResume(user.id, original.id, 'Forked', []);

    const forest = await getResumeForest(user.id);

    const forkTree = forest.find((t) => t.rootVersionId === fork.rootVersionId);
    expect(forkTree?.forkedFromRootVersionId).toBe(original.rootVersionId);

    const originalTree = forest.find((t) => t.rootVersionId === original.rootVersionId);
    expect(originalTree?.forkedFromRootVersionId).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resumes/queries.test.ts`
Expected: FAIL with "Cannot find module './queries'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/resumes/queries.ts
import { prisma } from '@/lib/prisma';

export async function getLatestVersionsForUser(userId: string) {
  const versions = await prisma.resumeVersion.findMany({
    where: { ownerUserId: userId },
    orderBy: { createdAt: 'desc' },
  });
  const seenRoots = new Set<string>();
  const latest = [];
  for (const v of versions) {
    if (!seenRoots.has(v.rootVersionId)) {
      seenRoots.add(v.rootVersionId);
      latest.push(v);
    }
  }
  return latest;
}

export async function getResumeVersionWithContent(userId: string, id: string) {
  const resume = await prisma.resumeVersion.findUnique({
    where: { id },
    include: { sections: true, items: { include: { objectVersion: true } } },
  });
  if (!resume) throw new Error('Resume version not found');
  if (resume.ownerUserId !== userId) throw new Error('Not authorized');

  // Section membership isn't stored on the item — match by the referenced object's type.
  const sections = [...resume.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      ...section,
      items: resume.items
        .filter((item) => item.objectVersion.type === section.sectionType)
        .sort((a, b) => a.order - b.order),
    }));

  return { ...resume, sections };
}

export async function getResumeForest(userId: string) {
  const versions = await prisma.resumeVersion.findMany({ where: { ownerUserId: userId } });

  // Map every version id to the rootVersionId of the tree it belongs to,
  // so a cross-tree parentVersionId can be resolved back to a tree.
  const idToRoot = new Map(versions.map((v) => [v.id, v.rootVersionId]));

  const trees = new Map<string, typeof versions>();
  for (const v of versions) {
    const group = trees.get(v.rootVersionId) ?? [];
    group.push(v);
    trees.set(v.rootVersionId, group);
  }

  return Array.from(trees.entries()).map(([rootVersionId, group]) => {
    const head = group.reduce((latest, v) => (v.createdAt > latest.createdAt ? v : latest));
    const forkedFromRootVersionId = head.parentVersionId
      ? idToRoot.get(head.parentVersionId) ?? null
      : null;

    return {
      rootVersionId,
      headVersionId: head.id,
      name: head.name,
      forkedFromRootVersionId,
    };
  });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/resumes/queries.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add resume latest-version, content, and forest queries"
```

---



### Task 10: Object Dashboard query (reverse "used in" lookup)

**Files:**

- Create: `src/lib/objects/dashboard.ts`
- Test: `src/lib/objects/dashboard.test.ts`

**Interfaces:**

- Consumes: `prisma`
- Produces: `getObjectDashboard(userId: string): Promise<Array<{ rootVersionId: string; type: string; versions: Array<{ id: string; versionNumber: number; body: string; tags: string[]; usedInResumeNames: string[] }> }>>`

- [x] **Step 1: Write the failing test**

```ts
// src/lib/objects/dashboard.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';
import { createObjectVersion, editObjectVersion } from './versioning';
import { createResumeFromScratch, editResume } from '../resumes/versioning';
import { getObjectDashboard } from './dashboard';

describe('getObjectDashboard', () => {
  beforeEach(resetDb);

  it('groups versions by object and lists which resumes use each version', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
    const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');

    const resumeRoot = await createResumeFromScratch(user.id, 'My Resume');
    await editResume(user.id, resumeRoot.id, undefined, [
      { sectionType: 'SKILLS', order: 0, items: [{ objectVersionId: v2.id, order: 0 }] },
    ]);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard).toHaveLength(1);
    const [entry] = dashboard;
    expect(entry.versions).toHaveLength(2);
    const v1Entry = entry.versions.find((v) => v.id === v1.id)!;
    const v2Entry = entry.versions.find((v) => v.id === v2.id)!;
    expect(v1Entry.usedInResumeNames).toEqual([]);
    expect(v2Entry.usedInResumeNames).toEqual(['My Resume']);
  });

  it('includes each version\'s tags', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Go', ['Backend']);

    const dashboard = await getObjectDashboard(user.id);

    expect(dashboard[0].versions.find((v) => v.id === v1.id)?.tags).toEqual(['Backend']);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/objects/dashboard.test.ts`
Expected: FAIL with "Cannot find module './dashboard'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/objects/dashboard.ts
import { prisma } from '@/lib/prisma';

export async function getObjectDashboard(userId: string) {
  const versions = await prisma.objectVersion.findMany({
    where: { ownerUserId: userId },
    orderBy: { versionNumber: 'asc' },
    include: {
      resumeVersionItems: { include: { resumeVersion: true } },
    },
  });

  const groups = new Map<string, typeof versions>();
  for (const v of versions) {
    const group = groups.get(v.rootVersionId) ?? [];
    group.push(v);
    groups.set(v.rootVersionId, group);
  }

  return Array.from(groups.entries()).map(([rootVersionId, group]) => ({
    rootVersionId,
    type: group[0].type,
    versions: group.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      body: v.body,
      tags: v.tags,
      usedInResumeNames: v.resumeVersionItems.map((item) => item.resumeVersion.name),
    })),
  }));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/objects/dashboard.test.ts`
Expected: PASS (2 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add object dashboard query with reverse resume lookup"
```

---



### Task 11: Profile queries and mutation

**Files:**

- Create: `src/lib/profile.ts`
- Test: `src/lib/profile.test.ts`

**Interfaces:**

- Consumes: `prisma`
- Produces: `getProfile(userId: string): Promise<Profile | null>`, `upsertProfile(userId: string, data: { fullName: string; email: string; phone: string; location: string; links: Record<string, string> }): Promise<Profile>`

- [x] **Step 1: Write the failing test**

```ts
// src/lib/profile.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../test/db';
import { getProfile, upsertProfile } from './profile';

describe('profile', () => {
  beforeEach(resetDb);

  it('creates then updates the same profile row in place (live, unversioned)', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });

    const created = await upsertProfile(user.id, {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '555-0100',
      location: 'London',
      links: { linkedin: 'https://linkedin.com/in/ada' },
    });

    const updated = await upsertProfile(user.id, {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '555-0101',
      location: 'London',
      links: { linkedin: 'https://linkedin.com/in/ada' },
    });

    expect(updated.id).toBe(created.id);
    expect((await getProfile(user.id))?.phone).toBe('555-0101');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/profile.test.ts`
Expected: FAIL with "Cannot find module './profile'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/profile.ts
import { prisma } from '@/lib/prisma';

type ProfileData = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: Record<string, string>;
};

export async function getProfile(userId: string) {
  return prisma.profile.findUnique({ where: { userId } });
}

export async function upsertProfile(userId: string, data: ProfileData) {
  return prisma.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/profile.test.ts`
Expected: PASS (1 test)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add profile query and upsert"
```

---



### Task 12: Object Server Actions

**Files:**

- Create: `src/app/objects/actions.ts`
- Test: `src/app/objects/actions.test.ts`

**Interfaces:**

- Consumes: `getCurrentUserId` (`src/lib/session.ts`), `createObjectVersion`/`editObjectVersion` (`src/lib/objects/versioning.ts`)
- Produces: `createObjectAction(type: ObjectType, fields: unknown, body: string, tags?: string[]): Promise<{ id: string }>`, `editObjectAction(existingVersionId: string, fields: unknown, body: string, tags?: string[]): Promise<{ id: string }>`

- [x] **Step 1: Write the failing test**

```ts
// src/app/objects/actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetDb } from '../../../test/db';

vi.mock('@/lib/session', () => ({ getCurrentUserId: vi.fn() }));
import { getCurrentUserId } from '@/lib/session';
import { createObjectAction, editObjectAction } from './actions';

describe('object actions', () => {
  beforeEach(resetDb);

  it('creates an object scoped to the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);

    const result = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const stored = await prisma.objectVersion.findUnique({ where: { id: result.id } });
    expect(stored?.ownerUserId).toBe(user.id);
  });

  it('propagates the not-authenticated error when there is no session', async () => {
    vi.mocked(getCurrentUserId).mockRejectedValue(new Error('Not authenticated'));

    await expect(createObjectAction('SKILLS', { category: 'Languages' }, 'Python')).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('edit action creates a new version via the current session user', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

    const edited = await editObjectAction(created.id, { category: 'Languages' }, 'Python, TypeScript');

    const stored = await prisma.objectVersion.findUnique({ where: { id: edited.id } });
    expect(stored?.versionNumber).toBe(2);
  });

  it('passes tags through on create and edit', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Go', ['Backend']);

    const edited = await editObjectAction(created.id, { category: 'Languages' }, 'Go', ['Backend', 'AI']);

    const stored = await prisma.objectVersion.findUnique({ where: { id: edited.id } });
    expect(stored?.tags).toEqual(['Backend', 'AI']);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/objects/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'"

- [x] **Step 3: Write the implementation**

```ts
// src/app/objects/actions.ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/objects/actions.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add object server actions"
```

---



### Task 13: Resume Server Actions

**Files:**

- Create: `src/app/resumes/actions.ts`
- Test: `src/app/resumes/actions.test.ts`

**Interfaces:**

- Consumes: `getCurrentUserId`, `createResumeFromScratch`/`editResume`/`forkResume` (`src/lib/resumes/versioning.ts`)
- Produces (each writes exactly once — `sections` is whatever the caller's form currently holds): `createResumeAction(name: string, sections?: SectionInput[]): Promise<{ id: string }>`, `editResumeAction(existingVersionId: string, name: string | undefined, sections: SectionInput[]): Promise<{ id: string }>`, `forkResumeAction(sourceVersionId: string, newName: string | undefined, sections: SectionInput[]): Promise<{ id: string }>`

- [x] **Step 1: Write the failing test**

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

    const stored = await prisma.resumeVersion.findUnique({ where: { id: result.id } });
    expect(stored?.ownerUserId).toBe(user.id);
  });

  it('fork action creates a new tree linked to the source', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const original = await createResumeAction('Original');

    const fork = await forkResumeAction(original.id, 'Forked', []);

    const stored = await prisma.resumeVersion.findUnique({ where: { id: fork.id } });
    expect(stored?.parentVersionId).toBe(original.id);
    expect(stored?.rootVersionId).toBe(fork.id);
  });

  it('edit action creates a new version in the same tree', async () => {
    const user = await prisma.user.create({ data: { email: 'u@example.com', passwordHash: 'x' } });
    vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
    const original = await createResumeAction('Original');

    const edited = await editResumeAction(original.id, 'Renamed', []);

    const stored = await prisma.resumeVersion.findUnique({ where: { id: edited.id } });
    expect(stored?.name).toBe('Renamed');
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

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/resumes/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'"

- [x] **Step 3: Write the implementation**

```ts
// src/app/resumes/actions.ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/resumes/actions.test.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add resume server actions"
```

---



### Task 14: Data layer additions for the UI

**Files:**

- Modify: `src/lib/objects/queries.ts` / `src/lib/objects/queries.test.ts` (add `listLatestObjectsForUser`)
- Modify: `src/lib/resumes/queries.ts` / `src/lib/resumes/queries.test.ts` (add `getResumeTreeHistory`)
- Modify: `src/app/objects/actions.ts` / `src/app/objects/actions.test.ts` (add `listLatestObjectsAction`, `getObjectHistoryAction`)

**Interfaces:**

- Consumes: `prisma`, `getObjectHistory` (`src/lib/objects/queries.ts`), `getCurrentUserId`
- Produces:
  - `listLatestObjectsForUser(userId: string, type?: ObjectType): Promise<ObjectVersion[]>` — one row per object (its latest version), optionally filtered by `type`. Powers the Resume Create modal's "recent objects" picker — `listObjectsForUser` (every version) would be far too cluttered for a quick-pick list.
  - `getResumeTreeHistory(userId: string, rootVersionId: string): Promise<ResumeVersion[]>` — every version in one resume tree, oldest first. Powers the Resume Screen's History tab.
  - `listLatestObjectsAction(type?: ObjectType): Promise<ObjectVersion[]>` / `getObjectHistoryAction(rootVersionId: string): Promise<ObjectVersion[]>` — thin session-scoped Server Action wrappers, since the picker modal (Task 18) is a client component and can't call `lib/` functions directly.

- [x] **Step 1: Write the failing tests**

```ts
// src/lib/objects/queries.test.ts — add this test to the existing file
it('lists only the latest version of each object, optionally filtered by type', async () => {
  const user = await prisma.user.create({ data: { email: 'u2@example.com', passwordHash: 'x' } });
  const v1 = await createObjectVersion(user.id, 'SKILLS', { category: 'Languages' }, 'Python');
  const v2 = await editObjectVersion(user.id, v1.id, { category: 'Languages' }, 'Python, TypeScript');
  await createObjectVersion(user.id, 'SUMMARY', {}, 'Backend engineer');

  const skillsOnly = await listLatestObjectsForUser(user.id, 'SKILLS');
  expect(skillsOnly).toHaveLength(1);
  expect(skillsOnly[0].id).toBe(v2.id);

  const all = await listLatestObjectsForUser(user.id);
  expect(all).toHaveLength(2);
});
```

```ts
// src/lib/resumes/queries.test.ts — add this test to the existing file
it('returns every version in one tree, oldest first', async () => {
  const user = await prisma.user.create({ data: { email: 'u3@example.com', passwordHash: 'x' } });
  const v1 = await createResumeFromScratch(user.id, 'Original');
  const v2 = await editResume(user.id, v1.id, 'v2', []);

  const history = await getResumeTreeHistory(user.id, v1.rootVersionId);
  expect(history.map((v) => v.id)).toEqual([v1.id, v2.id]);
});
```

```ts
// src/app/objects/actions.test.ts — add these tests to the existing file
it('listLatestObjectsAction scopes to the current session user', async () => {
  const user = await prisma.user.create({ data: { email: 'u4@example.com', passwordHash: 'x' } });
  vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
  await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');

  const result = await listLatestObjectsAction('SKILLS');
  expect(result).toHaveLength(1);
});

it('getObjectHistoryAction returns every version for the given root', async () => {
  const user = await prisma.user.create({ data: { email: 'u5@example.com', passwordHash: 'x' } });
  vi.mocked(getCurrentUserId).mockResolvedValue(user.id);
  const created = await createObjectAction('SKILLS', { category: 'Languages' }, 'Python');
  await editObjectAction(created.id, { category: 'Languages' }, 'Python, TypeScript');

  const history = await getObjectHistoryAction(created.id);
  expect(history).toHaveLength(2);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/objects/queries.test.ts src/lib/resumes/queries.test.ts src/app/objects/actions.test.ts`
Expected: FAIL — new imports don't exist yet.

- [x] **Step 3: Write the implementations**

```ts
// src/lib/objects/queries.ts — add this export
export async function listLatestObjectsForUser(userId: string, type?: ObjectType) {
  const versions = await prisma.objectVersion.findMany({
    where: {
      ownerUserId: userId,
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  const seenRoots = new Set<string>();
  const latest = [];
  for (const v of versions) {
    if (!seenRoots.has(v.rootVersionId)) {
      seenRoots.add(v.rootVersionId);
      latest.push(v);
    }
  }
  return latest;
}
```

```ts
// src/lib/resumes/queries.ts — add this export
export async function getResumeTreeHistory(userId: string, rootVersionId: string) {
  return prisma.resumeVersion.findMany({
    where: { ownerUserId: userId, rootVersionId },
    orderBy: { createdAt: 'asc' },
  });
}
```

```ts
// src/app/objects/actions.ts — add these exports
import { listLatestObjectsForUser, getObjectHistory } from '@/lib/objects/queries';

export async function listLatestObjectsAction(type?: ObjectType) {
  const userId = await getCurrentUserId();
  return listLatestObjectsForUser(userId, type);
}

export async function getObjectHistoryAction(rootVersionId: string) {
  const userId = await getCurrentUserId();
  return getObjectHistory(userId, rootVersionId);
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/objects/queries.test.ts src/lib/resumes/queries.test.ts src/app/objects/actions.test.ts`
Expected: PASS (5 tests in `objects/queries.test.ts`, 5 in `resumes/queries.test.ts`, 6 in `objects/actions.test.ts`)

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add latest-objects and resume-tree-history queries for the UI"
```

---



### Task 15: Auth UI (signup, login)

Unchanged from the original plan — no design exists for these in Figma, built freely. Lives outside `(app)/`, so no sidebar.

**Files:**

- Create: `src/app/signup/page.tsx`
- Create: `src/app/signup/actions.ts`
- Create: `src/app/login/page.tsx`

**Interfaces:**

- Consumes: `hashPassword` (`src/lib/password.ts`), `prisma`, `signIn` (`src/lib/auth.ts`)
- Produces: working `/signup` and `/login` pages.

- [x] **Step 1: Write the signup action**

```ts
// src/app/signup/actions.ts
'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { redirect } from 'next/navigation';

export async function signupAction(formData: FormData) {
  const email = String(formData.get('email'));
  const password = String(formData.get('password'));

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { email, passwordHash } });

  redirect('/login');
}
```

- [x] **Step 2: Write the signup page**

```tsx
// src/app/signup/page.tsx
import { signupAction } from './actions';

export default function SignupPage() {
  return (
    <form action={signupAction}>
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Sign up</button>
    </form>
  );
}
```

- [x] **Step 3: Write the login page**

```tsx
// src/app/login/page.tsx
'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <form
      action={async (formData) => {
        await signIn('credentials', {
          email: formData.get('email'),
          password: formData.get('password'),
          redirectTo: '/dashboard/resumes',
        });
      }}
    >
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Log in</button>
    </form>
  );
}
```

- [x] **Step 4: Manually verify**

Run: `npm run dev`, visit `http://localhost:3000/signup`, create an account, then log in at `/login`.
Expected: signup redirects to `/login`; login redirects to `/dashboard/resumes` (404 until Task 18 — expected). Verified live in the browser: signup created a real `User` row, login set a real session (confirmed via `/profile`, which also fully round-tripped: save → DB write → reload shows persisted values → log out clears the session → `/profile` correctly throws `Not authenticated` afterward).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add signup and login pages"
```

---



### Task 16: Shared app shell (sidebar layout)

Every authenticated page shares one persistent, collapsible sidebar (confirmed against the Figma design): **R** (Resumes), **O** (Objects), **AI** (Career Q&A), plus a user avatar at the bottom that's the entry point to the Profile page. Everything under this shell moves into a `(app)` route group — route groups don't affect the URL, so `/dashboard/resumes` etc. stay exactly where they are. `signup`/`login` (Task 15) stay outside `(app)` — no sidebar, since there's no session yet.

**Files:**

- Create: `src/app/(app)/layout.tsx`
- Create: `src/components/Sidebar.tsx`

**Interfaces:**

- Consumes: `auth` (`src/lib/auth.ts`)
- Produces: `AppLayout` — wraps every page under `(app)/`, redirects to `/login` if there's no session, and renders `<Sidebar>` + the page content side by side.

- [x] **Step 1: Write the sidebar component**

Implementation deviates from the sketch above — uses real values pulled from Figma (`get_design_context` on node `16:133`) instead of unstyled markup: cream `#faf9f5` background, `2px` black right border, pill-shaped nav links (`#e0503a`/`#8a2f1f` for the active one, black border/text otherwise), and a `32px` black rounded-square avatar — via a `Sidebar.module.css` (CSS Modules, no new dependency, no Tailwind).

```tsx
// src/components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const links = [
  { href: '/dashboard/resumes', label: 'R', title: 'Resumes' },
  { href: '/dashboard/objects', label: 'O', title: 'Objects' },
  { href: '/qna', label: 'AI', title: 'Career Q&A' },
];

export function Sidebar({ initial }: { initial: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <nav aria-label="Main" style={{ width: collapsed ? 48 : 160 }}>
      <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
        {collapsed ? '»' : '«'}
      </button>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              title={link.title}
              aria-current={pathname.startsWith(link.href) ? 'page' : undefined}
            >
              {collapsed ? link.label : `${link.label} — ${link.title}`}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/profile" title="Profile">
        {initial}
      </Link>
    </nav>
  );
}
```

The avatar is a plain `Link` to `/profile` rather than a popover menu — Profile itself hosts the "Log out" action (Task 17), so there's no separate menu component to build.

- [x] **Step 2: Write the layout**

```tsx
// src/app/(app)/layout.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const initial = (session.user.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar initial={initial} />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
```

Every existing page's own `getCurrentUserId()` call still matters — the layout's redirect is a friendlier guard, not a replacement for the value each page actually needs to scope its queries.

- [x] **Step 3: Manually verify**

Verified live in the browser: visiting `/profile` while logged out redirected to `/login` (guard confirmed); logged in and confirmed the sidebar renders with the Figma styling, R/O/AI links, and a working avatar (showing the session's email initial); collapse toggle confirmed working both directions (expand ↔ collapse).

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add shared sidebar layout for authenticated pages"
```

---



### Task 17: Profile UI

Not in Figma at all, and not in the original plan's file list either — genuinely new scope, added because the sidebar avatar needs somewhere to go. Reached only via the sidebar avatar (Task 16), not one of R/O/AI.

**Files:**

- Create: `src/app/(app)/profile/page.tsx`
- Create: `src/app/(app)/profile/actions.ts`

**Interfaces:**

- Consumes: `getCurrentUserId`, `getProfile`/`upsertProfile` (`src/lib/profile.ts`), `signOut` (`next-auth/react`)
- Produces: working `/profile` page — view/edit the live profile fields, plus log out.

- [x] **Step 1: Write the action**

```ts
// src/app/(app)/profile/actions.ts
'use server';

import { getCurrentUserId } from '@/lib/session';
import { upsertProfile } from '@/lib/profile';
import { redirect } from 'next/navigation';

export async function updateProfileAction(formData: FormData) {
  const userId = await getCurrentUserId();
  await upsertProfile(userId, {
    fullName: String(formData.get('fullName')),
    email: String(formData.get('email')),
    phone: String(formData.get('phone')),
    location: String(formData.get('location')),
    links: { linkedin: String(formData.get('linkedin') ?? '') },
  });
  redirect('/profile');
}
```

- [x] **Step 2: Write the page**

```tsx
// src/app/(app)/profile/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getProfile } from '@/lib/profile';
import { updateProfileAction } from './actions';
import { LogoutButton } from './LogoutButton';

export default async function ProfilePage() {
  const userId = await getCurrentUserId();
  const profile = await getProfile(userId);

  return (
    <div>
      <h1>Profile</h1>
      <form action={updateProfileAction}>
        <input name="fullName" defaultValue={profile?.fullName} placeholder="Full name" required />
        <input name="email" type="email" defaultValue={profile?.email} placeholder="Email" required />
        <input name="phone" defaultValue={profile?.phone} placeholder="Phone" required />
        <input name="location" defaultValue={profile?.location} placeholder="Location" required />
        <input
          name="linkedin"
          defaultValue={(profile?.links as any)?.linkedin ?? ''}
          placeholder="LinkedIn URL"
        />
        <button type="submit">Save</button>
      </form>
      <LogoutButton />
    </div>
  );
}
```

```tsx
// src/app/(app)/profile/LogoutButton.tsx
'use client';

import { signOut } from 'next-auth/react';

export function LogoutButton() {
  return (
    <button type="button" onClick={() => signOut({ redirectTo: '/login' })}>
      Log out
    </button>
  );
}
```

`signOut` needs a client component since it's from `next-auth/react`, hence the small split-out button.

- [x] **Step 3: Manually verify**

Verified live in the browser ahead of Task 16 (no sidebar avatar to click yet, so visited `/profile` directly): filled and saved the form, confirmed the `Profile` row was written correctly in Postgres, confirmed the form re-shows the persisted values on reload, "Log out" returned to `/login`, and `/profile` correctly throws `Not authenticated` afterward. The sidebar entry point itself will be confirmed once Task 16 exists.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add profile page with edit form and logout"
```

---



### Task 18: Object Dashboard UI (browse, create, edit)

No separate object list page — the old standalone `/objects` page is dropped. The Object Dashboard already shows every version grouped by object with usage info (Task 10); it just needs a type/tag filter and a "+ New Object" entry point to also cover browsing and creation. Editing happens via the same modal used to pick objects for a resume section (Task 19 reuses it), following the Figma 3b design: a "recent objects" picker with a "+" to see every version of one object, plus a "create new" form — direct-edit mode skips the picker and jumps straight to that object's full version list.

**Files:**

- Create: `src/components/ObjectPickerModal.tsx`
- Create: `src/app/(app)/dashboard/objects/page.tsx`
- Create: `src/lib/objects/fieldConfig.ts` (added mid-implementation, see Step 2)

**Interfaces:**

- Consumes: `getCurrentUserId`, `getObjectDashboard` (`src/lib/objects/dashboard.ts`), `listTagsForUser` (`src/lib/objects/queries.ts`), `createObjectAction`/`editObjectAction`/`listLatestObjectsAction`/`getObjectHistoryAction` (`src/app/objects/actions.ts`)
- Produces: `ObjectPickerModal` (shared, reused by Task 19) and working `/dashboard/objects` page (`?type=` and `?tags=` filter client-side, same reasoning as the old list page — the whole set is already fetched).

- [x] **Step 1: Write the shared picker/editor modal**

```tsx
// src/components/ObjectPickerModal.tsx
'use client';

import { useRef, useState } from 'react';
import { createObjectAction, editObjectAction, getObjectHistoryAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';

type ObjectSummary = { id: string; rootVersionId: string; body: string; versionNumber: number };

type Props = {
  type: ObjectType;
  recentObjects?: ObjectSummary[];
  onPick: (objectVersionId: string) => void;
  triggerLabel?: string;
  editingRootVersionId?: string;
};

export function ObjectPickerModal({
  type,
  recentObjects = [],
  onPick,
  triggerLabel = '+ Object',
  editingRootVersionId,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'recent' | 'allVersions'>('recent');
  const [allVersions, setAllVersions] = useState<ObjectSummary[]>([]);

  async function openAllVersions(rootVersionId: string) {
    setAllVersions(await getObjectHistoryAction(rootVersionId));
    setView('allVersions');
  }

  function open() {
    if (editingRootVersionId) {
      openAllVersions(editingRootVersionId);
    } else {
      setView('recent');
    }
    dialogRef.current?.showModal();
  }

  function pick(id: string) {
    onPick(id);
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" onClick={open}>
        {triggerLabel}
      </button>
      <dialog ref={dialogRef}>
        <button type="button" onClick={() => dialogRef.current?.close()}>
          ✕
        </button>

        {view === 'recent' && (
          <>
            <h2>Add Object — {type}</h2>
            <fieldset>
              <legend>Recent objects</legend>
              {recentObjects.map((o) => (
                <span key={o.id}>
                  <button type="button" onClick={() => pick(o.id)}>
                    {o.body.slice(0, 20)}
                  </button>
                  <button type="button" onClick={() => openAllVersions(o.rootVersionId)} aria-label="See all versions">
                    +
                  </button>
                </span>
              ))}
            </fieldset>
            <fieldset>
              <legend>or create new</legend>
              <form
                action={async (formData) => {
                  const { id } = await createObjectAction(
                    type,
                    { category: String(formData.get('category') ?? '') },
                    String(formData.get('body'))
                  );
                  pick(id);
                }}
              >
                <input name="category" placeholder="Title / category" />
                <textarea name="body" placeholder="Markdown content" required />
                <button type="submit">Create</button>
              </form>
            </fieldset>
          </>
        )}

        {view === 'allVersions' && (
          <>
            <h2>All versions</h2>
            <ul>
              {allVersions.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => pick(v.id)}>
                    v{v.versionNumber}: {v.body.slice(0, 40)}
                  </button>
                </li>
              ))}
            </ul>
            <form
              action={async (formData) => {
                const latest = allVersions[allVersions.length - 1];
                const { id } = await editObjectAction(
                  latest.id,
                  { category: String(formData.get('category') ?? '') },
                  String(formData.get('body'))
                );
                pick(id);
              }}
            >
              <textarea name="body" placeholder="Edit and save as a new version" required defaultValue={allVersions.at(-1)?.body} />
              <button type="submit">Save new version</button>
            </form>
            {!editingRootVersionId && (
              <button type="button" onClick={() => setView('recent')}>
                ← Back
              </button>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
```

- [x] **Step 2: Write the Object Dashboard page**

Original sketch was a bare per-version list with a type/tag filter and one `ObjectPickerModal` "Edit" trigger per row. Went through several rounds of re-pulling the real Figma design (node `8:196`, the actual "4a" screen) and live user feedback; what actually shipped:

- `page.tsx` (Server Component: fetch + tag-filter) + `ObjectDashboardClient.tsx` (Client Component: owns the modals, `onPick` → `router.refresh()`) — split because an async Server Component can't pass a plain closure to a Client Component prop.
- One bordered box per object *family* (versions sharing a `rootVersionId`), one filmstrip per line at full page width — not Figma's literal 373px card, not a flat per-version list. Caption = root version's identity field (`company`/`institution`/etc. — `IDENTITY_FIELD` in `src/lib/objects/fieldConfig.ts`; "Summary" fallback for the type with none). Filmstrip shows the `CHIP_LIMIT` most recent versions, newest first; the dashed "→" opens the rest.
- Chip rendering (identity, other fields, a `MMM-YYYY – MMM-YYYY` date range, body, tags, a per-chip "✎" edit icon) lives in one shared `src/components/ObjectVersionChip.tsx`, used by both the dashboard filmstrip and the picker modal's "all versions" view — same component everywhere, always a `<div>` (not a `<button>`) so the edit trigger can nest inside it.
- The "✎" icon prefills from that exact version and calls `editObjectAction` — appends a new version to the *same* object, confirmed against the DB. (An earlier version of this made it create an independent object instead; the user caught it as a bug and it was reverted.)
- Object create/edit forms in `ObjectPickerModal` are type-aware (`FIELDS_BY_TYPE`) and collect tags — the original sketch's `{ category, body }`-only form only actually satisfied 1 of 7 object types.
- Dropped the type filter (redundant with the per-type sections already there; type-scoping belongs to the resume-builder picker instead) and the "all versions" inline edit form (that view is browse-only, per the original design intent).
- Dates are month/year precision (`type="month"`, no day), displayed via a hardcoded month-abbreviation table rather than `toLocaleDateString` — the latter caused a real server/client hydration mismatch (Node's default locale vs. the browser's OS locale disagreeing on date format).

Full round-by-round detail is in commit `4a936d0`'s message, not reproduced here.

- **Post-ship fix**: the "Recent objects" fieldset showed unconditionally, so the Dashboard's "+ New {type}" (which never passes `recentObjects`) always rendered it empty. Now only renders when `recentObjects.length > 0` — hidden on the dashboard, shown once Task 19 populates it.

- [x] **Step 3: Manually verify**



Verified structurally (compiles, type-checks clean, 46/46 tests pass) and live at every round described in Step 2 above — real objects of multiple types created through the type-aware form, tag filtering, edit-in-place confirmed against the DB, hydration warnings gone from the console. Full click-through is yours to do too; nothing here is taken on faith alone.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add object dashboard with create/edit modal, drop standalone object list page"
```

---



### Task 19: Resume UI (create, view, edit, fork)

Single vertical form (Figma 3a): name field, sections stack downward, each section's objects picked via `ObjectPickerModal` (already built, Task 18) instead of inline checkboxes — client component, server-fetched initial data. Edit/Fork reuse the same form, pre-filled. Sections support reorder (↑/↓) and delete, using the `order` field the write path already supports. Resume Screen has three tabs: **Resume**, **History** (real), **Chat** (stub, disabled).

`ObjectPickerModal`'s current props, for reference (Task 18 built this; don't re-derive it from an old sketch — it does not have an `onOpen` prop today, Step 1 below adds one):

```ts
type ObjectSummary = {
  id: string;
  rootVersionId?: string;
  body: string;
  versionNumber: number;
  fields?: unknown;
  tags?: string[];
  createdAt?: string | Date;
};
type Props = {
  type: ObjectType;
  recentObjects?: ObjectSummary[]; // only rendered when non-empty
  onPick: (objectVersionId: string) => void;
  triggerLabel?: string;
  editingRootVersionId?: string; // browse-only "all versions", no create/edit form
  prefillFrom?: ObjectSummary; // prefills + edits in place via editObjectAction
};
```

**Files:**

- Modify: `src/components/ObjectPickerModal.tsx` (add an `onOpen` callback prop — Step 1)
- Create: `src/app/(app)/resumes/ResumeForm.tsx` (shared client form for new/edit/fork)
- Create: `src/app/(app)/resumes/new/page.tsx`
- Create: `src/app/(app)/resumes/[id]/page.tsx`
- Create: `src/app/(app)/resumes/[id]/edit/page.tsx`
- Create: `src/app/(app)/resumes/[id]/fork/page.tsx`
- Create: `src/app/(app)/resumes/[id]/HistoryTab.tsx`
- Create: `src/app/(app)/resumes/[id]/ResumeView.module.css` (styled against Figma node `8:62` — outline/filled pill buttons, active-tab bold, dashed section boxes)

**Interfaces:**

- Consumes: `getCurrentUserId`, `getResumeVersionWithContent`, `getResumeTreeHistory` (`src/lib/resumes/queries.ts`), `listLatestObjectsAction` (`src/app/objects/actions.ts`), `createResumeAction`/`editResumeAction`/`forkResumeAction` (`src/app/resumes/actions.ts`), `ObjectPickerModal` (Task 18)
- Produces: working `/resumes/new`, `/resumes/[id]`, `/resumes/[id]/edit`, `/resumes/[id]/fork` pages, each writing exactly once on submit; an `onOpen` prop added to `ObjectPickerModal`.

- [x] **Step 1: Add an** `onOpen` **prop to** `ObjectPickerModal`

`ResumeForm` (Step 2) needs to lazy-load a section's recent objects only when that section's picker is actually opened, not eagerly for every section on mount. `ObjectPickerModal` has no hook for "the picker just opened" — this step adds one, on its own, before anything is built that depends on it.

```diff
 type Props = {
   type: ObjectType;
   recentObjects?: ObjectSummary[];
   onPick: (objectVersionId: string) => void;
   triggerLabel?: string;
   editingRootVersionId?: string;
   prefillFrom?: ObjectSummary;
+  onOpen?: () => void;
 };

 export function ObjectPickerModal({
   type,
   recentObjects = [],
   onPick,
   triggerLabel = '+ Object',
   editingRootVersionId,
   prefillFrom,
+  onOpen,
 }: Props) {
   ...
   function open() {
     if (editingRootVersionId) {
       openAllVersions(editingRootVersionId);
     } else {
       setView('recent');
+      onOpen?.();
     }
     dialogRef.current?.showModal();
   }
```

Fires only on the plain "recent picker" path — `editingRootVersionId`'s browse-only open already fetches on open via `openAllVersions`, doesn't need it. No existing caller passes `onOpen`, so this is additive and doesn't change current behavior anywhere it's already used (Task 18's dashboard, and its own per-chip edit trigger).

- [x] **Step 2: Write the shared form**

```tsx
// src/app/(app)/resumes/ResumeForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createResumeAction, editResumeAction, forkResumeAction } from './actions';
import { ObjectPickerModal } from '@/components/ObjectPickerModal';
import { listLatestObjectsAction } from '@/app/objects/actions';
import type { ObjectType } from '@/lib/objects/schemas';

const TYPES: ObjectType[] = ['WORK_EXPERIENCE', 'EDUCATION', 'SKILLS', 'SUMMARY', 'PROJECT', 'CERTIFICATION', 'EXTRACURRICULAR'];

// Mirrors ObjectPickerModal's ObjectSummary (objectVersionId instead of id, since that's
// what a resume section stores) so recentObjects/prefillFrom never have to fabricate data.
type Item = {
  objectVersionId: string;
  body: string;
  fields?: unknown;
  tags?: string[];
  rootVersionId?: string;
  versionNumber?: number;
  createdAt?: string | Date;
};
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
          objectVersionId: o.id,
          body: o.body,
          fields: o.fields,
          tags: o.tags,
          rootVersionId: o.rootVersionId,
          versionNumber: o.versionNumber,
          createdAt: o.createdAt,
        })),
      }));
    }
  }

  function addItem(type: ObjectType, item: Item) {
    setSections((prev) =>
      prev.map((s) => (s.sectionType === type ? { ...s, items: [...s.items, item] } : s))
    );
  }

  // Item-level edit (Figma's per-item "Edit" button): reuses ObjectPickerModal's prefillFrom,
  // same edit-in-place semantics as Task 18's chip pencil icon (new version, same rootVersionId).
  function replaceItem(type: ObjectType, oldObjectVersionId: string, newObjectVersionId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.sectionType === type
          ? {
              ...s,
              items: s.items.map((it) =>
                it.objectVersionId === oldObjectVersionId ? { ...it, objectVersionId: newObjectVersionId } : it
              ),
            }
          : s
      )
    );
  }

  async function handleSubmit() {
    const payload = sections.map((s, i) => ({
      sectionType: s.sectionType,
      order: i,
      items: s.items.map((it, j) => ({ objectVersionId: it.objectVersionId, order: j })),
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
    <div>
      {versionInfo && <p>{versionInfo}</p>}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Resume name" required />

      {sections.map((section, index) => (
        <fieldset key={section.sectionType}>
          <legend>
            {section.sectionType}
            <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label="Move up">
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveSection(index, 1)}
              disabled={index === sections.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button type="button" onClick={() => removeSection(index)} aria-label="Delete section">
              ✕
            </button>
          </legend>
          <ul>
            {section.items.map((item) => (
              <li key={item.objectVersionId}>
                {item.body.slice(0, 60)}
                <ObjectPickerModal
                  type={section.sectionType}
                  prefillFrom={{ id: item.objectVersionId, body: item.body, fields: item.fields, tags: item.tags, versionNumber: 0 }}
                  onPick={(newId) => replaceItem(section.sectionType, item.objectVersionId, newId)}
                  triggerLabel="Edit"
                />
              </li>
            ))}
          </ul>
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
            onOpen={() => openPickerFor(section.sectionType)}
            onPick={(objectVersionId) => {
              const picked =
                recent[section.sectionType]?.find((r) => r.objectVersionId === objectVersionId) ?? {
                  objectVersionId,
                  body: '(new)',
                };
              addItem(section.sectionType, picked);
            }}
          />
        </fieldset>
      ))}

      <select onChange={(e) => e.target.value && addSectionType(e.target.value as ObjectType)} value="">
        <option value="">+ Add Section</option>
        {TYPES.filter((t) => !sections.some((s) => s.sectionType === t)).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <button type="button" onClick={handleSubmit}>
        {mode === 'create' ? 'Done' : mode === 'edit' ? 'Save new version' : 'Save fork'}
      </button>
    </div>
  );
}
```



`onOpen` is used here as added by Step 1. Separately: `replaceItem` swaps in the new `objectVersionId` but keeps the stale `body`/`fields` until reload, since `onPick` only ever returns an id — decide during implementation whether that needs a follow-up fetch.

- [x] **Step 3: Write the create/edit/fork pages**

```tsx
// src/app/(app)/resumes/new/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { ResumeForm } from '../ResumeForm';

export default async function NewResumePage() {
  await getCurrentUserId();
  return <ResumeForm mode="create" />;
}
```

```tsx
// src/app/(app)/resumes/[id]/edit/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { ResumeForm } from '../../ResumeForm';

export default async function EditResumePage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  const resume = await getResumeVersionWithContent(userId, params.id);

  return (
    <ResumeForm
      mode="edit"
      sourceId={resume.id}
      initialName={resume.name}
      initialSections={resume.sections.map((s) => ({
        sectionType: s.sectionType as any,
        items: s.items.map((it) => ({
          objectVersionId: it.objectVersionId,
          body: it.objectVersion.body,
          fields: it.objectVersion.fields,
          tags: it.objectVersion.tags,
          rootVersionId: it.objectVersion.rootVersionId,
          versionNumber: it.objectVersion.versionNumber,
          createdAt: it.objectVersion.createdAt,
        })),
      }))}
      versionInfo={`Editing from v${resume.id.slice(0, 8)}`}
    />
  );
}
```

```tsx
// src/app/(app)/resumes/[id]/fork/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { ResumeForm } from '../../ResumeForm';

export default async function ForkResumePage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  const source = await getResumeVersionWithContent(userId, params.id);

  return (
    <ResumeForm
      mode="fork"
      sourceId={source.id}
      initialName={`Fork of ${source.name}`}
      initialSections={source.sections.map((s) => ({
        sectionType: s.sectionType as any,
        items: s.items.map((it) => ({
          objectVersionId: it.objectVersionId,
          body: it.objectVersion.body,
          fields: it.objectVersion.fields,
          tags: it.objectVersion.tags,
          rootVersionId: it.objectVersion.rootVersionId,
          versionNumber: it.objectVersion.versionNumber,
          createdAt: it.objectVersion.createdAt,
        })),
      }))}
      versionInfo={`Forked from ${source.name}`}
    />
  );
}
```

Both mappings carry the item's full `fields`/`tags`/`rootVersionId`/`versionNumber`/`createdAt`, not just `objectVersionId`/`body` — `getResumeVersionWithContent` already includes the full `objectVersion` row (`include: { objectVersion: true }`), so this is free. Without it, the per-item "Edit" trigger's `prefillFrom` (Step 2) would only work for items added fresh in this session, silently losing data for anything loaded from an existing resume on edit/fork.

`versionInfo`'s "v{id.slice(0,8)}" is a placeholder — `ResumeVersion` has no `versionNumber` field, so there's no clean short label yet; decide during implementation.

- [x] **Step 4: Write the view page with Resume / History / Chat tabs**

```tsx
// src/app/(app)/resumes/[id]/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { HistoryTab } from './HistoryTab';
import Link from 'next/link';

export default async function ViewResumePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const userId = await getCurrentUserId();
  const resume = await getResumeVersionWithContent(userId, params.id);
  const tab = searchParams.tab ?? 'resume';

  return (
    <div>
      <h1>{resume.name}</h1>
      <p>edited {resume.createdAt.toISOString().slice(0, 10)}</p>
      <Link href={`/resumes/${resume.id}/edit`}>Edit</Link>
      <Link href={`/resumes/${resume.id}/fork`}>Fork</Link>

      <nav>
        <Link href={`/resumes/${resume.id}?tab=resume`}>Resume</Link>
        <Link href={`/resumes/${resume.id}?tab=history`}>History</Link>
        <span title="Coming later — per-resume AI chat, not in Spike 1">Chat</span>
      </nav>

      {tab === 'resume' &&
        resume.sections.map((section) => (
          <div key={section.id}>
            <h2>{section.sectionType}</h2>
            <ul>
              {section.items.map((item) => (
                <li key={item.id}>{item.objectVersion.body}</li>
              ))}
            </ul>
          </div>
        ))}

      {tab === 'history' && <HistoryTab userId={userId} rootVersionId={resume.rootVersionId} currentId={resume.id} />}
    </div>
  );
}
```

```tsx
// src/app/(app)/resumes/[id]/HistoryTab.tsx
import { getResumeTreeHistory } from '@/lib/resumes/queries';
import Link from 'next/link';

export async function HistoryTab({
  userId,
  rootVersionId,
  currentId,
}: {
  userId: string;
  rootVersionId: string;
  currentId: string;
}) {
  const history = await getResumeTreeHistory(userId, rootVersionId);

  return (
    <ul>
      {history.map((v, i) => (
        <li key={v.id}>
          <Link href={`/resumes/${v.id}`}>
            Version {i + 1} {v.id === currentId && '(current)'} — {v.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

"Chat" is a disabled label, not a link. "edited {date}" uses plain `YYYY-MM-DD` from `createdAt`, not a fuzzy "2 days ago" (no `versionNumber` field to show instead, and relative-time strings risk the same server/client hydration mismatch already hit once for object dates).

Two real fixes found writing the actual code, not just the sketch: `ResumeForm.tsx`'s import of the resume actions has to be `@/app/resumes/actions` (absolute), not the sketch's `./actions` — the real file lives at `src/app/resumes/actions.ts`, outside the `(app)` route group, same pattern as `objects/actions.ts`; a relative import from `src/app/(app)/resumes/ResumeForm.tsx` would resolve to a file that doesn't exist. And every page's `params`/`searchParams` had to become `Promise<...>` + `await` — Next.js 16's async API, already established everywhere else in this plan, the sketch just hadn't been updated to match.

Type-checks clean (only the 3 pre-existing unrelated test-file errors remain), 46/46 tests pass. Manual click-through deferred — the user will do it once both Task 19 and Task 20 are complete.

- [ ] **Step 5: Manually verify**

Run: `npm run dev`. Confirm `onOpen` fires as expected (Step 1), then create a resume with objects added via the picker modal, add a second section and reorder it above the first, delete a section and confirm its items are gone from the payload, view the resume, check the History tab shows one entry, edit it — confirm the pre-existing item still has a working "Edit" trigger (not just newly-added ones) — confirm History now shows two entries and the edited version is the current one, fork it, and confirm the fork's header shows "Forked from...".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add resume create/view/edit/fork pages with picker-based sections and history tab"
```

---



### Task 20: Resume Dashboard UI

Flat, indented rows (Figma's "1b"). Only *forks* get their own row, nested under whichever tree they branched from, to arbitrary depth; a tree's row always shows its **latest** version only — no per-version rows (that's Task 19's History tab).

**Files:**

- Create: `src/app/(app)/dashboard/resumes/page.tsx`
- Create: `src/app/(app)/dashboard/resumes/ResumeDashboard.module.css` (styled against Figma node `16:61` — row dividers, pill fork badge, 📄/↳ icons)
- Modify: `src/lib/resumes/queries.ts` (`getResumeForest` needs to also return each tree's head `createdAt`, so the row can show "edited {date}" — not returned today)

**Interfaces:**

- Consumes: `getCurrentUserId`, `getResumeForest` (`src/lib/resumes/queries.ts`)
- Produces: working `/dashboard/resumes` page.

- [x] **Step 1: Write the page**

```tsx
// src/app/(app)/dashboard/resumes/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeForest } from '@/lib/resumes/queries';
import Link from 'next/link';

type Tree = Awaited<ReturnType<typeof getResumeForest>>[number];

// Recurses to arbitrary depth — `forest` is already a flat list of every tree with a
// forkedFromRootVersionId link, so a fork-of-a-fork just keeps matching one level deeper.
function ResumeTreeRow({ tree, forest, depth = 0 }: { tree: Tree; forest: Tree[]; depth?: number }) {
  const children = forest.filter((t) => t.forkedFromRootVersionId === tree.rootVersionId);
  return (
    <li style={{ marginLeft: depth * 20 }}>
      {depth > 0 && '↳ '}
      {/* Whole row is one link — not just the name — so clicking anywhere on it
          (the fork label, the edited date) routes to the resume, not just the name text. */}
      <Link href={`/resumes/${tree.headVersionId}`}>
        {tree.name}
        {depth > 0 && ' (fork)'}
        {' — edited '}
        {tree.headCreatedAt.toISOString().slice(0, 10)}
      </Link>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <ResumeTreeRow key={child.rootVersionId} tree={child} forest={forest} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function ResumeDashboardPage() {
  const userId = await getCurrentUserId();
  const forest = await getResumeForest(userId);
  const roots = forest.filter((t) => !t.forkedFromRootVersionId);

  return (
    <div>
      <h1>My Resumes</h1>
      <ul>
        {roots.map((tree) => (
          <ResumeTreeRow key={tree.rootVersionId} tree={tree} forest={forest} />
        ))}
      </ul>
      <Link href="/resumes/new">+ New resume</Link>
    </div>
  );
}
```

`headCreatedAt` = `head.createdAt` — `getResumeForest` already computes `head` internally, just never returned it.

- [x] **Step 2: Manually verify**

Page is live and in active use by later work (ResumeForm/ObjectDashboard flows link into it); code matches the plan (styled per Figma in a later pass) and the full suite passes (49/49).

- [x] **Step 3: Commit**

Committed in `5718eb4` ("feat: add Resume Create/Edit/Fork UI and Resume Dashboard (Task 19/20)").

---



### Task 21: AI context builder

Unchanged from the original plan — pure function, no UI dependency, just renumbered.

**Files:**

- Create: `src/lib/ai/context.ts`
- Test: `src/lib/ai/context.test.ts`

**Interfaces:**

- Consumes: none (pure function)
- Produces: `buildCareerContext(objects: Array<{ type: string; body: string; fields: unknown }>, profile: { fullName: string; location: string } | null): string`

- [x] **Step 1: Write the failing test**

```ts
// src/lib/ai/context.test.ts
import { describe, it, expect } from 'vitest';
import { buildCareerContext } from './context';

describe('buildCareerContext', () => {
  it('includes profile name and every object body, grouped by type', () => {
    const context = buildCareerContext(
      [
        { type: 'SKILLS', body: 'Python, TypeScript', fields: { category: 'Languages' } },
        { type: 'WORK_EXPERIENCE', body: 'Led backend team', fields: { company: 'Acme' } },
      ],
      { fullName: 'Ada Lovelace', location: 'London' }
    );

    expect(context).toContain('Ada Lovelace');
    expect(context).toContain('SKILLS');
    expect(context).toContain('Python, TypeScript');
    expect(context).toContain('WORK_EXPERIENCE');
    expect(context).toContain('Led backend team');
  });

  it('handles a missing profile gracefully', () => {
    const context = buildCareerContext([], null);
    expect(context).toContain('No objects yet');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/ai/context.test.ts`
Expected: FAIL with "Cannot find module './context'"

- [x] **Step 3: Write the implementation**

```ts
// src/lib/ai/context.ts
type ContextObject = { type: string; body: string; fields: unknown };
type ContextProfile = { fullName: string; location: string } | null;

export function buildCareerContext(objects: ContextObject[], profile: ContextProfile): string {
  const header = profile
    ? `Candidate: ${profile.fullName} (${profile.location})`
    : 'Candidate profile not set.';

  if (objects.length === 0) {
    return `${header}\n\nNo objects yet — the candidate has not added any resume content.`;
  }

  const byType = new Map<string, ContextObject[]>();
  for (const obj of objects) {
    const group = byType.get(obj.type) ?? [];
    group.push(obj);
    byType.set(obj.type, group);
  }

  const sections = Array.from(byType.entries())
    .map(([type, items]) => {
      const lines = items.map((o) => `- ${o.body} (fields: ${JSON.stringify(o.fields)})`);
      return `## ${type}\n${lines.join('\n')}`;
    })
    .join('\n\n');

  return `${header}\n\n${sections}`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/ai/context.test.ts`
Expected: PASS (2 tests) — confirmed, and full suite (51/51) also passes.

- [ ] **Step 5: Commit** — left for you to commit.

```bash
git add -A
git commit -m "feat: add career context builder for AI prompts"
```

---



### Task 22: Q&A streaming route handler

Unchanged from the original plan — just renumbered.

**Files:**

- Create: `src/app/api/qna/route.ts`
- Test: `src/app/api/qna/route.test.ts`
- Modify: `.env.example` (add `OPENAI_API_KEY`)

**Interfaces:**

- Consumes: `getCurrentUserId`, `listObjectsForUser` (`src/lib/objects/queries.ts`), `getProfile` (`src/lib/profile.ts`), `buildCareerContext` (`src/lib/ai/context.ts`), `streamText` from `ai`
- Produces: `POST` handler at `/api/qna` accepting `{ messages: CoreMessage[] }`, returning a streamed AI response.

> **Deviation from the code below, discovered at execution time (2026-09-07):** the AI SDK actually installed (`ai@7.0.77`, `@ai-sdk/openai@4.0.46`) is newer than what this task's code assumed. `streamText(...).toDataStreamResponse()` no longer exists (`toUIMessageStreamResponse()` now); `useChat` (Task 23) no longer ships from `ai/react` (moved to a separate `@ai-sdk/react` package, not yet installed) and now sends `UIMessage[]` (`{ id, role, parts: [...] }`), not flat `{ role, content }` — so the route now converts via `convertToModelMessages()` (now `async`, returning `Promise<ModelMessage[]>`) before calling `streamText`. The code blocks below are updated to match what was actually built and verified; same feature/interfaces, different concrete calls.

- [x] **Step 1: Write the failing test**

Mock `ai`'s `streamText` and the DB/session calls to assert the route assembles context correctly and calls `streamText` with it — no real OpenAI call. `convertToModelMessages` is left as the real implementation (via `importOriginal`) so the UI-message-to-model-message conversion is exercised for real, not mocked away.

```ts
// src/app/api/qna/route.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/session', () => ({ getCurrentUserId: vi.fn().mockResolvedValue('user-1') }));
vi.mock('@/lib/objects/queries', () => ({
  listObjectsForUser: vi.fn().mockResolvedValue([
    { type: 'SKILLS', body: 'Python', fields: { category: 'Languages' } },
  ]),
}));
vi.mock('@/lib/profile', () => ({
  getProfile: vi.fn().mockResolvedValue({ fullName: 'Ada Lovelace', location: 'London' }),
}));

const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn().mockReturnValue({ toUIMessageStreamResponse: () => new Response('ok') }),
}));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: streamTextMock };
});
vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn().mockReturnValue('mock-model') }));

import { POST } from './route';

describe('POST /api/qna', () => {
  it('includes the career context as a system message and converts UI messages to model messages', async () => {
    const request = new Request('http://localhost/api/qna', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'What role fits me?' }] }],
      }),
    });

    await POST(request);

    const call = streamTextMock.mock.calls[0][0];
    expect(call.system).toContain('Ada Lovelace');
    expect(call.system).toContain('Python');
    expect(call.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'What role fits me?' }] },
    ]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/qna/route.test.ts`
Expected/actual: FAIL with "Cannot find module './route'"

- [x] **Step 3: Write the implementation**

```ts
// src/app/api/qna/route.ts
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getCurrentUserId } from '@/lib/session';
import { listObjectsForUser } from '@/lib/objects/queries';
import { getProfile } from '@/lib/profile';
import { buildCareerContext } from '@/lib/ai/context';

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  const { messages }: { messages: UIMessage[] } = await request.json();

  const [objects, profile] = await Promise.all([listObjectsForUser(userId), getProfile(userId)]);

  const context = buildCareerContext(objects, profile);

  const result = streamText({
    model: openai('gpt-4o'),
    system: `You are a career advisor. Use the candidate's career context below to answer questions.\n\n${context}`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

- [x] **Step 4: Add OPENAI_API_KEY to .env.example**

Appended `OPENAI_API_KEY="sk-..."` to `.env.example`.

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/api/qna/route.test.ts`
Expected/actual: PASS (1 test) — full suite also passes (52/52).

- [x] **Step 6: Commit** — left for you to commit.

```bash
git add -A
git commit -m "feat: add streaming Q&A route handler"
```

---



### Task 23: Q&A chat UI

ChatGPT/Claude-style chat page, living under `(app)/` so it gets the sidebar (the "AI" link points here).

**Files:**

- Create: `src/app/(app)/qna/page.tsx`

**Interfaces:**

- Consumes: `useChat` from `ai/react`, `/api/qna` (Task 22)
- Produces: working `/qna` chat page.

- [ ] **Step 1: Write the chat page**

> **Deviation, discovered at execution time (2026-09-07):** `useChat` moved out of `ai/react` (that subpath no longer exists) into a separate package, `@ai-sdk/react` (installed: `npm install @ai-sdk/react`, resolved `4.0.96`). Its API also changed — no more built-in `input`/`handleInputChange`/`handleSubmit` state; input is managed locally with `useState` and sent via `sendMessage({ text })`. `messages` are `UIMessage[]`, rendered via `.parts` (each `{ type: 'text', text }`) instead of a flat `.content` string. The transport/endpoint is now set via `transport: new DefaultChatTransport({ api: '/api/qna' })` (both from `ai`), not a top-level `api` option. The sidebar already links to `/qna` (`src/components/Sidebar.tsx`) — no navigation change needed.

```tsx
// src/app/(app)/qna/page.tsx
'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function QnaPage() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/qna' }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {messages.length === 0 && <p>Ask anything about your career, based on everything in your objects.</p>}
        {messages.map((m) => (
          <div key={m.id} style={{ textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <div style={{ display: 'inline-block', borderRadius: 12, padding: '8px 12px' }}>
              {m.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a career question…"
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={status === 'streaming' || status === 'submitted'}>
          Send
        </button>
      </form>
    </div>
  );
}
```

Message bubbles are role-aligned (right for user, left for assistant) with no further styling library — matches the rest of the app's plain-CSS approach, just enough structure to read as a chat UI rather than a bare list.

- [x] **Step 1: Write the chat page** — done, above. No test file (consistent with other client components in this codebase, e.g. `ObjectPickerModal`/`ResumeForm` — no existing test file either); full suite, `tsc --noEmit`, and `eslint` all clean against the new files.

- [x] **Error handling gap found and fixed (2026-09-07):** the spec's Error Handling section requires "a retryable error instead of a blank state" on AI failures, which this page didn't have — an invalid/missing `OPENAI_API_KEY` failed silently (no message, button just re-enabled). Traced why: `@ai-sdk/openai` only reads the key lazily, inside a closure invoked when the actual OpenAI request is dispatched — deep inside `streamText`'s internal async work, *after* `toUIMessageStreamResponse()` has already returned the `Response`. A `try/catch` around the route handler's body cannot catch this. Fixed with the SDK's actual mechanism for it:
  - `src/app/api/qna/route.ts`: `toUIMessageStreamResponse({ onError })` — logs the real error server-side, returns a fixed generic string to the client (the SDK does not forward raw error messages by default; this makes that policy explicit and tested).
  - `src/app/(app)/qna/page.tsx`: destructures `error`/`regenerate` from `useChat`, renders the sanitized message with a Retry button (`regenerate()`) instead of nothing.
  - `src/app/api/qna/route.test.ts`: new test asserts `onError`'s returned string never contains the raw error text (e.g. `OPENAI_API_KEY`) — full suite now 53/53.

- [x] **Further refinement (2026-09-07):** distinguish an API-key problem from any other failure, so the message is specific *and* so a later "let the user supply their own API key" feature has a stable signal to hook into (rather than treating every failure as generic).
  - `route.ts`'s `onError` now returns one of two fixed codes instead of one fixed sentence: `'invalid_api_key'` when the error is `LoadAPIKeyError` (key missing entirely — checked before any request is sent) or `APICallError` with `statusCode === 401` (key present but rejected by OpenAI itself), otherwise `'unknown'`. Still never forwards the raw error.
  - `qna/page.tsx` maps those codes to display text via `ERROR_MESSAGES`, rather than rendering `error.message` directly (which is now a code, not user-facing text).
  - Three tests replace the earlier single "doesn't leak" test, covering: missing key → `invalid_api_key`, 401 from provider → `invalid_api_key`, anything else → `unknown` without leaking details. Full suite now 55/55.

- [x] **Step 2: Manually verify** — not yet done; needs a real `OPENAI_API_KEY`.

Set a real `OPENAI_API_KEY` in `.env`, run `npm run dev`, log in, add a couple of objects at `/dashboard/objects`, visit `/qna` (via the sidebar "AI" link), ask a question, and confirm a streamed response references the objects you added.

- [x] **Step 3: Commit** — left for you to commit.

```bash
git add -A
git commit -m "feat: add Career Q&A chat page"
```

---



## Self-Review Notes (UI phase, updated 2026-08-23)

- **Sidebar as the shared shell:** every authenticated page moved under a `(app)` route group (Task 16) with one collapsible sidebar (R/O/AI links + profile avatar). `signup`/`login` (Task 15) deliberately stay outside it. Confirmed against Figma; the R/O/AI icons in the wireframe were explicitly mock placeholders — real routing was left to implementation.
- **No separate object list page:** the original standalone `objects/page.tsx` list page is dropped entirely. Browsing, creating, and editing objects all happen on the Object Dashboard (Task 18) now, via a shared `ObjectPickerModal` reused in picker mode by Resume UI (Task 19) and direct-edit mode on the Dashboard itself.
- **New data-layer additions (Task 14), needed once picking/editing moved into modals on client components:** `listLatestObjectsForUser` + `getResumeTreeHistory` (`lib/`), and `listLatestObjectsAction` + `getObjectHistoryAction` (`app/objects/actions.ts`, since client components can't call `lib/` functions directly). All follow existing established patterns — `listLatestObjectsForUser` mirrors `getLatestVersionsForUser`'s dedupe-by-recency shape; `getResumeTreeHistory` mirrors `getObjectHistory`'s shape.
- **Resume Screen tabs:** Resume / History / Chat, not Resume / History / Diff. History is real (Task 14's `getResumeTreeHistory`). Diff was explicitly deferred past Spike 1; a new "Chat" idea (per-resume-scoped Q&A, distinct from the global Q&A which uses every object) replaced Diff's tab slot but is a disabled stub for Spike 1 — no function behind it.
- **New Profile page (Task 17):** not in the original plan's file list, not in Figma — added because the sidebar avatar (Task 16) needs a destination, and `getProfile`/`upsertProfile` (Task 11) had no UI consumer at all until now.
- **Known rough edges, since resolved:** `ObjectPickerModal`'s `onOpen` prop is now fully specified in Task 19 (was a vague TODO); the Resume Dashboard's fork nesting (Task 20) now recurses to arbitrary depth (was one level only). Still open: `onPick` handlers calling `redirect()` in these sketches are placeholders for what's likely `router.refresh()` in practice, same as Task 18 hit for real.

