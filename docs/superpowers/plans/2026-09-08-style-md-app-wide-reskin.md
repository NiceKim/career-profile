# STYLE.md App-Wide Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's temporary plain-CSS look (cream/black/orange, Patrick Hand font, unlayered global CSS) with the STYLE.md design system already validated on the landing page (`src/app/page.tsx`), across every remaining page: login, signup, AppShell/Sidebar, profile, Q&A, objects dashboard, and resumes.

**Architecture:** Build a small shadcn-style `src/components/ui/` primitive layer (Button, Input, Textarea, Label, Card, Dialog, Badge) on top of the tokens already proven on the landing page, then migrate each page in stages, swapping raw HTML elements for these primitives and Tailwind utility classes. No data model, server action, or routing changes — this is a markup/styling pass only. Each stage ends with a build+lint+screenshot check before moving to the next.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4 (already installed) + `@base-ui/react` (headless components) + `class-variance-authority` + `clsx` + `tailwind-merge` + `lucide-react` (already installed).

**Spec:** `STYLE.md` (design system) + the reference implementation at `src/app/page.tsx` (landing page, already built and approved) + the in-chat design approved 2026-09-08 (staged rollout, "reskin + light UX polish", shadcn components, stage-by-stage checkpoints).

## Global Constraints

- **No `primary`/`secondary`/`destructive` CSS tokens.** STYLE.md's "Primary CTA" is a literal brand green (`#2da44e` / hover `#278a43`), not a semantic token — bake it into the `Button` component's `primary` variant directly. There is no destructive/delete UI in the app yet (see project memory: deletion is undeferred/undesigned) — do not add a `destructive` variant or token; add it when a delete action actually ships.
- **Token set is exactly:** `background`, `foreground`, `card`, `card-foreground`, `muted`, `muted-foreground`, `border`, `ring` (light + dark, in `src/app/globals.css`). This is what STYLE.md's own "Color system" section names, plus `card-foreground` (dark-mode contrast on `bg-card`) and `ring` (STYLE.md mandates visible focus states).
- **No behavior changes.** Every task is markup/className changes only. Server actions, data fetching, routing, and component props/state logic are untouched unless a task says otherwise.
- **Verification per task** (no unit tests for pure markup/CSS — there is no existing convention of testing presentational components in this repo, see `src/lib/*.test.ts` for what *is* tested): `npm run build` compiles clean (same pre-existing 4 test-file TS errors are fine, nothing new), `npx eslint <changed files>` is clean, and a Chrome screenshot of the page confirms it visually matches STYLE.md's patterns (tokens applied, spacing correct, no legacy element defaults bleeding through — see Task 1's cascade-layer note).
- **Cascade-layer gotcha (already hit once on the landing page's theme toggle):** until Task 9 deletes the legacy CSS, `h1`, `h2`, `nav`, `button`, `input`, `a`, `dialog`, and `* { padding: 0; margin: 0 }` are still live in `@layer base` in `globals.css`. Any raw HTML element a migrated page still uses (not yet wrapped in a `ui/` primitive) silently inherits those legacy rules unless the page's own Tailwind classes explicitly override every property the legacy rule sets (padding, border, background, border-radius, align-self, margin, font-size). The `ui/` primitives from Task 2 already do this for the properties they own — just don't leave a bare `<button>`/`<input>`/`<h1>` unstyled on a migrated page.
- **Body padding.** Task 1 removes the global `body { padding: 1.5rem }`. `AppShell`'s `<main>` (Task 4) and the landing page (Task 1) each become responsible for their own padding.

---

## File Structure

New files:
- `src/lib/utils.ts` — `cn()` class-merging helper.
- `components.json` — shadcn CLI metadata (aliases only; no CLI codegen used, primitives are hand-written to match STYLE.md exactly).
- `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `card.tsx`, `dialog.tsx`, `badge.tsx` — the primitive layer.

Modified files (by stage): `package.json`, `src/app/globals.css`, `src/app/page.tsx` (Task 1) · `src/app/login/page.tsx`, `src/app/signup/page.tsx` (Task 3) · `src/components/AppShell.tsx`, `src/components/Sidebar.tsx` (delete `Sidebar.module.css`) (Task 4) · `src/app/(app)/profile/page.tsx`, `src/app/(app)/profile/LogoutButton.tsx`, `src/app/(app)/qna/page.tsx` (Task 5) · `src/components/ObjectVersionChip.tsx` (delete `.module.css`), `src/components/ObjectPickerModal.tsx` (delete `.module.css`), `src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx` (delete `.module.css`) (Task 6) · `src/app/(app)/dashboard/resumes/page.tsx` (delete `.module.css`), `src/app/(app)/resumes/ResumeForm.tsx` (delete `.module.css`) (Task 7) · `src/app/(app)/resumes/[id]/page.tsx` (delete `ResumeView.module.css`), `src/app/(app)/resumes/[id]/HistoryTab.tsx` (Task 8) · `src/app/globals.css` again (Task 9, deletion).

---

### Task 1: Global tokens, legacy CSS cleanup, landing page simplification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: CSS custom properties `--background`, `--foreground`, `--card`, `--card-foreground`, `--muted`, `--muted-foreground`, `--border`, `--ring` (light in `:root`, dark in `.dark`), and their Tailwind color-utility mappings via `@theme inline` (`bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `ring-ring`). Every later task consumes these class names.

- [ ] **Step 1: Add `card-foreground` and `ring` tokens**

In `src/app/globals.css`, extend the `@theme inline` block and the two token blocks added when the landing page was built:

```css
@theme inline {
  --color-border: var(--border);
  --color-ring: var(--ring);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
}
```

(This replaces the existing smaller `@theme inline`/`:root`/`.dark` blocks — same structure, two new lines each.)

- [ ] **Step 2: Remove the global body padding**

Delete this rule (it's the one directly under the `/* Loosely matches the Figma prototype... */` comment):

```css
body {
  padding: 1.5rem;
}
```

Leave the comment above it in place — it still documents the `@layer base` block below (Task 9 deletes the whole block later; don't touch it now).

- [ ] **Step 3: Simplify the landing page now that body padding is gone**

In `src/app/page.tsx`, the `<main>` no longer needs to fight global body padding or the Patrick Hand font (Task 9 removes the font import; until then `font-sans` still correctly overrides it, so leave `font-sans` for now but drop the padding hack):

```tsx
// before
<main className={`-m-[1.5rem] min-h-screen font-sans ${dark ? 'dark bg-background text-foreground' : 'bg-background text-foreground'}`}>

// after
<main className={`min-h-screen font-sans ${dark ? 'dark bg-background text-foreground' : 'bg-background text-foreground'}`}>
```

- [ ] **Step 4: Verify**

```bash
rm -rf .next && npm run build
```
Expected: compiles clean, same 4 pre-existing test-file errors as before, no new ones.

Screenshot `http://localhost:3000/` (`npm run dev`) and confirm it's pixel-identical to before this task (padding removal only matters once AppShell adds its own in Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/page.tsx
git commit -m "style: extend design tokens, drop global body padding"
```

---

### Task 2: shadcn-style UI primitives

**Files:**
- Create: `src/lib/utils.ts`
- Create: `components.json`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/textarea.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/dialog.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: tokens from Task 1 (`bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `ring-ring`).
- Produces (consumed by every later task):
  - `cn(...classes: ClassValue[]): string` from `@/lib/utils`.
  - `<Button variant="primary" | "secondary" | "ghost" | "link" size="default" | "sm" | "icon">` from `@/components/ui/button` — a native `<button>` (or `<a>` via `render` prop) with STYLE.md's exact CTA treatment.
  - `<Input>` / `<Textarea>` from `@/components/ui/input` / `@/components/ui/textarea` — drop-in replacements for `<input>` / `<textarea>` (same props, `React.ComponentProps<'input'>` / `'textarea'`).
  - `<Label>` from `@/components/ui/label` — drop-in for `<label>`.
  - `<Card>` from `@/components/ui/card` — a single `<div>` wrapper (`React.ComponentProps<'div'>`), no sub-components (YAGNI — every current usage is a single surface, not a header/body/footer split).
  - `<Badge variant="default" | "accent">` from `@/components/ui/badge` — for tags and small status labels.
  - `<Dialog>`, `<DialogTrigger>`, `<DialogContent>`, `<DialogTitle>` from `@/components/ui/dialog` — replaces the native `<dialog>` element used by `ObjectPickerModal`.

- [ ] **Step 1: Install dependencies**

```bash
npm install @base-ui/react class-variance-authority clsx tailwind-merge
```

- [ ] **Step 2: `cn()` helper**

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: `Button`**

```tsx
// src/components/ui/button.tsx
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Variant names match STYLE.md's own vocabulary ("Primary CTA" / "Secondary CTA"),
// not generic shadcn defaults — see Global Constraints for why there's no `destructive`.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: 'bg-[#2da44e] text-white shadow-sm hover:bg-[#278a43]',
        secondary: 'border border-border bg-background text-foreground hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
);

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <ButtonPrimitive className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```

- [ ] **Step 5: `Input` and `Textarea`**

```tsx
// src/components/ui/input.tsx
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
```

```tsx
// src/components/ui/textarea.tsx
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 6: `Label`**

```tsx
// src/components/ui/label.tsx
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-foreground', className)} {...props} />;
}
```

- [ ] **Step 7: `Card`**

```tsx
// src/components/ui/card.tsx
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm', className)} {...props} />;
}
```

- [ ] **Step 8: `Badge`**

```tsx
// src/components/ui/badge.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', {
  variants: {
    variant: {
      default: 'border-border bg-muted text-muted-foreground',
      accent: 'border-[#2da44e]/25 bg-[#2da44e]/8 text-[#2da44e]',
    },
  },
  defaultVariants: { variant: 'default' },
});

type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

- [ ] **Step 9: Confirm the installed `@base-ui/react` Dialog export names before writing the wrapper**

Base UI's exact export surface can shift between versions — verify against the version actually installed rather than assuming:

```bash
cat node_modules/@base-ui/react/dialog/index.d.ts
```

Expected exports: `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close`. If any name differs, use the installed name in Step 10 instead.

- [ ] **Step 10: `Dialog`**

```tsx
// src/components/ui/dialog.tsx
'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <DialogPrimitive.Popup
        className={cn(
          'fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl transition-all data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-4 top-4 grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold text-foreground', className)} {...props} />;
}
```

- [ ] **Step 11: Verify**

```bash
npx eslint src/components/ui src/lib/utils.ts
rm -rf .next && npm run build
```
Expected: no new errors (these files aren't imported anywhere yet, so nothing renders — this just confirms they compile and typecheck).

- [ ] **Step 12: Commit**

```bash
git add src/lib/utils.ts components.json src/components/ui package.json package-lock.json
git commit -m "feat: add shadcn-style UI primitive components"
```

---

### Task 3: Login + Signup pages

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/signup/page.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Label`, `Card` from Task 2.

- [ ] **Step 1: Rebuild the login page**

```tsx
// src/app/login/page.tsx
'use client';

import { signIn } from 'next-auth/react';
import { GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-[#2da44e] text-white">
            <GitFork aria-hidden="true" className="size-4" />
          </span>
          <span>footprint</span>
        </div>
        <form
          className="flex flex-col gap-4"
          action={async (formData) => {
            await signIn('credentials', {
              email: formData.get('email'),
              password: formData.get('password'),
              redirectTo: '/dashboard/resumes',
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="mt-2 w-full">
            Log in
          </Button>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Rebuild the signup page**

```tsx
// src/app/signup/page.tsx
import { GitFork } from 'lucide-react';
import { signupAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SignupPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-[#2da44e] text-white">
            <GitFork aria-hidden="true" className="size-4" />
          </span>
          <span>footprint</span>
        </div>
        <form className="flex flex-col gap-4" action={signupAction}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="mt-2 w-full">
            Sign up
          </Button>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx eslint src/app/login/page.tsx src/app/signup/page.tsx
rm -rf .next && npm run build && npm run dev
```
Screenshot `http://localhost:3000/login` and `http://localhost:3000/signup`. Confirm: centered card, green primary button, no legacy pill-shaped/black-border inputs bleeding through. Manually submit each form once to confirm `signIn`/`signupAction` still fire correctly (no logic changed, but confirms the `action` prop wiring survived the rewrite).

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/app/signup/page.tsx
git commit -m "style: reskin login and signup pages"
```

---

### Task 4: AppShell + Sidebar

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/Sidebar.tsx`
- Delete: `src/components/Sidebar.module.css`

**Interfaces:**
- Consumes: `cn` from Task 2. No prop signature changes to `AppShell`/`Sidebar` — `(app)/layout.tsx` (`src/app/(app)/layout.tsx`) calls `<AppShell initial={initial}>` unchanged.
- Produces: same `AppShell({ initial, children })` / `Sidebar({ initial, collapsed, onToggle, width })` signatures consumed by every page under `(app)/`.

- [ ] **Step 1: Reskin `Sidebar`**

Replace the one-letter labels with STYLE.md's prescribed icons (`GitBranch` for resumes, `Layers3` for objects, `BrainCircuit` for Q&A — see STYLE.md's "Iconography" section) and token-based colors:

```tsx
// src/components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrainCircuit, ChevronLeft, ChevronRight, GitBranch, Layers3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/dashboard/resumes', label: 'Resumes', icon: GitBranch },
  { href: '/dashboard/objects', label: 'Objects', icon: Layers3 },
  { href: '/qna', label: 'Q&A', icon: BrainCircuit },
];

export function Sidebar({
  initial,
  collapsed,
  onToggle,
  width,
}: {
  initial: string;
  collapsed: boolean;
  onToggle: () => void;
  width: number;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      style={{ width }}
      className="fixed top-0 left-0 flex h-screen flex-col gap-2 border-r border-border bg-card p-2"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label="Toggle sidebar"
        className="grid size-8 place-items-center self-end rounded-md border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
      <ul className="flex flex-col gap-1">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                title={link.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-[#2da44e]/8 text-[#2da44e]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && link.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex-1" />
      <Link
        href="/profile"
        title="Profile"
        className="grid size-8 place-items-center self-end rounded-md bg-foreground text-sm font-medium text-background"
      >
        {initial}
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Delete `Sidebar.module.css`**

```bash
rm src/components/Sidebar.module.css
```

- [ ] **Step 3: Update `AppShell`**

The wider icon+label rows need slightly more width than the old letter-only sidebar; bump the constants and move padding from inline styles to Tailwind:

```tsx
// src/components/AppShell.tsx
'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';

const SIDEBAR_WIDTH = { expanded: 176, collapsed: 56 };

// Owns the collapse state so both the (fixed-position) Sidebar and main's left margin
// stay in sync — a fixed sidebar no longer reserves its own space in the layout.
export function AppShell({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const width = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar initial={initial} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} width={width} />
      <main className="flex-1 p-6" style={{ marginLeft: width }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
npx eslint src/components/AppShell.tsx src/components/Sidebar.tsx
rm -rf .next && npm run build && npm run dev
```
Log in and screenshot any `(app)` page (e.g. `/dashboard/resumes`, even before Task 7 reskins its content — the shell around it is what this task changes). Confirm: icons + labels render, active link has the green tint, collapse toggle still works, avatar circle bottom-right of sidebar.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppShell.tsx src/components/Sidebar.tsx
git rm src/components/Sidebar.module.css
git commit -m "style: reskin AppShell and Sidebar"
```

---

### Task 5: Profile + Q&A pages

**Files:**
- Modify: `src/app/(app)/profile/page.tsx`
- Modify: `src/app/(app)/profile/LogoutButton.tsx`
- Modify: `src/app/(app)/qna/page.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Label` from Task 2.

- [ ] **Step 1: Reskin the profile page**

```tsx
// src/app/(app)/profile/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getProfile } from '@/lib/profile';
import { updateProfileAction } from './actions';
import { LogoutButton } from './LogoutButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default async function ProfilePage() {
  const userId = await getCurrentUserId();
  const profile = await getProfile(userId);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
      <form action={updateProfileAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" defaultValue={profile?.fullName} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={profile?.email} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={profile?.phone} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue={profile?.location} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="linkedin">LinkedIn URL</Label>
          <Input id="linkedin" name="linkedin" defaultValue={(profile?.links as any)?.linkedin ?? ''} />
        </div>
        <Button type="submit" className="self-start">
          Save
        </Button>
      </form>
      <LogoutButton />
    </div>
  );
}
```

- [ ] **Step 2: Reskin the logout button**

```tsx
// src/app/(app)/profile/LogoutButton.tsx
'use client';

import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  return (
    <Button type="button" variant="secondary" className="self-start" onClick={() => signOut({ redirectTo: '/login' })}>
      Log out
    </Button>
  );
}
```

- [ ] **Step 3: Reskin the Q&A page**

Replace every inline `style={{...}}` with Tailwind classes (same layout, no logic change):

```tsx
// src/app/(app)/qna/page.tsx
'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Matches the codes route.ts's onError returns — never render error.message directly, it's a
// fixed code, not user-facing text. 'invalid_api_key' is its own case (not just "unknown") so a
// later "enter your own API key" feature has a stable signal to hook into.
const ERROR_MESSAGES: Record<string, string> = {
  invalid_api_key: "AI features aren't configured with a valid API key yet. Please contact the site owner.",
  unknown: 'Something went wrong generating a response. Please try again.',
};

export default function QnaPage() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: '/api/qna' }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Ask anything about your career, based on everything in your objects.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm',
                m.role === 'user' ? 'bg-[#2da44e] text-white' : 'bg-muted text-foreground'
              )}
            >
              {m.parts.map((part, i) => (part.type === 'text' ? <span key={i}>{part.text}</span> : null))}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-2 text-sm text-red-600">
          {ERROR_MESSAGES[error.message] ?? ERROR_MESSAGES.unknown}
          <Button type="button" variant="link" onClick={() => regenerate()}>
            Retry
          </Button>
        </p>
      )}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a career question…" className="flex-1" />
        <Button type="submit" disabled={status === 'streaming' || status === 'submitted'}>
          Send
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
npx eslint src/app/\(app\)/profile/page.tsx src/app/\(app\)/profile/LogoutButton.tsx src/app/\(app\)/qna/page.tsx
rm -rf .next && npm run build && npm run dev
```
Screenshot `/profile` and `/qna`. Confirm profile form fields are labeled and spaced, Q&A chat bubbles align left/right correctly, send/retry buttons work.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/profile/page.tsx" "src/app/(app)/profile/LogoutButton.tsx" "src/app/(app)/qna/page.tsx"
git commit -m "style: reskin profile and Q&A pages"
```

---

### Task 6: Objects dashboard — `ObjectVersionChip`, `ObjectPickerModal`, `ObjectDashboardClient`

**Files:**
- Modify: `src/components/ObjectVersionChip.tsx`
- Delete: `src/components/ObjectVersionChip.module.css`
- Modify: `src/components/ObjectPickerModal.tsx`
- Delete: `src/components/ObjectPickerModal.module.css`
- Modify: `src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx`
- Delete: `src/app/(app)/dashboard/objects/ObjectDashboardClient.module.css`

**Interfaces:**
- Consumes: `Card`, `Badge`, `Button`, `Input`, `Textarea`, `Dialog`/`DialogTrigger`/`DialogContent`/`DialogTitle` from Task 2.
- No prop signature changes to `ObjectVersionChip`, `ObjectPickerModal`, or `ObjectDashboardClient` — `ResumeForm` (Task 7) and the object dashboard page (`src/app/(app)/dashboard/objects/page.tsx`, unmodified) both call these exactly as today.

This task touches the three files together because they're visually and behaviorally coupled (the picker modal renders chips, the dashboard renders both).

- [ ] **Step 1: Reskin `ObjectVersionChip`**

```tsx
// src/components/ObjectVersionChip.tsx
'use client';

import { useState } from 'react';
import type { ObjectType } from '@/lib/objects/schemas';
import { FIELDS_BY_TYPE, IDENTITY_FIELD, getIdentityLabel } from '@/lib/objects/fieldConfig';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2023-01" (native month input value, day-precision legacy values also tolerated) -> "Jan-2023".
// Hardcoded month names, not Intl/toLocaleDateString, so server/client rendering can't disagree.
function formatMonthYear(value: string): string {
  const [year, month] = value.split('-');
  const index = Number(month) - 1;
  if (!year || Number.isNaN(index) || index < 0 || index > 11) return value;
  return `${MONTH_ABBR[index]}-${year}`;
}

type Version = {
  id: string;
  fields?: unknown;
  body: string;
  createdAt?: string | Date;
  tags?: string[];
  usedInResumeNames?: string[];
};

// Shared full-object chip: identity + secondary fields + body + created date.
// Used both by the Object Dashboard's filmstrip and the picker modal's "all versions" view.
export function ObjectVersionChip({
  type,
  version,
  onClick,
  editTrigger,
  clampBody,
}: {
  type: ObjectType;
  version: Version;
  onClick?: () => void;
  // A small trigger (e.g. an edit-icon ObjectPickerModal) rendered in the chip's corner.
  editTrigger?: React.ReactNode;
  // Caps the body to a few lines instead of showing it in full — for pickers listing several
  // objects at once (e.g. ResumeForm's "Recent objects"), where full bodies would run too long.
  clampBody?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = (version.fields as Record<string, unknown> | null) ?? {};
  const secondaryFields = FIELDS_BY_TYPE[type].filter((f) => f.name !== IDENTITY_FIELD[type]);
  // Date fields (startDate/endDate, issueDate/expiryDate, ...) get their own "from – to" line
  // instead of competing with the other fields for the first-2 slots.
  const [startField, endField] = secondaryFields.filter((f) => f.type === 'month');
  const otherFields = secondaryFields.filter((f) => f.type !== 'month');
  const dateRange =
    startField && fields[startField.name]
      ? `${formatMonthYear(String(fields[startField.name]))}${
          endField ? ` – ${fields[endField.name] ? formatMonthYear(String(fields[endField.name])) : 'Present'}` : ''
        }`
      : null;
  const title = version.usedInResumeNames
    ? `used in: ${version.usedInResumeNames.length > 0 ? version.usedInResumeNames.join(', ') : 'not used'}`
    : undefined;

  const content = (
    <>
      <div className="w-full truncate text-sm font-semibold text-foreground">{getIdentityLabel(type, version.fields)}</div>
      {otherFields.slice(0, 2).map((f) =>
        fields[f.name] ? (
          <div key={f.name} className="w-full truncate text-sm text-muted-foreground">
            {String(fields[f.name])}
          </div>
        ) : null
      )}
      {dateRange && <div className="w-full truncate text-sm text-muted-foreground">{dateRange}</div>}
      {version.body && (
        <div className={cn('whitespace-pre-wrap text-sm text-foreground', clampBody && !expanded && 'line-clamp-3')}>
          {version.body}
        </div>
      )}
      {clampBody && version.body && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-xs text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
      {version.tags && version.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {version.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      )}
      {version.createdAt && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(version.createdAt).toISOString().slice(0, 10)}</div>
      )}
    </>
  );

  return (
    <Card
      title={title}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={cn('relative flex w-full flex-col gap-1 p-3.5 text-left text-sm', onClick && 'cursor-pointer hover:border-[#2da44e]/40')}
    >
      {editTrigger && (
        <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
          {editTrigger}
        </div>
      )}
      {content}
    </Card>
  );
}
```

- [ ] **Step 2: Delete `ObjectVersionChip.module.css`**

```bash
rm src/components/ObjectVersionChip.module.css
```

- [ ] **Step 3: Reskin `ObjectPickerModal`**

Swap the native `<dialog>` for the `Dialog` primitive; the trigger, form logic, and callback wiring are unchanged:

```tsx
// src/components/ObjectPickerModal.tsx
'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { createObjectAction, editObjectAction, getObjectHistoryAction } from '@/app/objects/actions';
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
  rootVersionId?: string;
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
  editingRootVersionId?: string;
  // Prefills the form from this version's fields/body/tags. Submitting saves a new version
  // of this same object (same rootVersionId) via editObjectAction — an edit-in-place, not a copy.
  prefillFrom?: ObjectSummary;
  // Fires when the plain "recent picker" view opens (not the editingRootVersionId browse view,
  // which already fetches on open). Lets a caller lazy-load recentObjects on first open.
  onOpen?: () => void;
};

export function ObjectPickerModal({
  type,
  recentObjects = [],
  onPick,
  triggerLabel = '+ Object',
  editingRootVersionId,
  prefillFrom,
  onOpen,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'recent' | 'allVersions'>('recent');
  const [allVersions, setAllVersions] = useState<ObjectSummary[]>([]);

  async function openAllVersions(rootVersionId: string) {
    setAllVersions(await getObjectHistoryAction(rootVersionId));
    setView('allVersions');
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    if (editingRootVersionId) {
      openAllVersions(editingRootVersionId);
    } else {
      setView('recent');
      onOpen?.();
    }
  }

  function pick(picked: ObjectSummary) {
    onPick(picked);
    setOpen(false);
  }

  const prefillFields = (prefillFrom?.fields as Record<string, unknown> | undefined) ?? {};
  const isIconTrigger = triggerLabel.length <= 2;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant={isIconTrigger ? 'ghost' : 'secondary'} size={isIconTrigger ? 'icon' : 'sm'}>
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
            <DialogTitle>{prefillFrom ? `Edit ${type}` : `Add Object — ${type}`}</DialogTitle>
            {!prefillFrom && recentObjects.length > 0 && (
              <fieldset className="mt-4 flex flex-col gap-2">
                <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent objects</legend>
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
                          onClick={() => o.rootVersionId && openAllVersions(o.rootVersionId)}
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
            <fieldset className="mt-4 flex flex-col gap-3">
              <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {prefillFrom ? 'Edit fields, then save' : 'or create new'}
              </legend>
              <form
                className="flex flex-col gap-3"
                action={async (formData) => {
                  const fields = Object.fromEntries(
                    FIELDS_BY_TYPE[type].map((f) => [f.name, String(formData.get(f.name) ?? '')])
                  );
                  const body = String(formData.get('body'));
                  const tags = parseTags(formData.get('tags'));
                  const saved = prefillFrom
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
                  <Textarea id="body" name="body" required defaultValue={prefillFrom?.body ?? ''} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tags">Tags, comma-separated</Label>
                  <Input id="tags" name="tags" defaultValue={prefillFrom?.tags?.join(', ') ?? ''} />
                </div>
                <Button type="submit" className="mt-1 self-start">
                  {prefillFrom ? 'Save new version' : 'Create'}
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
                  onClick={editingRootVersionId ? undefined : () => pick(v)}
                  editTrigger={<ObjectPickerModal type={type} prefillFrom={v} onPick={onPick} triggerLabel="✎" />}
                />
              ))}
            </div>
            {!editingRootVersionId && (
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

Note: `DialogTrigger`'s `render` prop pattern assumes Base UI's standard "render your own trigger element" API (same idea as Radix's `asChild`) — confirm the actual prop name against the `dialog/index.d.ts` you already checked in Task 2 Step 9; adjust `render={<Button .../>}` to whatever the installed version calls it if different (e.g. some Base UI versions use a render function `render={(props) => <Button {...props} />}` instead of a plain element).

- [ ] **Step 4: Delete `ObjectPickerModal.module.css`**

```bash
rm src/components/ObjectPickerModal.module.css
```

- [ ] **Step 5: Reskin `ObjectDashboardClient`**

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

// How many recent versions to show before you have to open "→" for the rest.
// 4 = exactly 2 full rows at the 2-column chip grid width.
const CHIP_LIMIT = 4;

type DashboardEntry = {
  rootVersionId: string;
  type: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    body: string;
    fields: unknown;
    createdAt: string | Date;
    tags: string[];
    usedInResumeNames: string[];
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
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Objects</h1>

      <form className="flex gap-2">
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
              <h2 className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">{type}</h2>
              <ObjectPickerModal type={type} onPick={refresh} triggerLabel={`+ New ${type}`} />
            </div>
            <div className="flex flex-col gap-4">
              {entries.map((entry) => {
                const root = entry.versions[0];
                // Newest first (left-to-right): reverse the ascending list, then take the recent window.
                const shown = [...entry.versions].reverse().slice(0, CHIP_LIMIT);
                return (
                  <div key={entry.rootVersionId} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-2 text-sm text-muted-foreground">{getIdentityLabel(type, root.fields)}</div>
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
                      {entry.versions.length > CHIP_LIMIT && (
                        <ObjectPickerModal
                          type={type}
                          editingRootVersionId={entry.rootVersionId}
                          onPick={refresh}
                          triggerLabel="→"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Delete `ObjectDashboardClient.module.css`**

```bash
rm "src/app/(app)/dashboard/objects/ObjectDashboardClient.module.css"
```

- [ ] **Step 7: Verify**

```bash
npx eslint src/components/ObjectVersionChip.tsx src/components/ObjectPickerModal.tsx "src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx"
rm -rf .next && npm run build && npm run dev
```
Screenshot `/dashboard/objects`. Confirm: chips render as cards with badges, "+ New ..." opens the dialog (not a blank native dialog), creating/editing an object still works end-to-end (click through one create + one edit), "→" opens the all-versions view.

- [ ] **Step 8: Commit**

```bash
git add src/components/ObjectVersionChip.tsx src/components/ObjectPickerModal.tsx "src/app/(app)/dashboard/objects/ObjectDashboardClient.tsx"
git rm src/components/ObjectVersionChip.module.css src/components/ObjectPickerModal.module.css "src/app/(app)/dashboard/objects/ObjectDashboardClient.module.css"
git commit -m "style: reskin objects dashboard, chip, and picker modal"
```

---

### Task 7: Resume dashboard + `ResumeForm`

**Files:**
- Modify: `src/app/(app)/dashboard/resumes/page.tsx`
- Delete: `src/app/(app)/dashboard/resumes/ResumeDashboard.module.css`
- Modify: `src/app/(app)/resumes/ResumeForm.tsx`
- Delete: `src/app/(app)/resumes/ResumeForm.module.css`

**Interfaces:**
- Consumes: `Card`, `Badge`, `Button`, `Input` from Task 2, `ObjectVersionChip`/`ObjectPickerModal` from Task 6.
- No prop signature changes to `ResumeForm({ mode, sourceId, initialName, initialSections, versionInfo })` — `new/page.tsx`, `[id]/edit/page.tsx`, `[id]/fork/page.tsx` (Task 8) call it unchanged.

- [ ] **Step 1: Reskin the resume dashboard**

```tsx
// src/app/(app)/dashboard/resumes/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeForest } from '@/lib/resumes/queries';
import Link from 'next/link';
import { GitFork, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Tree = Awaited<ReturnType<typeof getResumeForest>>[number];

// Recurses to arbitrary depth — `forest` is already a flat list of every tree with a
// forkedFromRootVersionId link, so a fork-of-a-fork just keeps matching one level deeper.
function ResumeTreeRow({ tree, forest, depth = 0 }: { tree: Tree; forest: Tree[]; depth?: number }) {
  const children = forest.filter((t) => t.forkedFromRootVersionId === tree.rootVersionId);
  return (
    <li style={{ marginLeft: depth * 24 }}>
      {/* Whole row is one link — not just the name — so clicking anywhere on it
          (the fork badge, the edited date) routes to the resume, not just the name text. */}
      <Link
        href={`/resumes/${tree.headVersionId}`}
        className="flex items-center justify-between gap-3 border-b border-border px-1.5 py-2 text-sm transition-colors hover:bg-muted"
      >
        <span className="flex items-center gap-1.5">
          {depth > 0 && <GitFork className="size-3.5 text-muted-foreground" aria-hidden="true" />}
          <span className="font-medium text-foreground">{tree.name}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">edited {tree.headCreatedAt.toISOString().slice(0, 10)}</span>
        </span>
        {depth > 0 && <Badge variant="accent">fork</Badge>}
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
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Resumes</h1>
      <ul className="border-t border-border">
        {roots.map((tree) => (
          <ResumeTreeRow key={tree.rootVersionId} tree={tree} forest={forest} />
        ))}
      </ul>
      <Button render={<Link href="/resumes/new" />} className="mt-2 self-start">
        <Plus className="size-4" /> New resume
      </Button>
    </div>
  );
}
```

Note: `Button`'s `render` prop for rendering as a `<Link>` relies on `@base-ui/react/button`'s `Button.Props` supporting a `render` override (confirmed on the landing page's reference `button.tsx`, which types `ButtonProps` as `ButtonPrimitive.Props`). If the installed version's prop is named differently, use that name — check `node_modules/@base-ui/react/button/index.d.ts` the same way Task 2 Step 9 checked Dialog.

- [ ] **Step 2: Delete `ResumeDashboard.module.css`**

```bash
rm "src/app/(app)/dashboard/resumes/ResumeDashboard.module.css"
```

- [ ] **Step 3: Reskin `ResumeForm`**

Only markup/classNames change — every function above `return (` is untouched:

```tsx
// src/app/(app)/resumes/ResumeForm.tsx — replace everything from the `return (` onward with:
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
                key={item.objectVersionId}
                type={section.sectionType}
                version={{ id: item.objectVersionId, body: item.body, fields: item.fields, tags: item.tags }}
                editTrigger={
                  <ObjectPickerModal
                    type={section.sectionType}
                    prefillFrom={{ id: item.objectVersionId, body: item.body, fields: item.fields, tags: item.tags, versionNumber: 0 }}
                    onPick={(picked) => replaceItem(section.sectionType, item.objectVersionId, picked)}
                    triggerLabel="✎"
                  />
                }
              />
            ))}
          </div>
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
            onPick={(picked) => addItem(section.sectionType, toItem(picked))}
          />
        </fieldset>
      ))}

      <select
        onChange={(e) => e.target.value && addSectionType(e.target.value as ObjectType)}
        value=""
        className="h-9 max-w-xs rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

Add these imports alongside the existing ones at the top of the file (`Input`, `Button` from `ui/`, three new lucide icons, and drop the now-unused `styles` import):

```tsx
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
```

Remove `import styles from './ResumeForm.module.css';` — nothing in the file references `styles` anymore.

- [ ] **Step 4: Delete `ResumeForm.module.css`**

```bash
rm "src/app/(app)/resumes/ResumeForm.module.css"
```

- [ ] **Step 5: Verify**

```bash
npx eslint "src/app/(app)/dashboard/resumes/page.tsx" "src/app/(app)/resumes/ResumeForm.tsx"
rm -rf .next && npm run build && npm run dev
```
Screenshot `/dashboard/resumes` and `/resumes/new`. Confirm: resume tree rows show fork badges correctly indented, "+ New resume" navigates to `/resumes/new`, the form's section reorder/delete icon-buttons and "Add Section" dropdown still work, and one full create-resume flow still ends up on `/resumes/<id>` (logic untouched, but this is the highest-risk file in the whole plan given its size — verify by hand, not just visually).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/dashboard/resumes/page.tsx" "src/app/(app)/resumes/ResumeForm.tsx"
git rm "src/app/(app)/dashboard/resumes/ResumeDashboard.module.css" "src/app/(app)/resumes/ResumeForm.module.css"
git commit -m "style: reskin resume dashboard and ResumeForm"
```

---

### Task 8: Resume view, edit, fork, history pages

**Files:**
- Modify: `src/app/(app)/resumes/[id]/page.tsx`
- Delete: `src/app/(app)/resumes/[id]/ResumeView.module.css`
- Modify: `src/app/(app)/resumes/[id]/HistoryTab.tsx`

`src/app/(app)/resumes/[id]/edit/page.tsx`, `.../fork/page.tsx`, and `.../new/page.tsx` need no changes — they only call `ResumeForm` (Task 7 already reskinned it) and pass data, no markup of their own.

**Interfaces:**
- Consumes: `Button` from Task 2, `ObjectVersionChip` from Task 6.

- [ ] **Step 1: Reskin the resume view page**

```tsx
// src/app/(app)/resumes/[id]/page.tsx
import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { HistoryTab } from './HistoryTab';
import { ObjectVersionChip } from '@/components/ObjectVersionChip';
import type { ObjectType } from '@/lib/objects/schemas';
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{resume.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">edited {resume.createdAt.toISOString().slice(0, 10)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" render={<Link href={`/resumes/${resume.id}/fork`} />}>
            Fork
          </Button>
          <Button render={<Link href={`/resumes/${resume.id}/edit`} />}>Edit</Button>
        </div>
      </div>

      <nav className="flex gap-5 border-b border-border pb-2 text-sm">
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
            <h2 className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">{section.sectionType}</h2>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-dashed border-border p-3">
              {section.items.map((item) => (
                <ObjectVersionChip key={item.id} type={item.objectVersion.type as ObjectType} version={item.objectVersion} />
              ))}
            </div>
          </div>
        ))}

      {tab === 'history' && <HistoryTab userId={userId} rootVersionId={resume.rootVersionId} currentId={resume.id} />}
    </div>
  );
}
```

- [ ] **Step 2: Delete `ResumeView.module.css`**

```bash
rm "src/app/(app)/resumes/[id]/ResumeView.module.css"
```

- [ ] **Step 3: Reskin `HistoryTab`**

```tsx
// src/app/(app)/resumes/[id]/HistoryTab.tsx
import { getResumeTreeHistory } from '@/lib/resumes/queries';
import Link from 'next/link';
import { cn } from '@/lib/utils';

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
    <ul className="flex flex-col gap-1">
      {history.map((v, i) => (
        <li key={v.id}>
          <Link
            href={`/resumes/${v.id}`}
            className={cn(
              'block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
              v.id === currentId ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            Version {i + 1} {v.id === currentId && '(current)'} — {v.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Verify**

```bash
npx eslint "src/app/(app)/resumes/[id]/page.tsx" "src/app/(app)/resumes/[id]/HistoryTab.tsx"
rm -rf .next && npm run build && npm run dev
```
Screenshot a resume's view page on both the "Resume" and "History" tabs. Confirm Fork/Edit buttons navigate correctly and the active tab is visually distinct.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/resumes/[id]/page.tsx" "src/app/(app)/resumes/[id]/HistoryTab.tsx"
git rm "src/app/(app)/resumes/[id]/ResumeView.module.css"
git commit -m "style: reskin resume view and history pages"
```

---

### Task 9: Delete the legacy CSS system

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:** none — this is pure deletion once Tasks 3–8 have moved every page off the legacy rules.

- [ ] **Step 1: Confirm nothing still depends on the legacy block**

```bash
grep -rn "legacy-" src/
grep -rln "styles from '.*\.module\.css'" src/
```
Expected: no `--legacy-*` references anywhere, and no remaining `.module.css` imports outside anything intentionally kept (there should be none left — every `.module.css` file was deleted in Tasks 4–8). If either search returns something, stop and finish migrating that file before continuing.

- [ ] **Step 2: Delete the legacy `@layer base` block and its variables**

In `src/app/globals.css`, delete everything from the `/* Wrapped in Tailwind's \`base\` layer... */` comment through the closing `} /* @layer base */` line, and delete the `:root { --legacy-*: ...; }` block above it.

- [ ] **Step 3: Drop the Patrick Hand font**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Version Control",
  description: "Object-based resume version control with AI career Q&A",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Drop the now-unnecessary `font-sans` override on the landing page**

```tsx
// src/app/page.tsx
<main className={`min-h-screen ${dark ? 'dark bg-background text-foreground' : 'bg-background text-foreground'}`}>
```

- [ ] **Step 5: Verify**

```bash
rm -rf .next && npm run build && npm run dev
```
Screenshot every page migrated in Tasks 3–8 one more time (`/`, `/login`, `/signup`, `/dashboard/resumes`, `/dashboard/objects`, `/resumes/new`, a resume view page, `/profile`, `/qna`). Confirm none of them regressed now that the legacy fallback CSS is gone — every element on every page should be styled entirely by Tailwind utilities and the `ui/` primitives at this point.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/page.tsx
git commit -m "chore: remove legacy CSS system now that every page uses the design system"
```
