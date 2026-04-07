# FlowStudio Frontend NLE — Execution Prompt

> **Paste this entire file as your first message in a new Claude Code session opened at `/home/user/projects/flowstudio`.**

---

## Your Mission

You are executing the FlowStudio frontend NLE implementation plan. Use the `superpowers:subagent-driven-development` skill to dispatch independent tasks to subagents, preserving your context window.

## Required Reading (DO THIS FIRST)

1. **Design doc:** `docs/plans/2026-03-14-frontend-nle-design.md` (40 sections, approved)
2. **Implementation plan:** `docs/plans/2026-03-14-frontend-nle-implementation.md` (9 phases, ~30 tasks)
3. **Handoff doc:** `docs/plans/2026-03-14_0918Z_FRONTEND_NLE_HANDOFF.md` (architecture summary, constraints, phase dependencies)

## Execution Strategy

### Phase Dependencies (CRITICAL)
```
Phase 1 (Foundation) ─── MUST complete first, blocks everything
    │
    ├── Phase 2 (Navigation/Dashboard) ─── can parallel
    ├── Phase 3 (Recording) ─── can parallel
    └── Phase 6 (Projects Gallery) ─── can parallel
    │
Phase 4 (Studio Layout) ─── needs Phase 1
    │
Phase 5 (Timeline Core) ─── needs Phase 4
    │
    ├── Phase 7 (Workers/Advanced) ─── can parallel
    └── Phase 8 (Auto-save/Polish) ─── can parallel
    │
Phase 9 (Backend) ─── independent, can run anytime
```

### How To Execute

1. **Invoke `superpowers:subagent-driven-development` skill** — it will guide you
2. **Phase 1 first (sequential)** — Tasks 1.1 through 1.8 must run in order since each depends on the previous
3. **After Phase 1, dispatch Phases 2, 3, and 6 in parallel** — these are independent
4. **Then Phase 4 → Phase 5 (sequential)** — studio depends on foundation
5. **After Phase 5, dispatch Phases 7 and 8 in parallel**
6. **Phase 9 anytime** — backend changes are independent

### Per-Task Subagent Instructions

When dispatching each task to a subagent:
- Point it to the implementation plan: `docs/plans/2026-03-14-frontend-nle-implementation.md`
- Tell it which Task number to execute (e.g., "Execute Task 1.3")
- Tell it to read the specific task section for exact file paths and code
- Tell it to run `pnpm --filter @flowstudio/frontend run typecheck` after code changes
- Tell it to commit with a descriptive message after each task
- For shadcn components (Task 2.1): tell it to use latest shadcn/ui component patterns from web search if needed

### Review Checkpoints

After each phase completes, verify:
- `pnpm --filter @flowstudio/frontend run typecheck` passes
- `pnpm --filter @flowstudio/frontend run build` passes
- No unintended changes to existing files (`git diff --stat`)

### Key Constraints (from handoff doc)

- All Zustand stores MUST use `createStore()` (vanilla), NOT `create()` (React-bound)
- Canvas timeline renderer MUST NOT import React
- All new React components go in `claudeFrontend/src/components/` (swappable layer)
- All framework-agnostic code goes in `claudeFrontend/src/core/` (permanent layer)
- React hook adapters go in `claudeFrontend/src/hooks/` (swappable layer)
- Use CSS variables (`var(--color-*)`) for all colors, not hardcoded hex values
- SpacetimeDB client (`lib/stdbConnection.ts`) is already framework-agnostic — don't modify it
- The existing `lib/stdbHooks.ts` contains the current SpacetimeDB React hooks — new code uses `hooks/` directory instead
- Tailwind v4 uses `@import "tailwindcss"` not `@tailwind base/components/utilities`

## Start

Begin by reading the three documents listed above, then invoke the subagent-driven-development skill and start Phase 1.
