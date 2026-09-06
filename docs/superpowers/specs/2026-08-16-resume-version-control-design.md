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

1. **No separate "identity" tables.** A `resumes` table and an `objects` table were considered and dropped — each version row carries its own identity via self-referencing id columns, collapsing "identity + history" into one table per concept.
2. **Objects have three identity levels; resumes have two.** An object (e.g. "my Google work experience") can have multiple **variations** — tailored rewrites for different scenarios (a backend-flavored write-up vs. a frontend-flavored one) — and each variation has its own **linear** edit history. Objects still never form a parent/child tree (neither across variations nor within one variation's history) — so `object_versions` needs `originVersionId` (never reassigned after the object's true creation — the anchor tying all variations of the same object together) *in addition to* `rootVersionId` (resets when a new variation is forked; scopes one variation's own linear edit history, same resetting rule as resume's `rootVersionId` resetting per tree). Resumes only fork at the tree level, so `resume_versions` needs `parentVersionId` (the fork lineage edge) on top of `rootVersionId` — no third id, since resumes don't have an object-like umbrella above the tree.

```mermaid
erDiagram
    USER ||--o| PROFILE : has
    USER ||--o{ OBJECT_VERSION : owns
    USER ||--o{ RESUME_VERSION : owns
    RESUME_VERSION ||--o{ RESUME_VERSION_SECTION : has
    RESUME_VERSION_SECTION ||--o{ SECTION_OBJECT : has
    SECTION_OBJECT }o--|| OBJECT_VERSION : references
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
        uuid originVersionId "self if this is a new object; the object this variation belongs to, never reassigned"
        uuid rootVersionId "self if this is a new variation (fork); root of this variation's own linear history"
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
        uuid parentVersionId "nullable; the version this tree was forked from — unchanged by edits within the tree"
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
    SECTION_OBJECT {
        uuid id
        uuid resumeVersionSectionId "the item's real, FK-enforced section membership — no more type-matching"
        uuid objectVersionId
        int order "UNIQUE with resumeVersionSectionId - no two items in one section share an order"
    }
```

**Key semantics:**

- **Terminology:** an **object** (e.g. "my Google work experience") is the conceptual umbrella, identified by `originVersionId` — never a table of its own. A **variation** is one tailored branch of an object (e.g. a backend-flavored write-up vs. a frontend-flavored one), identified by `rootVersionId`, with its own linear edit history. A **(historic) version** is one row within a variation's history, identified by `id`.
- **Editing a variation** creates a new `object_version` row: `rootVersionId` and `originVersionId` both unchanged (propagated), `versionNumber` = the variation's current highest plus one. Existing resumes keep pointing at whichever specific version they already reference.
- **Forking a new variation** (pre-filled from an existing variation's latest content) creates a new `object_version` row that starts a new variation: `rootVersionId` = itself (new), `originVersionId` = the source variation's `originVersionId` (propagated, not reset — so it always traces back to the object's true origin no matter how many variations deep), `versionNumber` = 1.
- The Object Dashboard groups by `originVersionId` (one card per object), with one sub-card per `rootVersionId` (variation) showing only its latest version — see Dashboards below.

| Entry point | `rootVersionId` | `originVersionId` | initial form content |
|---|---|---|---|
| **Create** (new object from scratch) | self (new variation) | self (new object) | empty |
| **Edit** (within a variation) | source version's `rootVersionId` (unchanged) | source version's `originVersionId` (unchanged) | pre-filled from the version being edited |
| **New Variation** (fork within an object) | self (new variation) | source variation's `originVersionId` (propagated) | pre-filled from the source variation's latest version |

- **Editing a resume** creates a new `resume_version` row: `rootVersionId` unchanged (same tree), `parentVersionId` unchanged (inherited from the version being edited — a tree's fork origin is fixed at fork time, editing never moves it). A tree's current/"latest" version is whichever version was most recently created.
- **Forking a resume** creates a new `resume_version` row that starts a **new tree**: `rootVersionId` = itself, `parentVersionId` = the source version (cross-tree pointer, for lineage display only — no merging back).
- **`section_object` references `resumeVersionSectionId` directly** — real FK-enforced section membership, not derived by matching the referenced object's `type` at render time (the earlier design; dropped because it let an item silently belong to no section if its type had no match, with no constraint to catch it). `resume_version_section` is keyed by `(resumeVersionId, sectionType)` (`UNIQUE`) and can exist with zero items. `section_object` has no direct `resumeVersionId` of its own — the resume it belongs to is only reachable through its section (one hop further than before; negligible at this app's scale, and every existing read already fetched section and item data together).
- **Write-time validation:** creating/editing/forking a resume rejects the write if any item's `objectVersion.type` doesn't match the `sectionType` of the section it's nested under — the FK makes the membership real, so a mismatch is now a representable (and therefore checked) state, where before it was structurally impossible.
- **`(resumeVersionSectionId, order)` is `UNIQUE`** on `section_object` — no two items in the same section can share an order value.
- **`fields` is JSONB**, validated at the application layer by a Zod schema per `type`. Every query pattern in this app fetches by ID or by `ownerUserId`; nothing filters on values inside `fields`, so a GIN/expression index can be added later if that changes.
- **Profile** (name/email/phone/location/links, shown in a resume's header) is a single live, unversioned row per user — resumes always render the current profile.
- **Tags** are freeform strings on `object_versions`, scoped per version — a lightweight label independent of the object/variation/version structure above (e.g. tagging a variation's latest version `Backend`). The object list page fetches every version for a user (`type` is the server-side filter) and applies tag filtering client-side. Existing tags are surfaced as autocomplete suggestions to reduce accidental duplicates (`Backend` vs `backend`).

## Core Flows

**Writing a resume version** — Create, Edit, and Fork are the same underlying write: one `resume_versions` insert + a `resume_version_sections`/`section_objects` insert, made only when the user submits — not when they click Create/Edit/Fork.

**Editing or creating an object's content while authoring a resume is staged, not written.** Inside the resume form, adding a new object or editing an item's content only updates local form state (fields/body/tags) — no `object_versions` row exists yet. Only when the user clicks the resume's own Save does the app resolve every staged object change into a real `object_versions` insert (`createObjectVersion`/`editObjectVersion`), *then* insert the `resume_versions`/`resume_version_sections`/`section_objects` row referencing the now-real object version ids. These are two sequential phases, not one transaction (see "Error Handling" below) — but neither runs until the user submits, so navigating away from an in-progress resume edit leaves no trace in `object_versions`. This staging behavior is specific to editing objects *through* the resume form; the standalone Object Dashboard (see Dashboards below) still writes each object edit/fork immediately, since there's no larger "submit" to batch into there.

```mermaid
sequenceDiagram
    participant U as User
    participant App as Next.js (client state + Server Action)
    participant DB as Postgres

    opt Edit or Fork
        U->>App: Click Edit / Fork
        App->>DB: SELECT current/source version + content
        App-->>U: Edit form, pre-filled
    end

    opt Stage object changes (any number of times, no DB write yet)
        U->>App: Add object / edit item content
        App-->>U: Chip updates from local draft state only
    end

    U->>App: Click Save
    App->>DB: INSERT object_versions for every staged draft (create or edit, resolved to real ids)
    App->>DB: INSERT resume_versions (rootVersionId, parentVersionId)
    App->>DB: INSERT resume_version_sections + section_objects (referencing the resolved ids)
    DB-->>App: new resume_version.id
    App-->>U: Redirect to the new version's view page
```

| Entry point | `rootVersionId` | `parentVersionId` | initial form content |
|---|---|---|---|
| **Create** | self (new tree) | `null` | empty |
| **Edit** | source version's `rootVersionId` (same tree) | source version's `parentVersionId` (unchanged) | pre-filled from the version being edited |
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
- **Object Dashboard:** groups `object_versions` by `originVersionId` — one card per object. Within it, one sub-card per `rootVersionId` (variation), showing only that variation's latest version, each with **Edit** (new historic version, same `rootVersionId`) and **New Variation** (fork, new `rootVersionId`, same `originVersionId`) actions. Clicking a variation sub-card opens a detail popup with that variation's full history (every version under its `rootVersionId`, oldest-to-newest) and the list of resumes using it — joining `section_object → resume_version_section → resume_version` across every version sharing that `rootVersionId`, not just the latest. (Tag filtering is client-side on the object list page, not a query concern here.)

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
- **Concurrent saves:** every save is an immutable insert, never an update, so two edits started from the same version simply produce two diverging versions — there's no conflict to detect or lock against; this falls out of the data model.
- **Field validation:** each object `type`'s Zod schema validates `fields` on write, rejecting malformed data before persistence.
- **Resume submit is two sequential phases, not one transaction:** resolving staged object drafts (`object_versions` inserts) happens first, then the `resume_versions`/`sections`/`items` insert (itself already atomic as one nested Prisma write). No `$transaction` wraps the two phases together. If an object draft fails validation, submission stops there and the resume is never written — surfaced as an error on that specific item, not a whole-form error. If a later phase fails after some object drafts already resolved, those object versions remain as real, valid, unused rows — not a broken state, since an `object_version` existing without any resume referencing it is already normal (identical to one created directly via the Object Dashboard). Full atomicity was considered and rejected: the data model has no invariant that requires it, and it would require threading a shared Prisma transaction handle across `objects/versioning.ts` and `resumes/versioning.ts`.

## Testing Approach

Implementation follows TDD. Priority coverage: versioning correctness (`rootVersionId`/`parentVersionId` set correctly on edit vs. fork for resumes; `rootVersionId`/`originVersionId` set correctly on edit vs. new-variation fork for objects), an ownership-check test per mutation (user A cannot read/write user B's rows), and a schema-validation test for the AI structured output. AI response *quality* is checked manually, since LLM output isn't deterministic.
