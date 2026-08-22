# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An AI-supported full-stack web app: a **resume version controller**. Resumes are built from reusable, **object-based** resume components (work experience, education, skills, etc. — each with structured fields plus a Markdown body), and the app manages **versions and forks** of both individual objects and whole resumes, similar in spirit to git but scoped to this domain rather than a general file tree.

Mentorship roadmap: **L1** CRUD app → **L2** basic AI (no memory/tools) → **L3** deployment → **L4** AI agent layer. Currently scoped to **Spike 1** = full L1 + Career Q&A only from L2 (JD-based optimization deferred to a later spike).

## Status

Design complete for Spike 1; no code, package manifest, or tooling has been added yet.

- **Spec:** `docs/superpowers/specs/2026-08-16-resume-version-control-design.md` — data model, architecture, AI feature design (covers full L1 + L2 scope).
- **Plan:** `docs/superpowers/plans/2026-08-16-resume-vc-spike-1.md` — implementation plan for Spike 1, not yet executed.
- **Stack (decided):** Next.js + TypeScript; Postgres + Prisma; Auth.js (Credentials provider, JWT sessions); OpenAI via the Vercel AI SDK.

Once code exists, update this file with:
- Actual build/lint/test/dev commands (from `package.json` scripts)
- Confirmation that the implemented versioning/branching data model matches the spec (or a note on any deviation) — this is the core domain logic and will need multiple files to understand, so it belongs here once implemented
- Where the AI-assist features hook into the resume editing/versioning flow

## General principles

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
