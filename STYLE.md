# Footprint Style Guide

## Product character

Footprint is a calm, technical career workspace: GitHub's structured developer-tool clarity combined with ChatGPT's spacious, approachable interaction model.

Use the visual language to communicate:

- Structured career data rather than document clutter
- Versioning, branches, forks, and traceable progress
- Confidence and focus without corporate heaviness
- AI assistance that feels useful, grounded, and quiet

Avoid gradients used as decoration, glassmorphism, excessive shadows, playful illustrations, emoji, and generic AI-purple styling.

## Color system

Use semantic theme tokens wherever possible: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-muted`.

### Brand accent

GitHub-inspired green is the product accent:

- Primary: `#2da44e`
- Hover: `#278a43`
- Bright dark-mode accent: `#3fb950`
- Dark section accent: `#7ee787`
- Accent tint: `rgba(46, 160, 67, 0.12)`

Use green for primary actions, active states, branch/version indicators, small labels, icons, and success signals. Do not use it for large areas of body copy.

### Theme behavior

Support light and dark themes. Keep the same semantic hierarchy in both modes:

- Light background: white or near-white
- Dark background: near-black charcoal
- Cards: slightly elevated from the page background
- Borders: quiet gray with clear separation
- Muted text: readable but secondary

Do not manually scatter `dark:` color overrides when a semantic token can express the relationship.

## Typography

Use one clean sans-serif family for interface text and one monospace face for technical metadata.

- Headings: semibold, tight tracking, compact line height
- Body: regular weight, comfortable line height, muted secondary color
- Labels: small, medium weight, often uppercase with wide tracking
- Technical values: monospace, especially branch names, object types, version labels, and timestamps

Recommended hierarchy:

- Hero heading: `text-5xl` to `text-7xl`, `font-semibold`, tight tracking
- Section heading: `text-3xl` to `text-4xl`, `font-semibold`
- Body copy: `text-base` to `text-lg`, relaxed leading
- UI copy: `text-sm`
- Metadata: `text-xs` or `text-[10px]`

## Layout

Use a centered content rail with a maximum width of approximately `1152px` (`max-w-6xl`).

- Mobile horizontal padding: `px-5`
- Tablet horizontal padding: `sm:px-8`
- Desktop horizontal padding: `lg:px-10`
- Section rhythm: generous vertical padding, usually `py-20` or more
- Prefer flexbox for one-dimensional layouts and grid for feature matrices or dashboard relationships
- Keep primary content widths readable: approximately `max-w-xl` to `max-w-2xl`
- Use whitespace as a core design element

Responsive behavior should be mobile-first. Navigation links may collapse on smaller screens, actions should remain easy to reach, and complex visualizations should stack rather than overflow.

## Surfaces and borders

Use restrained surfaces:

- Cards: `rounded-xl`, `border border-border`, `bg-card`
- Smaller controls: `rounded-md` or `rounded-lg`
- Pills/status labels: `rounded-full`
- Default shadows: subtle; reserve stronger shadows for a primary visual preview or floating confirmation
- Use borders to communicate structure and relationships, not decoration

Avoid excessive nested cards. A section should generally have one surface hierarchy: page, section, card, nested item.

## Buttons and links

Primary CTA:

- Green background with white text
- Medium weight, compact vertical padding
- `rounded-md`
- Optional arrow icon at the end
- Hover may lift very slightly and deepen the green

Secondary CTA:

- Neutral background or transparent surface
- `border border-border`
- Foreground text
- Hover with `bg-muted`

Text links should use muted text by default and transition to foreground on hover. Keep authentication actions visible in the header.

## Iconography

Use Lucide icons with consistent, small sizing. Icons should clarify actions or concepts, not act as decoration.

Preferred concepts:

- `GitFork` for the Footprint brand mark
- `GitBranch` for versioning and career paths
- `Layers3` for reusable objects
- `Target` for role matching
- `BrainCircuit` for AI career Q&A
- `ArrowRight` for forward CTAs
- `Moon` and `Sun` for theme switching

Use `aria-hidden="true"` for decorative icons and accessible labels for icon-only buttons.

## Product metaphors

Carry these metaphors consistently across future pages:

- Career Footprint: the complete source of truth
- Objects: reusable experiences, projects, skills, and achievements
- Branches: alternate career directions or resume versions
- Forks: new resume variants derived from an existing version
- Main: the canonical career history
- Commits: meaningful updates to career evidence
- Role match: alignment between a job description and relevant objects

Technical labels may use monospace styling, but user-facing language should remain clear and human.

## Interaction and motion

Keep motion subtle and purposeful:

- Use color, border, and shadow transitions for hover states
- A primary CTA may translate upward by a very small amount
- Avoid constant animation, parallax, bouncing, and attention competition
- Theme toggles should update immediately and preserve the page layout
- Focus states must remain visible and keyboard navigation must work

## Accessibility

- Use semantic landmarks such as `header`, `nav`, `main`, `section`, and `footer`
- Maintain readable contrast in both themes
- Never communicate state by color alone
- Give all meaningful images descriptive alt text
- Give icon-only controls an accessible name
- Keep touch targets comfortably sized
- Preserve heading order and visible focus indicators

## Page composition pattern

For a standard Footprint page, use this order when relevant:

1. Header with brand, primary navigation, theme control, and auth actions
2. Page intro with eyebrow, clear heading, supporting copy, and primary action
3. Main workspace or feature content
4. Supporting explanation, relationship visualization, or activity/history
5. AI or role-matching callout when relevant
6. Footer with lightweight utility links

The landing page establishes this system: centered max-width rails, green branch accents, quiet borders, technical metadata, generous whitespace, and light/dark parity. New pages should reuse those decisions instead of introducing a new visual language.

## Implementation rules

- Prefer existing shadcn components and semantic design tokens
- Use `gap-*` for spacing rather than `space-x-*` or `space-y-*`
- Use `size-*` for equal icon/control dimensions
- Use `cn()` for conditional classes
- Keep components focused; split large pages into composable sections
- Do not use localStorage for application data persistence
- Keep auth buttons as links until real authentication routes are introduced
- Update page metadata when adding new routes

## Quick review checklist

Before shipping a page, confirm:

- Does it feel calm, technical, and professional?
- Is green reserved for actions, active states, and meaningful career signals?
- Does the page work in both light and dark themes?
- Are spacing, borders, radii, and typography consistent with this guide?
- Are Git/version metaphors used consistently and explained clearly?
- Are keyboard focus, contrast, labels, and responsive stacking covered?
- Does the page avoid unnecessary decoration and duplicated surface treatments?

## Canonical reference

The current landing page in `app/page.tsx` is the visual reference implementation. `app/globals.css` contains the shared semantic theme tokens and should remain the source of truth for global colors and radius values.
