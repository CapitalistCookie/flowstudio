# PLAN-X05 — Fix Upload Service Auth Bypass

> **Problem**: `frontend/lib/upload/upload-service.ts` calls the Cloud Function directly at `NEXT_PUBLIC_UPLOAD_FUNCTION_URL/generate-upload-url`, bypassing the authenticated `/api/upload-url` proxy route. This means:
> 1. No Clerk auth token is sent — anyone can generate upload URLs
> 2. CORS issues when the Cloud Function doesn't allowlist the frontend origin
> 3. The server-side env var `UPLOAD_FUNCTION_URL` (without `NEXT_PUBLIC_` prefix) is unused
>
> **Impact**: Security vulnerability — unauthenticated uploads. Potential CORS failures in production.

---

## Acceptance Criteria

- [ ] `uploadToGcs` calls `/api/upload-url` (the Next.js proxy) instead of the Cloud Function directly
- [ ] The proxy route adds Clerk auth (already implemented in `app/api/upload-url/route.ts`)
- [ ] A test verifies the upload flow uses the proxy URL
- [ ] No `NEXT_PUBLIC_UPLOAD_FUNCTION_URL` is needed (the proxy handles routing)

---

## Tests to Write FIRST

### `frontend/__tests__/upload-service.test.ts`

```typescript
describe('upload service', () => {
  it('calls /api/upload-url not the Cloud Function directly', () => {
    // Verify the fetch URL starts with /api/upload-url
  });

  it('includes the file metadata in the request', () => {
    // Verify projectId, filename, contentType are sent
  });
});
```

---

## Implementation

### Update `frontend/lib/upload/upload-service.ts`

Change the URL from direct Cloud Function to the proxy:

```typescript
const UPLOAD_URL = '/api/upload-url'; // Uses Next.js API proxy with Clerk auth

export async function uploadToGcs(
  projectId: string,
  filename: string,
  blob: Blob,
  contentType: string,
): Promise<{ gcsPath: string; size: number }> {
  // Step 1: Get signed URL via authenticated proxy
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, filename, contentType }),
  });
  // ... rest stays the same
}
```

---

## Dependencies

- None (independent frontend fix)
