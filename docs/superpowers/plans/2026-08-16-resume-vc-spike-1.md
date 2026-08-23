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
      queries.ts                  listObjectsForUser, getObjectHistory
      dashboard.ts                 getObjectDashboard (reverse "used in" lookup)

    resumes/
      versioning.ts                createResumeFromScratch, editResume, forkResume, isHeadVersion
      queries.ts                    getLatestVersionsForUser, getResumeVersionWithContent, getResumeForest

    profile.ts                      getProfile, upsertProfile

    ai/
      context.ts                    buildCareerContext (pure formatter: DB rows -> prompt text)

  app/
    signup/page.tsx                 Signup form
    login/page.tsx                  Login form
    api/auth/[...nextauth]/route.ts next-auth route handler

    objects/
      page.tsx                      Object list + create form
      [rootVersionId]/edit/page.tsx  Edit form (creates new version)
      actions.ts                    createObjectAction, editObjectAction

    resumes/
      new/page.tsx                  Create resume from scratch
      [id]/page.tsx                 View one resume version
      [id]/edit/page.tsx            Edit form (section/item picker)
      [id]/fork/page.tsx            Fork form, pre-filled from source (section/item picker)
      actions.ts                    createResumeAction, editResumeAction, forkResumeAction

    dashboard/
      resumes/page.tsx              Resume forest view
      objects/page.tsx              Object dashboard view

    api/qna/route.ts                Streaming Q&A endpoint
    qna/page.tsx                    Chat UI (useChat)

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

- [ ] **Step 1: Write the failing test**

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

  it('edit creates a new version in the same tree, pointing at the version it was edited from', async () => {
    const user = await makeUser();
    const original = await createResumeFromScratch(user.id, 'Original');
    const edited = await editResume(user.id, original.id, 'Renamed', []);

    expect(edited.rootVersionId).toBe(original.rootVersionId);
    expect(edited.parentVersionId).toBe(original.id);
  });

  it('editing a stale (non-head) version succeeds and becomes the new latest for its tree', async () => {
    const user = await makeUser();
    const v1 = await createResumeFromScratch(user.id, 'Original');
    const v2 = await editResume(user.id, v1.id, 'v2', []);
    const v3 = await editResume(user.id, v1.id, 'v3 from a stale version', []);

    expect(v3.rootVersionId).toBe(v1.rootVersionId);
    expect(v3.parentVersionId).toBe(v1.id);
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resumes/versioning.test.ts`
Expected: FAIL with "Cannot find module './versioning'"

- [ ] **Step 3: Write the implementation**

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
      parentVersionId: existing.id,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/resumes/versioning.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resumes/queries.test.ts`
Expected: FAIL with "Cannot find module './queries'"

- [ ] **Step 3: Write the implementation**

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
    const root = group.find((v) => v.id === rootVersionId)!;
    const forkedFromRootVersionId = root.parentVersionId
      ? idToRoot.get(root.parentVersionId) ?? null
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/resumes/queries.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/objects/dashboard.test.ts`
Expected: FAIL with "Cannot find module './dashboard'"

- [ ] **Step 3: Write the implementation**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/objects/dashboard.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/profile.test.ts`
Expected: FAIL with "Cannot find module './profile'"

- [ ] **Step 3: Write the implementation**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/profile.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/objects/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'"

- [ ] **Step 3: Write the implementation**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/objects/actions.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/resumes/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'"

- [ ] **Step 3: Write the implementation**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/resumes/actions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add resume server actions"
```

---

### Task 14: Auth UI (signup, login)

**Files:**
- Create: `src/app/signup/page.tsx`
- Create: `src/app/signup/actions.ts`
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `hashPassword` (`src/lib/password.ts`), `prisma`, `signIn` (`src/lib/auth.ts`)
- Produces: working `/signup` and `/login` pages.

- [ ] **Step 1: Write the signup action**

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

- [ ] **Step 2: Write the signup page**

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

- [ ] **Step 3: Write the login page**

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

- [ ] **Step 4: Manually verify**

Run: `npm run dev`, visit `http://localhost:3000/signup`, create an account, then log in at `/login`.
Expected: signup redirects to `/login`; login redirects to `/dashboard/resumes` (404 until Task 16 — that's fine for now).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add signup and login pages"
```

---

### Task 15: Object UI (list, create, edit)

**Files:**
- Create: `src/app/objects/page.tsx`
- Create: `src/app/objects/[rootVersionId]/edit/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUserId`, `listObjectsForUser`/`getObjectHistory`/`listTagsForUser` (`src/lib/objects/queries.ts`), `createObjectAction`/`editObjectAction` (`src/app/objects/actions.ts`)
- Produces: working `/objects` list+create page (`?type=` filters server-side via `listObjectsForUser`; `?tags=` filters the already-fetched list client-side) and `/objects/[rootVersionId]/edit` edit page.

- [ ] **Step 1: Write the list + create page**

```tsx
// src/app/objects/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { listObjectsForUser, listTagsForUser } from '@/lib/objects/queries';
import { createObjectAction } from './actions';
import Link from 'next/link';

function parseTags(raw: string) {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export default async function ObjectsPage({
  searchParams,
}: {
  searchParams: { type?: string; tags?: string };
}) {
  const userId = await getCurrentUserId();
  const [objects, allTags] = await Promise.all([
    listObjectsForUser(userId, searchParams.type as any),
    listTagsForUser(userId),
  ]);
  const activeTags = searchParams.tags ? parseTags(searchParams.tags) : [];
  const filtered =
    activeTags.length > 0
      ? objects.filter((o) => o.tags.some((t) => activeTags.includes(t)))
      : objects;

  return (
    <div>
      <h1>Objects</h1>

      <form>
        <label>
          Type:
          <select name="type" defaultValue={searchParams.type ?? ''}>
            <option value="">All</option>
            <option value="WORK_EXPERIENCE">Work Experience</option>
            <option value="EDUCATION">Education</option>
            <option value="SKILLS">Skills</option>
            <option value="SUMMARY">Summary</option>
            <option value="PROJECT">Project</option>
            <option value="CERTIFICATION">Certification</option>
            <option value="EXTRACURRICULAR">Extracurricular</option>
          </select>
        </label>
        <label>
          Filter by tags (comma-separated):
          <input name="tags" defaultValue={searchParams.tags ?? ''} list="known-tags" />
        </label>
        <datalist id="known-tags">
          {allTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="submit">Filter</button>
        <Link href="/objects">Clear</Link>
      </form>

      <ul>
        {filtered.map((o) => (
          <li key={o.id}>
            <Link href={`/objects/${o.rootVersionId}/edit`}>
              [{o.type}] {o.body.slice(0, 60)} (v{o.versionNumber})
            </Link>
            {o.tags.length > 0 && <span> — tags: {o.tags.join(', ')}</span>}
          </li>
        ))}
      </ul>

      <form
        action={async (formData) => {
          'use server';
          await createObjectAction(
            formData.get('type') as any,
            { category: formData.get('category') },
            String(formData.get('body')),
            parseTags(String(formData.get('tags') ?? ''))
          );
        }}
      >
        <select name="type" required>
          <option value="WORK_EXPERIENCE">Work Experience</option>
          <option value="EDUCATION">Education</option>
          <option value="SKILLS">Skills</option>
          <option value="SUMMARY">Summary</option>
          <option value="PROJECT">Project</option>
          <option value="CERTIFICATION">Certification</option>
          <option value="EXTRACURRICULAR">Extracurricular</option>
        </select>
        <input name="category" placeholder="Category (Skills only)" />
        <textarea name="body" placeholder="Markdown content" required />
        <input name="tags" placeholder="Tags, comma-separated (e.g. Backend, AI)" list="known-tags" />
        <button type="submit">Create</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write the edit page**

```tsx
// src/app/objects/[rootVersionId]/edit/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getObjectHistory } from '@/lib/objects/queries';
import { editObjectAction } from '../../actions';

function parseTags(raw: string) {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export default async function EditObjectPage({
  params,
}: {
  params: { rootVersionId: string };
}) {
  const userId = await getCurrentUserId();
  const history = await getObjectHistory(userId, params.rootVersionId);
  const latest = history[history.length - 1];

  return (
    <div>
      <h1>Edit {latest.type}</h1>
      <form
        action={async (formData) => {
          'use server';
          await editObjectAction(
            latest.id,
            latest.fields,
            String(formData.get('body')),
            parseTags(String(formData.get('tags') ?? ''))
          );
        }}
      >
        <textarea name="body" defaultValue={latest.body} required />
        <input name="tags" defaultValue={latest.tags.join(', ')} placeholder="Tags, comma-separated" />
        <button type="submit">Save new version</button>
      </form>

      <h2>History</h2>
      <ul>
        {history.map((v) => (
          <li key={v.id}>
            v{v.versionNumber}: {v.body.slice(0, 60)}
            {v.tags.length > 0 && <span> — tags: {v.tags.join(', ')}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, log in, visit `/objects`, create a Skills object tagged `Backend`, create a second tagged `Frontend`, filter by `Backend` and confirm only the first shows, then edit the first and confirm its tags persist on the new version.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add object list, create, and edit pages"
```

---

### Task 16: Resume UI (create, view, edit, fork)

**Files:**
- Create: `src/app/resumes/new/page.tsx`
- Create: `src/app/resumes/[id]/page.tsx`
- Create: `src/app/resumes/[id]/edit/page.tsx`
- Create: `src/app/resumes/[id]/fork/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUserId`, `getResumeVersionWithContent` (`src/lib/resumes/queries.ts`), `listObjectsForUser` (`src/lib/objects/queries.ts`), `createResumeAction`/`editResumeAction`/`forkResumeAction` (`src/app/resumes/actions.ts`)
- Produces: working `/resumes/new`, `/resumes/[id]`, `/resumes/[id]/edit`, `/resumes/[id]/fork` pages. `new`, `edit`, and `fork` are the same form shape (name + object checkboxes) — `new` starts empty, `edit`/`fork` read-and-pre-fill without writing, and every one of them writes exactly once, on submit.

- [ ] **Step 1: Write the create page**

```tsx
// src/app/resumes/new/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { listObjectsForUser } from '@/lib/objects/queries';
import { createResumeAction } from '../actions';
import { redirect } from 'next/navigation';

export default async function NewResumePage() {
  const userId = await getCurrentUserId();
  const objects = await listObjectsForUser(userId);

  return (
    <div>
      <h1>New resume</h1>
      <form
        action={async (formData) => {
          'use server';
          const selectedIds = formData.getAll('objectVersionId') as string[];
          const bySelected = objects.filter((o) => selectedIds.includes(o.id));
          // One section per type — a resume can't have two sections of the same type.
          const byType = new Map<string, typeof bySelected>();
          for (const o of bySelected) {
            const group = byType.get(o.type) ?? [];
            group.push(o);
            byType.set(o.type, group);
          }
          const sections = Array.from(byType.entries()).map(([sectionType, items], sectionIndex) => ({
            sectionType,
            order: sectionIndex,
            items: items.map((o, itemIndex) => ({ objectVersionId: o.id, order: itemIndex })),
          }));
          const { id } = await createResumeAction(String(formData.get('name')), sections);
          redirect(`/resumes/${id}`);
        }}
      >
        <input name="name" placeholder="Resume name" required />
        <fieldset>
          <legend>Include objects (latest version)</legend>
          {objects.map((o) => (
            <label key={o.rootVersionId}>
              <input type="checkbox" name="objectVersionId" value={o.id} />
              [{o.type}] {o.body.slice(0, 60)}
            </label>
          ))}
        </fieldset>
        <button type="submit">Create</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write the view page**

```tsx
// src/app/resumes/[id]/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import Link from 'next/link';

export default async function ViewResumePage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  const resume = await getResumeVersionWithContent(userId, params.id);

  return (
    <div>
      <h1>{resume.name}</h1>
      {resume.sections.map((section) => (
        <div key={section.id}>
          <h2>{section.sectionType}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item.id}>{item.objectVersion.body}</li>
            ))}
          </ul>
        </div>
      ))}

      <Link href={`/resumes/${resume.id}/edit`}>Edit</Link>
      <Link href={`/resumes/${resume.id}/fork`}>Fork</Link>
    </div>
  );
}
```

- [ ] **Step 3: Write the edit page**

```tsx
// src/app/resumes/[id]/edit/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { listObjectsForUser } from '@/lib/objects/queries';
import { editResumeAction } from '../../actions';
import { redirect } from 'next/navigation';

export default async function EditResumePage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  const resume = await getResumeVersionWithContent(userId, params.id);
  const objects = await listObjectsForUser(userId);

  return (
    <div>
      <h1>Edit {resume.name}</h1>
      <form
        action={async (formData) => {
          'use server';
          const selectedIds = formData.getAll('objectVersionId') as string[];
          const bySelected = objects.filter((o) => selectedIds.includes(o.id));
          // One section per type — a resume can't have two sections of the same type.
          const byType = new Map<string, typeof bySelected>();
          for (const o of bySelected) {
            const group = byType.get(o.type) ?? [];
            group.push(o);
            byType.set(o.type, group);
          }
          const sections = Array.from(byType.entries()).map(([sectionType, items], sectionIndex) => ({
            sectionType,
            order: sectionIndex,
            items: items.map((o, itemIndex) => ({ objectVersionId: o.id, order: itemIndex })),
          }));
          const { id } = await editResumeAction(resume.id, String(formData.get('name')), sections);
          redirect(`/resumes/${id}`);
        }}
      >
        <input name="name" defaultValue={resume.name} required />
        <fieldset>
          <legend>Include objects (latest version)</legend>
          {objects.map((o) => (
            <label key={o.rootVersionId}>
              <input
                type="checkbox"
                name="objectVersionId"
                value={o.id}
                defaultChecked={resume.sections.some((s) =>
                  s.items.some((it) => it.objectVersionId === o.id)
                )}
              />
              [{o.type}] {o.body.slice(0, 60)}
            </label>
          ))}
        </fieldset>
        <button type="submit">Save new version</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write the fork page**

Same shape as the edit page — reads and pre-fills from the *source* version, but writes nothing until submit, and calls `forkResumeAction` (not `editResumeAction`) with the source's id as `sourceVersionId`.

```tsx
// src/app/resumes/[id]/fork/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { listObjectsForUser } from '@/lib/objects/queries';
import { forkResumeAction } from '../../actions';
import { redirect } from 'next/navigation';

export default async function ForkResumePage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  const source = await getResumeVersionWithContent(userId, params.id);
  const objects = await listObjectsForUser(userId);

  return (
    <div>
      <h1>Fork {source.name}</h1>
      <form
        action={async (formData) => {
          'use server';
          const selectedIds = formData.getAll('objectVersionId') as string[];
          const bySelected = objects.filter((o) => selectedIds.includes(o.id));
          // One section per type — a resume can't have two sections of the same type.
          const byType = new Map<string, typeof bySelected>();
          for (const o of bySelected) {
            const group = byType.get(o.type) ?? [];
            group.push(o);
            byType.set(o.type, group);
          }
          const sections = Array.from(byType.entries()).map(([sectionType, items], sectionIndex) => ({
            sectionType,
            order: sectionIndex,
            items: items.map((o, itemIndex) => ({ objectVersionId: o.id, order: itemIndex })),
          }));
          const { id } = await forkResumeAction(source.id, String(formData.get('name')), sections);
          redirect(`/resumes/${id}`);
        }}
      >
        <input name="name" defaultValue={`Fork of ${source.name}`} required />
        <fieldset>
          <legend>Include objects (latest version)</legend>
          {objects.map((o) => (
            <label key={o.rootVersionId}>
              <input
                type="checkbox"
                name="objectVersionId"
                value={o.id}
                defaultChecked={source.sections.some((s) =>
                  s.items.some((it) => it.objectVersionId === o.id)
                )}
              />
              [{o.type}] {o.body.slice(0, 60)}
            </label>
          ))}
        </fieldset>
        <button type="submit">Save fork</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Manually verify**

Run: `npm run dev`. Create two objects at `/objects`, create a resume at `/resumes/new` with both objects included, view it, fork it, and confirm the fork page is pre-filled with the same objects checked; submit without changing anything and confirm the new fork's view page shows the same content and is a separate resume tree from the original.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add resume create, view, edit, and fork pages"
```

---

### Task 17: Dashboards UI

**Files:**
- Create: `src/app/dashboard/resumes/page.tsx`
- Create: `src/app/dashboard/objects/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUserId`, `getResumeForest` (`src/lib/resumes/queries.ts`), `getObjectDashboard` (`src/lib/objects/dashboard.ts`)
- Produces: working `/dashboard/resumes` and `/dashboard/objects` pages.

- [ ] **Step 1: Write the Resume Dashboard page**

```tsx
// src/app/dashboard/resumes/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeForest } from '@/lib/resumes/queries';
import Link from 'next/link';

export default async function ResumeDashboardPage() {
  const userId = await getCurrentUserId();
  const forest = await getResumeForest(userId);

  return (
    <div>
      <h1>Resumes</h1>
      <ul>
        {forest.map((tree) => (
          <li key={tree.rootVersionId}>
            <Link href={`/resumes/${tree.headVersionId}`}>{tree.name}</Link>
            {tree.forkedFromRootVersionId && (
              <span>
                {' '}
                (forked from{' '}
                {forest.find((t) => t.rootVersionId === tree.forkedFromRootVersionId)?.name})
              </span>
            )}
          </li>
        ))}
      </ul>
      <Link href="/resumes/new">+ New resume</Link>
    </div>
  );
}
```

- [ ] **Step 2: Write the Object Dashboard page**

```tsx
// src/app/dashboard/objects/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getObjectDashboard } from '@/lib/objects/dashboard';

export default async function ObjectDashboardPage() {
  const userId = await getCurrentUserId();
  const dashboard = await getObjectDashboard(userId);

  return (
    <div>
      <h1>Objects</h1>
      {dashboard.map((entry) => (
        <div key={entry.rootVersionId}>
          <h2>{entry.type}</h2>
          <ul>
            {entry.versions.map((v) => (
              <li key={v.id}>
                v{v.versionNumber}: {v.body.slice(0, 60)} — used in:{' '}
                {v.usedInResumeNames.length > 0 ? v.usedInResumeNames.join(', ') : 'none'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, visit `/dashboard/resumes` and confirm the forked resume shows a "forked from" note; visit `/dashboard/objects` and confirm an object used in a resume shows that resume's name under "used in", and its older versions show "none".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add resume and object dashboards"
```

---

### Task 18: AI context builder

**Files:**
- Create: `src/lib/ai/context.ts`
- Test: `src/lib/ai/context.test.ts`

**Interfaces:**
- Consumes: none (pure function)
- Produces: `buildCareerContext(objects: Array<{ type: string; body: string; fields: unknown }>, profile: { fullName: string; location: string } | null): string`

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/ai/context.test.ts`
Expected: FAIL with "Cannot find module './context'"

- [ ] **Step 3: Write the implementation**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/ai/context.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add career context builder for AI prompts"
```

---

### Task 19: Q&A streaming route handler

**Files:**
- Create: `src/app/api/qna/route.ts`
- Test: `src/app/api/qna/route.test.ts`
- Modify: `.env.example` (add `OPENAI_API_KEY`)

**Interfaces:**
- Consumes: `getCurrentUserId`, `listObjectsForUser` (`src/lib/objects/queries.ts`), `getProfile` (`src/lib/profile.ts`), `buildCareerContext` (`src/lib/ai/context.ts`), `streamText` from `ai`
- Produces: `POST` handler at `/api/qna` accepting `{ messages: CoreMessage[] }`, returning a streamed AI response.

- [ ] **Step 1: Write the failing test**

Mock `ai`'s `streamText` and the DB/session calls to assert the route assembles context correctly and calls `streamText` with it — no real OpenAI call.

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

const streamTextMock = vi.fn().mockReturnValue({ toDataStreamResponse: () => new Response('ok') });
vi.mock('ai', () => ({ streamText: streamTextMock }));
vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn().mockReturnValue('mock-model') }));

import { POST } from './route';

describe('POST /api/qna', () => {
  it('includes the career context as a system message', async () => {
    const request = new Request('http://localhost/api/qna', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'What role fits me?' }] }),
    });

    await POST(request);

    const call = streamTextMock.mock.calls[0][0];
    expect(call.system).toContain('Ada Lovelace');
    expect(call.system).toContain('Python');
    expect(call.messages).toEqual([{ role: 'user', content: 'What role fits me?' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/qna/route.test.ts`
Expected: FAIL with "Cannot find module './route'"

- [ ] **Step 3: Write the implementation**

```ts
// src/app/api/qna/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getCurrentUserId } from '@/lib/session';
import { listObjectsForUser } from '@/lib/objects/queries';
import { getProfile } from '@/lib/profile';
import { buildCareerContext } from '@/lib/ai/context';

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  const { messages } = await request.json();

  const [objects, profile] = await Promise.all([
    listObjectsForUser(userId),
    getProfile(userId),
  ]);

  const context = buildCareerContext(objects, profile);

  const result = streamText({
    model: openai('gpt-4o'),
    system: `You are a career advisor. Use the candidate's career context below to answer questions.\n\n${context}`,
    messages,
  });

  return result.toDataStreamResponse();
}
```

- [ ] **Step 4: Add OPENAI_API_KEY to .env.example**

```bash
echo 'OPENAI_API_KEY="sk-..."' >> .env.example
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/app/api/qna/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add streaming Q&A route handler"
```

---

### Task 20: Q&A chat UI

**Files:**
- Create: `src/app/qna/page.tsx`

**Interfaces:**
- Consumes: `useChat` from `ai/react`, `/api/qna` (Task 19)
- Produces: working `/qna` chat page.

- [ ] **Step 1: Write the chat page**

```tsx
// src/app/qna/page.tsx
'use client';

import { useChat } from 'ai/react';

export default function QnaPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({ api: '/api/qna' });

  return (
    <div>
      <h1>Career Q&A</h1>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <strong>{m.role}:</strong> {m.content}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} placeholder="Ask a career question..." />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Set a real `OPENAI_API_KEY` in `.env`, run `npm run dev`, log in, add a couple of objects at `/objects`, visit `/qna`, ask a question, and confirm a streamed response references the objects you added.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Career Q&A chat page"
```

---

## Self-Review Notes

- **Spec coverage:** create/edit/fork resume (Tasks 8, 13, 16), object versioning (Tasks 4, 12, 15), resume + object history views (Tasks 9, 15), Resume Dashboard + Object Dashboard (Tasks 9, 10, 17), Profile (Task 11), Career Q&A with full-context injection and no memory (Tasks 18–20), data-isolation ownership checks (every `versioning.ts`/`queries.ts`/`actions.ts` function), immutable inserts only (no `update` calls anywhere in the versioning modules), recency-based "latest version" tracking for both objects and resumes — edits may start from any existing version, not only the head (Task 4's `editObjectVersion`, Task 8's `editResume`/`isHeadVersion`), per-version freeform tags with filtering and autocomplete (Tasks 2, 4, 5, 10, 12, 15). JD-based optimization is intentionally deferred to a later spike, per your scoping decision.
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code.
- **Type consistency:** `SectionInput`/section shape (`sectionType`, `order`, `items: [{ objectVersionId, order }]`) is identical across Task 8 (`createResumeFromScratch`/`editResume`/`forkResume`), Task 13 (`createResumeAction`/`editResumeAction`/`forkResumeAction`), and Task 16 (new/edit/fork pages) — checked. `tags: string[]` (default `[]`) signature is consistent across Task 4 (`createObjectVersion`/`editObjectVersion`), Task 12 (`createObjectAction`/`editObjectAction`), and Task 15 (UI forms, via the shared `parseTags` helper) — checked.
- **`resume_version_item` → `resume_version_section` schema change:** items reference `resumeVersionId` directly (not `sectionId`); `resume_version_section` is `UNIQUE(resumeVersionId, sectionType)`, and item-to-section matching happens by `objectVersion.type` at read time in Task 9's `getResumeVersionWithContent`, not via a stored FK. Propagated through the Prisma schema, Task 8 (`editResume`/`forkResume`), Task 9 (`getResumeVersionWithContent`), Task 10 (`getObjectDashboard`), and Task 16's edit-page submit handler, which now groups selected objects by `type` into one section instead of one section per object — required by the new `UNIQUE` constraint.
- **Ownership-check test coverage:** `editResume`/`forkResume` (Task 8) and `editResumeAction`/`forkResumeAction` (Task 13) implemented the `ownerUserId` check but had no test exercising it — only `editObjectVersion` (Task 4) did. Added a "rejects ... owned by another user" test for each, matching Task 4's existing pattern.
- **Single-write Create/Fork:** `createResumeFromScratch` and `forkResume` no longer write eagerly and then get edited again — both now take a `sections` payload and write exactly once, matching `editResume`'s existing shape. `/resumes/new` and the new `/resumes/[id]/fork` pages are full pre-fillable forms (fork reads the source and pre-fills without writing), not a name-only stub followed by a second edit round trip. Propagated through Task 8 (`createResumeFromScratch`/`forkResume` signatures + tests), Task 13 (`createResumeAction`/`forkResumeAction` signatures + tests), and Task 16 (`/resumes/new` rewritten as a full form; view page's Fork button is now a `Link` to `/resumes/[id]/fork` instead of a form that writes immediately).
