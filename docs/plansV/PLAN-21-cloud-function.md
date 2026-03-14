# PLAN-21: Cloud Function Standalone Test

**Objective:** Verify the generate-upload-url Cloud Function.

**File Under Test:** `infra/cloud-function/generate-upload-url/index.js`

---

## Test Cases

### T21.1 — Valid Request
```typescript
test('returns signed URL and GCS path for valid request', async () => {
  // POST { projectId: 'abc123', filename: 'video.mp4', contentType: 'video/mp4' }
  // Response: { url: 'https://storage...', gcsPath: 'gs://bucket/projects/abc123/source_video/video.mp4' }
});
```

### T21.2 — Path Traversal Rejection
```typescript
test('rejects path traversal in filename', async () => {
  // filename: '../../../etc/passwd'
  // Should return 400
});
```

### T21.3 — Content Type Validation
```typescript
test('rejects non-video content types', async () => {
  // contentType: 'text/html'
  // Should return 400
});
```

### T21.4 — CORS Headers
```typescript
test('returns correct CORS headers', async () => {
  // OPTIONS request
  // Verify Access-Control-Allow-Origin (currently '*')
  // Document: should be restricted to frontend domain for production
});
```

### T21.5 — Missing Fields
```typescript
test('returns 400 for missing required fields', async () => {
  // Missing projectId, filename, or contentType
});
```

---

## How to Test Locally

```bash
# Install Cloud Functions Framework
cd infra/cloud-function/generate-upload-url
npm install
npm install -D @google-cloud/functions-framework

# Start locally
npx functions-framework --target=generateUploadUrl --port=8081

# Test with curl
curl -X POST http://localhost:8081 \
  -H "Content-Type: application/json" \
  -d '{"projectId": "test", "filename": "video.mp4", "contentType": "video/mp4"}'
```

---

## Success Criteria
- Valid requests return signed URL + GCS path
- Path traversal attacks rejected
- Non-video content types rejected
- CORS headers present
