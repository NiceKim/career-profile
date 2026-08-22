# Resume Version Control — Project Plan

Personal/mentor-facing tracker. **Levels (L1-L4)** define scope/requirements only — they're the mentorship's conceptual phases. **Spikes** are the actual execution plan: each groups work across levels into a shippable chunk, and carries the user stories, acceptance criteria, and tasks. For technical design detail, see the spec and implementation plan linked under each spike.

## Levels — Requirements

### L1 — CRUD App (object-based resume version control)

- Users authenticate (signup/login) and see only their own data.
- A resume is composed of reusable **objects** (Work Experience, Education, Skills, Summary, Project, Certification, Extracurricular), each with structured fields + a Markdown body, optionally tagged (freeform, e.g. `Backend`/`Frontend`/`AI`).
- Editing an object or a resume creates a new immutable version — never overwrites history.
- Forking a resume creates a new, independent resume that remembers its source (no merge-back).
- A resume's header (name/contact info) reflects the user's live Profile, not a version snapshot.
- Users can view version history for both resumes and individual objects.
- Users can see all their resumes and how they relate (forks), and all their objects and which resumes currently use each version.

### L2 — Basic AI Features (no memory, no tools)

- Career Q&A: answers are grounded in the user's full object set (all resume content), sent fresh each question — no session memory.
- No embeddings/vector search — full-context prompting (justified in the spec: per-user data volume is small enough to fit in context, and full-context reasoning is more accurate here than embedding similarity).

### L3 — Deployment

Start small (MVP deployment), upgrade to the heavier production pattern later as a stretch goal — not built upfront speculatively.

- Deploy on **AWS**, MVP baseline: **App Runner** (build/deploy directly from the repo, managed scaling and HTTPS — no VPC/load-balancer setup needed at this stage).
- Database: managed **RDS Postgres**, single small instance, replacing local Postgres.
- Secrets (`DATABASE_URL`, `AUTH_SECRET`, `OPENAI_API_KEY`) live in **AWS Secrets Manager**, never in plaintext env files in the deployed environment — this stays non-negotiable at MVP size, it's a security baseline, not a scaling concern.
- Basic **CI/CD**: App Runner's native GitHub integration — deploy on merge to main, no separate build pipeline to hand-roll yet.
- Domain + TLS: App Runner provides a managed HTTPS URL by default; custom domain via Route53 + ACM only if/when needed.
- Basic observability: CloudWatch logs for the service; alarms are a stretch goal, not required.
- **Good to have (upgrade path, not required for MVP):** migrate to the standard "real production" pattern — containerized app on **ECS Fargate** behind an **Application Load Balancer**, in a **VPC** with public/private subnets, with an autoscaling policy — for more control as usage grows. Further stretch beyond that: RDS read replicas, a caching layer (ElastiCache/Redis), CDN (CloudFront) for static assets. Reach for these only if real load demands them.

### L4 — AI Agent Layer

Not yet designed in detail, but two concrete features are now identified:

- **JD-based optimization, agentic form:** given a job description, the AI uses tool calls to select the best-matching resume among the user's resumes and **directly apply** the recommended changes — superseding L2's original "advice only" scope. Open design questions for the L4 brainstorming session: what tools does the agent get (list resumes, get object versions, update a resume section)? Do AI-applied edits go through the same immutable-versioning path as manual edits, so they stay reversible/auditable like every other change? What guards against a bad AI edit corrupting a resume?
- **Career Q&A becomes a full chatbot:** persistent conversation memory (remembers previous chats across sessions, not just within one exchange), grounded in the user's whole career context (all career objects, same grounding as the L2 version), with guardrails on what the AI can say and do. Guardrail specifics: not yet defined.

---

## Spikes

| Spike | Covers | Design status |
|---|---|---|
| **Spike 1** | Full L1 + Career Q&A (L2) | Fully spec'd + planned |
| **Spike 2** | Production deployment (L3) + start of L4 (memory/tool-use infra) | L3 basic overview written; L4 undesigned |
| **Spike 3** | Continue L4: JD-based optimization as an agentic (tool-calling) flow, and Career Q&A upgraded to a memory-backed chatbot | Undesigned |

### Spike 1 — CRUD + Career Q&A

**Docs:** [Spec](superpowers/specs/2026-08-16-resume-version-control-design.md) · [Plan](superpowers/plans/2026-08-16-resume-vc-spike-1.md)

**User Stories**
- As a user, I want to create an object-based resume from scratch.
- As a user, I want to edit an existing resume and create a new version.
- As a user, I want to fork an existing resume to create a separate version.
- As a user, I want to view a resume and its version history.
- As a user, I want to visualize all my resumes and their version and fork relationships.
- As a user, I want to view my resume objects and their version history.
- As a user, I want to tag objects and filter by tag.
- As a user, I want to receive AI-powered career advice based on my career context.

**Acceptance Criteria**
- [ ] Editing an object creates a new `object_version` row (`rootVersionId` unchanged, `versionNumber` incremented) and never touches `resume_version_item` — existing resumes keep referencing whichever object version they already point to; the new version only shows up on a resume once that resume is itself edited to pick it up.
- [ ] Editing sets the new version's `rootVersionId` to the original's `rootVersionId` (same tree) and `parentVersionId` to the version edited from. Only the current head version can be edited from — editing a stale version is rejected, not because a stale version can't produce a new version at all, but because that's what forking (below) is for.
- [ ] Forking sets the new resume's `rootVersionId` to itself and `parentVersionId` to the source version.
- [ ] Every query/mutation is scoped to the authenticated user — no cross-user data access.
- [ ] Object Dashboard shows, per object, every version and which resume(s) currently use it.
- [ ] Resume Dashboard shows every resume and draws a fork edge back to its source resume, where applicable.
- [ ] Career Q&A responses are visibly grounded in the user's actual object content (not generic advice).

**Tasks** (ordered to match the implementation plan's actual build phases)

*Foundation*
- [ ] Project scaffold (Next.js, TypeScript, Vitest)
- [ ] Data model: Prisma schema + migration (User, Profile, ObjectVersion, ResumeVersion, sections, items)

*Object + Auth backend*
- [ ] Object versioning: create/edit logic, per-type Zod field validation, tags
- [ ] Object queries: list, history, tag filter, tag autocomplete
- [ ] Auth: Auth.js config + password hashing (Credentials provider)

*Resume backend*
- [ ] Resume versioning: create/edit/fork logic, head-only-edit enforcement
- [ ] Resume queries: latest-per-tree, full content, fork forest
- [ ] Object Dashboard query (reverse "used in" lookup)
- [ ] Profile: get/update header info

*UI*
- [ ] Auth UI: signup/login pages
- [ ] Object UI: create/edit/list pages
- [ ] Resume UI: create/edit/view pages, fork page
- [ ] Dashboards UI: resume + object dashboards

*AI*
- [ ] Career context builder (objects + profile → prompt text)
- [ ] Streaming Q&A route handler (Vercel AI SDK)
- [ ] Chat UI

### Spike 2 — Production Deployment + Start Agentic AI

**Docs:** L3 basic overview is in the Levels section above. No detailed deployment spec or L4-kickoff docs yet.

**User Stories**
- As a user, I want to access the app on a live, publicly available URL.
- As a developer, I want a CI/CD pipeline so pushing to main deploys automatically.
- As a developer, I want the AI agent's memory and tool-calling infrastructure in place so Spike 3's features can build on it.

**Tasks**
- [ ] Deploy MVP to AWS (App Runner, RDS Postgres, Secrets Manager)
- [ ] Set up CI/CD (GitHub → App Runner auto-deploy)
- [ ] Scaffold AI agent infrastructure: conversation memory storage, tool-calling setup

### Spike 3 — Agentic JD Optimization + Memory-Backed Career Chatbot

**Docs:** none yet — requirements captured below are from conversation, not a written spec.

**User Stories**
- As a user, I want the AI to analyze a job description, select my best-matching resume, and directly apply the optimizations to it, so I don't have to make the edits myself.
- As a user, I want an ongoing conversation with an AI career advisor that remembers our previous discussions and has my full career context available.

**Tasks**
- [ ] Build agentic JD optimization: tool calls to select the best-matching resume and directly apply changes
- [ ] Upgrade Career Q&A to a memory-backed chatbot with guardrails
