# PLAN-X06 — Fix Dockerfile.client Reference

> **Problem**: `infra/docker/Dockerfile.client` copies from `../../claudeFrontend` (the scaffold frontend) instead of `../../frontend` (the canonical frontend with Clerk auth, polished UI, timeline).
>
> **Impact**: Docker builds produce the wrong frontend. Production deployments would serve the unfinished scaffold instead of the real app.

---

## Acceptance Criteria

- [ ] `Dockerfile.client` references `frontend/`, not `claudeFrontend/`
- [ ] `docker build` succeeds with the corrected path
- [ ] The built image serves the Clerk-authenticated frontend

---

## Tests to Write FIRST

### `packages/shared/__tests__/infrastructure.test.ts` (update existing)

```typescript
it('Dockerfile.client references frontend/ not claudeFrontend/', () => {
  const dockerfile = readFileSync('infra/docker/Dockerfile.client', 'utf-8');
  expect(dockerfile).toContain('frontend');
  expect(dockerfile).not.toContain('claudeFrontend');
});
```

---

## Implementation

In `infra/docker/Dockerfile.client`, replace all occurrences of `claudeFrontend` with `frontend`.

---

## Dependencies

- None
