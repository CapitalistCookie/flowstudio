# PLAN-X19 — Project Creation in STDB

> **Problem**: The frontend creates projects in **localStorage** only (`lib/projects.ts` uses `STORAGE_KEY` with `localStorage.getItem/setItem`). Projects are never created in SpacetimeDB. This means:
> 1. Workers can't find projects (they query STDB)
> 2. Signals can't be written (they reference project IDs)
> 3. Pipeline can't be triggered (it references project IDs in STDB)
> 4. The dashboard shows mock data, not real projects
>
> **Impact**: The entire backend is disconnected from project management. Projects exist only in the browser.

---

## Acceptance Criteria

- [ ] "Create Project" action creates a project in STDB via `callReducer('createProject', ...)`
- [ ] The returned project ID is used for all subsequent operations
- [ ] Dashboard lists projects from STDB (via `queryTable('projects')`)
- [ ] Project deletion removes from STDB
- [ ] A test verifies the createProject call shape matches the STDB reducer

---

## Implementation

### Step 1: Create `lib/services/project-service.ts`

```typescript
import { callReducer, queryTable } from '../stdb/connection';
import { auth } from '@clerk/nextjs';

export async function createProjectInStdb(name: string, ownerId: string): Promise<string> {
  await callReducer('createProject', {
    name,
    ownerId,
    metadata: JSON.stringify({ createdFrom: 'web' }),
  });

  // Query to find the just-created project (STDB doesn't return IDs from reducers)
  const projects = await queryTable('projects');
  const created = projects
    .filter(p => p.name === name && p.ownerId === ownerId)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0];

  return created?.id as string;
}

export async function listProjects(ownerId: string) {
  const projects = await queryTable('projects');
  return projects.filter(p => p.ownerId === ownerId);
}
```

### Step 2: Update dashboard to use STDB projects

Replace `useProjectStore` (which uses localStorage) with calls to `listProjects()`.

### Step 3: Update "New Recording" flow

When user clicks "New Recording":
1. Create project in STDB
2. Get project ID
3. Navigate to `/record?projectId={id}`

---

## Dependencies

- X-01 (STDB call format)
- X-18 (STDB connection lifecycle)
