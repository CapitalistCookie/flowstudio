# PLAN-X21 — Replace Mock Stores with STDB Data

> **Problem**: Three Zustand stores initialize with hardcoded mock data:
> 1. `lib/stores/project-store.ts` → `MOCK_PROJECTS`
> 2. `lib/stores/editor-store.ts` → `MOCK_TIMELINE_TRACKS`
> 3. `lib/stores/recording-store.ts` → `MOCK_INTENT_STREAMS`
>
> These mocks make the UI look populated but prevent any real backend interaction.
>
> **Impact**: Dashboard shows fake projects. Editor has fake tracks. Recording page has fake intent streams. Users see fake data that doesn't correspond to anything real.

---

## Acceptance Criteria

- [ ] `project-store` initializes empty and loads from STDB on mount
- [ ] `editor-store` initializes empty and loads from project data
- [ ] `recording-store` initializes empty (intent streams come from real pipeline)
- [ ] A loading state is shown while data loads
- [ ] Empty state is shown when no projects exist
- [ ] Mock data is moved to `lib/mock-data.ts` only (for demo/dev mode)

---

## Implementation

### Step 1: Add `loadFromStdb` actions to each store

```typescript
// project-store.ts
loadProjects: async (ownerId: string) => {
  set({ isLoading: true });
  try {
    const projects = await listProjects(ownerId);
    set({ projects, isLoading: false });
  } catch (err) {
    set({ error: err.message, isLoading: false });
  }
},
```

### Step 2: Initialize stores from STDB in page components

Dashboard page calls `loadProjects()` on mount. Studio page loads project-specific data.

### Step 3: Add loading/empty states to UI

Replace immediate data rendering with loading spinners and empty-state illustrations.

---

## Dependencies

- X-18 (STDB connection)
- X-19 (projects in STDB)
