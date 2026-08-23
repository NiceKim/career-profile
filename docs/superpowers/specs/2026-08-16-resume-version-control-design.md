# Resume Version Control — Design (L1 + L2)

## Status

Design approved by user, covering the first sub-project of the mentorship roadmap:

- **L1 (CRUD App):** object-based resume/version-control system, dashboards.
- **L2 (Basic AI, no memory/tools):** AI Career Q&A + JD-based resume selection & optimization.

Out of scope for this spec: **L3** (deployment) and **L4** (AI agent layer — memory/tools), and the "nice to have" features (PDF/Word export/import, text-based editor).

## Problem & Users

Job seekers who apply to multiple roles end up maintaining duplicated, hand-edited copies of their resume, and struggle to tell which experiences/content to highlight for a given job description. This app manages resumes as **reusable, versioned resume objects** (git-like version control, scoped to a single document type) and adds AI assistance for career advice and JD-based tailoring.

## User Stories (from requirements)

**Resume version control:** create an object-based resume from scratch; edit an existing resume and create a new version; fork an existing resume into a separate version; view a resume and its version history; visualize all resumes and their version/fork relationships.

**Object version control:** view resume objects and their version history.

**AI features:** receive AI-powered career advice based on career context; provide a job description and have AI select the most relevant resume and recommend how to optimize it.

## Architecture

Single deployable Next.js app — no separate backend service.

```mermaid
flowchart LR
    Browser -->|HTTPS| NextApp["Next.js App\n(Server Actions / Route Handlers)"]
    NextApp -->|Prisma| DB[(Postgres)]
    NextApp -->|Auth.js| DB
    NextApp -->|Vercel AI SDK| OpenAI["OpenAI API"]
```

- **Frontend/backend:** Next.js + TypeScript. Server Actions handle versioning writes (create/edit/fork). Route Handlers serve the AI endpoints (needed for streaming the Q&A chat).
- **Database:** Postgres via Prisma.
- **Auth:** Auth.js (Credentials provider, JWT sessions), scoping all data to `ownerUserId`.
- **AI:** OpenAI API via the Vercel AI SDK (`streamText` for Q&A, `generateObject` for JD optimization's structured output).

## Data Model

Two decisions shape this model, both applied consistently:

1. **No separate "identity" tables.** A `resumes` table and an `objects` table were considered and dropped — each version row carries its own identity via a self-referencing `rootVersionId`, collapsing "identity + history" into one table per concept.
2. **Object versioning is linear; resume versioning is a tree.** Objects only ever get new versions (edits) under the same `rootVersionId` — no forking at the object level. Resumes fork, so `resume_versions` also needs `parentVersionId` to capture the edit/fork lineage edge, on top of `rootVersionId` for "which resume/tree this belongs to."

```mermaid
erDiagram
    USER ||--o| PROFILE : has
    USER ||--o{ OBJECT_VERSION : owns
    USER ||--o{ RESUME_VERSION : owns
    RESUME_VERSION ||--o{ RESUME_VERSION_SECTION : has
    RESUME_VERSION ||--o{ RESUME_VERSION_ITEM : has
    RESUME_VERSION_ITEM }o--|| OBJECT_VERSION : references
    RESUME_VERSION ||--o{ RESUME_VERSION : parentVersionId

    USER {
        uuid id
        string email
        string passwordHash
        timestamp createdAt
    }
    PROFILE {
        uuid id
        uuid userId
        string fullName
        string email
        string phone
        string location
        jsonb links "LinkedIn/portfolio/GitHub etc."
    }
    OBJECT_VERSION {
        uuid id
        uuid rootVersionId "self if this row is the first version"
        uuid ownerUserId
        enum type "WorkExperience|Education|Skills|Summary|Project|Certification|Extracurricular"
        int versionNumber
        jsonb fields "type-specific, validated by a Zod schema per type"
        text body "markdown"
        string[] tags "freeform, e.g. Backend/Frontend/AI"
        timestamp createdAt
    }
    RESUME_VERSION {
        uuid id
        uuid rootVersionId "self if this is a new resume (incl. forks)"
        uuid parentVersionId "nullable; edit-from or forked-from version"
        uuid ownerUserId
        string name
        timestamp createdAt
    }
    RESUME_VERSION_SECTION {
        uuid id
        uuid resumeVersionId
        enum sectionType "UNIQUE with resumeVersionId - one section per type per resume"
        int order
    }
    RESUME_VERSION_ITEM {
        uuid id
        uuid resumeVersionId
        uuid objectVersionId
        int order
    }
```

**Key semantics:**

- **Editing an object** creates a new `object_version` row: `rootVersionId` unchanged, `versionNumber` = the tree's current highest plus one. Existing resumes keep pointing at whichever object version they already reference. The Object Dashboard lists every version of an object, so every variation stays visible.
- **Editing a resume** creates a new `resume_version` row: `rootVersionId` unchanged (same tree), `parentVersionId` = the version edited from. A tree's current/"latest" version is whichever version was most recently created.
- **Forking a resume** creates a new `resume_version` row that starts a **new tree**: `rootVersionId` = itself, `parentVersionId` = the source version (cross-tree pointer, for lineage display only — no merging back).
- **`resume_version_item` references `resumeVersionId` directly.** `resume_version_section` is keyed by `(resumeVersionId, sectionType)` (`UNIQUE`); an item's section is its object's `type`, matched at render time. `resume_version_section` holds per-section `order` and can exist with zero items.
- **`fields` is JSONB**, validated at the application layer by a Zod schema per `type`. Every query pattern in this app fetches by ID or by `ownerUserId`; nothing filters on values inside `fields`, so a GIN/expression index can be added later if that changes.
- **Profile** (name/email/phone/location/links, shown in a resume's header) is a single live, unversioned row per user — resumes always render the current profile.
- **Tags** are freeform strings on `object_versions`, scoped per version — different versions of the same object can represent differently-targeted variations (e.g. one phrasing tagged `Backend`, a rewritten phrasing tagged `Frontend`). The object list page fetches every version for a user (`type` is the server-side filter) and applies tag filtering client-side. Existing tags are surfaced as autocomplete suggestions to reduce accidental duplicates (`Backend` vs `backend`).

## Core Flows

**Writing a resume version** — Create, Edit, and Fork are the same underlying write: one `resume_versions` insert + a `resume_version_sections`/`resume_version_items` insert, made only when the user submits — not when they click Create/Edit/Fork. Editing an object's content along the way is a fully separate write that never touches `resume_versions` — existing resumes keep pointing at whichever object version they already reference until the user's resume edit picks up the newer one:

```mermaid
sequenceDiagram
    participant U as User
    participant App as Next.js Server Action
    participant DB as Postgres

    opt Edit or Fork
        U->>App: Click Edit / Fork
        App->>DB: SELECT current/source version + content
        App-->>U: Edit form, pre-filled
    end

    opt Update Objects
        U->>App: Edit object content, click Save
        App->>DB: INSERT object_versions (rootVersionId unchanged, versionNumber+1)
        App-->>U: Now viewing new object version
    end

    U->>App: Click Save
    App->>DB: INSERT resume_versions (rootVersionId, parentVersionId)
    App->>DB: INSERT resume_version_sections + resume_version_items
    DB-->>App: new resume_version.id
    App-->>U: Redirect to the new version's view page
```

| Entry point | `rootVersionId` | `parentVersionId` | initial form content |
|---|---|---|---|
| **Create** | self (new tree) | `null` | empty |
| **Edit** | source version's `rootVersionId` (same tree) | source version's `id` | pre-filled from the version being edited |
| **Fork** | self (new tree) | source version's `id` | pre-filled from the source version |

**AI Career Q&A** (streaming, "career context" = every version of every one of the user's objects):

```mermaid
sequenceDiagram
    participant U as User
    participant App as Route Handler
    participant DB as Postgres
    participant AI as OpenAI (Vercel AI SDK)

    U->>App: Ask question
    App->>DB: SELECT all object_versions WHERE ownerUserId (+ Profile)
    App->>AI: streamText(context + question)
    AI-->>App: token stream
    App-->>U: streamed response
```

**JD-based Selection & Optimization** (single structured-output call — see "AI Feature Details" for why):

```mermaid
sequenceDiagram
    participant U as User
    participant App as Route Handler
    participant DB as Postgres
    participant AI as OpenAI (Vercel AI SDK)

    U->>App: Paste job description
    App->>DB: SELECT latest resume_version per tree (all resumes)
    App->>DB: SELECT all object_versions WHERE ownerUserId
    App->>AI: generateObject(JD + resumes + objects, schema)
    AI-->>App: {jdRequirements, selectedResumeId, reasoning, recommendations}
    App-->>U: Show selected resume + recommendations
```

**Dashboards** (plain reads, no AI, no sequence diagram needed):

- **Resume Dashboard:** groups `resume_versions` by `rootVersionId` to list distinct resumes; draws fork arrows by following `parentVersionId` links that cross into a different `rootVersionId`.
- **Object Dashboard:** groups `object_versions` by `rootVersionId`; for each version, joins `resume_version_item → resume_version` (via `resumeVersionId`) to show which resume(s) currently use it. (Tag filtering is client-side on the object list page, not a query concern here.)

## AI Feature Details

**Career Q&A:** no memory across sessions (per the L2 "no memory, no tool" scope) — each question is a fresh call with the user's full object set as context.

**JD-based Selection & Optimization:**

- Compares the JD against the **latest version of each resume tree** (not every historical version).
- The AI is given **all** of the user's object versions, not just the ones currently used in resumes, so it can recommend swapping in a different existing variation (e.g. "use your other phrasing of the Google role").
- Output is **advice only** — the AI never auto-creates a new resume version; the user applies suggested changes manually, which then goes through the normal edit flow above.
- **No embeddings/vector search.** A user's object/resume corpus (tens to low hundreds of items) fits comfortably in an LLM context window, so there's no retrieval-filtering problem to solve. Full-context reasoning is also more accurate here than embedding similarity would be: embedding distance is a single fuzzy topical-similarity score (can't reliably distinguish "5 years Python" from "5 years Java" the way a JD requirement needs to), whereas the LLM reading full text can check specific requirements directly and explain its reasoning. Embeddings become worth it only if the corpus grows too large to fit in context — not the case here.
- **Single call, not two.** One `generateObject` call with a schema (`{ jdRequirements, selectedResumeId, reasoning, recommendations }`) does JD analysis and matching together — the schema forces the JD-requirements breakdown to be part of the output, so there's no need for a separate extraction call. A two-call pipeline (extract requirements, then match) would only pay off if the JD analysis needed to be cached/reused independently, which isn't a current requirement; that kind of multi-step pipeline is better suited to L4 (agent layer) work.

## Error Handling

- **Data isolation is the one trust boundary that's never simplified away:** every query/mutation filters by the authenticated session's `ownerUserId` — a client-supplied resume/object ID is always checked for ownership before use.
- **AI calls:** `streamText`/`generateObject` wrapped in try/catch; on failure/timeout, show a retryable error instead of a blank state. `generateObject`'s Zod schema validation catches malformed structured output from the model (the Vercel AI SDK retries automatically on schema mismatch).
- **Empty states:** Career Q&A and JD optimization both need a friendly message when the user has zero objects/resumes yet, instead of calling the AI with empty context.
- **Concurrent saves:** every save is an immutable insert, never an update, so two edits from the same `parentVersionId` simply produce two diverging versions — there's no conflict to detect or lock against; this falls out of the data model.
- **Field validation:** each object `type`'s Zod schema validates `fields` on write, rejecting malformed data before persistence.

## Testing Approach

Implementation follows TDD. Priority coverage: versioning correctness (`rootVersionId`/`parentVersionId` set correctly on edit vs. fork), an ownership-check test per mutation (user A cannot read/write user B's rows), and a schema-validation test for the AI structured output. AI response *quality* is checked manually, since LLM output isn't deterministic.
