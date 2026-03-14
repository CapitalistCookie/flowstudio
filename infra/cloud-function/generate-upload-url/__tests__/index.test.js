import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetSignedUrl = vi.fn();

function createMockStorage() {
  return {
    bucket: () => ({
      file: () => ({
        getSignedUrl: mockGetSignedUrl,
      }),
    }),
  };
}

const { createHandler } = await import('../index.js');
const generateUploadUrl = createHandler(createMockStorage());

function createReq(overrides = {}) {
  return {
    method: 'POST',
    body: {
      projectId: 'proj-123',
      filename: 'video.mp4',
      contentType: 'video/mp4',
    },
    ...overrides,
  };
}

function createRes() {
  return {
    _status: null,
    _body: null,
    _headers: {},
    set(key, value) { this._headers[key] = value; return this; },
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    send(body) { this._body = body; return this; },
  };
}

beforeEach(() => {
  mockGetSignedUrl.mockReset();
  mockGetSignedUrl.mockResolvedValue(['https://storage.googleapis.com/signed-url']);
});

// ─── T21.1: Valid request ───────────────────────────────────────────────────

describe('Valid Requests', () => {
  test('returns signed URL and GCS path for valid request', async () => {
    const req = createReq();
    const res = createRes();
    await generateUploadUrl(req, res);

    expect(res._body).toHaveProperty('url');
    expect(res._body.url).toContain('https://storage.googleapis.com');
    expect(res._body).toHaveProperty('gcsPath');
    expect(res._body.gcsPath).toContain('projects/proj-123/source_video/video.mp4');
  });

  test('signed URL uses v4 write action', async () => {
    const req = createReq();
    const res = createRes();
    await generateUploadUrl(req, res);

    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 'v4',
        action: 'write',
      }),
    );
  });

  test('signed URL expires in ~15 minutes', async () => {
    const req = createReq();
    const res = createRes();
    const before = Date.now();
    await generateUploadUrl(req, res);

    const callArgs = mockGetSignedUrl.mock.calls[0][0];
    expect(callArgs.expires).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    expect(callArgs.expires).toBeLessThanOrEqual(before + 16 * 60 * 1000);
  });

  test('GCS path follows contract: projects/{id}/source_video/{file}', async () => {
    const req = createReq();
    const res = createRes();
    await generateUploadUrl(req, res);

    expect(res._body.gcsPath).toMatch(/^gs:\/\/[^/]+\/projects\/proj-123\/source_video\/video\.mp4$/);
  });
});

// ─── T21.2: Path traversal rejection ────────────────────────────────────────

describe('Path Traversal Rejection', () => {
  test('rejects .. in projectId', async () => {
    const req = createReq({ body: { projectId: '../../../etc', filename: 'v.mp4', contentType: 'video/mp4' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('Invalid');
  });

  test('rejects .. in filename', async () => {
    const req = createReq({ body: { projectId: 'proj-1', filename: '../../passwd', contentType: 'video/mp4' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects / in projectId', async () => {
    const req = createReq({ body: { projectId: 'proj/evil', filename: 'v.mp4', contentType: 'video/mp4' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects / in filename', async () => {
    const req = createReq({ body: { projectId: 'proj-1', filename: 'sub/dir/v.mp4', contentType: 'video/mp4' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
  });
});

// ─── T21.3: Content type validation ─────────────────────────────────────────

describe('Content Type Validation', () => {
  test('rejects text/html', async () => {
    const req = createReq({ body: { projectId: 'p', filename: 'f.html', contentType: 'text/html' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('video');
  });

  test('rejects application/json', async () => {
    const req = createReq({ body: { projectId: 'p', filename: 'f.json', contentType: 'application/json' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
  });

  test('accepts video/mp4', async () => {
    const req = createReq({ body: { projectId: 'p', filename: 'f.mp4', contentType: 'video/mp4' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._body).toHaveProperty('url');
  });

  test('accepts video/webm', async () => {
    const req = createReq({ body: { projectId: 'p', filename: 'f.webm', contentType: 'video/webm' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._body).toHaveProperty('url');
  });
});

// ─── T21.4: CORS headers ────────────────────────────────────────────────────

describe('CORS Headers', () => {
  test('sets CORS headers on POST', async () => {
    const req = createReq();
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  test('handles OPTIONS preflight with 204', async () => {
    const req = createReq({ method: 'OPTIONS' });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(204);
  });

  test('rejects GET with 405', async () => {
    const req = createReq({ method: 'GET' });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(405);
  });
});

// ─── T21.5: Missing fields ──────────────────────────────────────────────────

describe('Missing Fields', () => {
  test('returns 400 for missing projectId', async () => {
    const req = createReq({ body: { filename: 'v.mp4', contentType: 'video/mp4' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('Missing');
  });

  test('returns 400 for missing filename', async () => {
    const req = createReq({ body: { projectId: 'p', contentType: 'video/mp4' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
  });

  test('returns 400 for missing contentType', async () => {
    const req = createReq({ body: { projectId: 'p', filename: 'v.mp4' } });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
  });

  test('returns 400 for empty body', async () => {
    const req = createReq({ body: {} });
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(400);
  });
});

// ─── GCS error handling ─────────────────────────────────────────────────────

describe('GCS Error Handling', () => {
  test('returns 500 when GCS fails to generate signed URL', async () => {
    mockGetSignedUrl.mockRejectedValue(new Error('GCS connection failed'));
    const req = createReq();
    const res = createRes();
    await generateUploadUrl(req, res);
    expect(res._status).toBe(500);
    expect(res._body.error).toContain('Failed');
  });
});
