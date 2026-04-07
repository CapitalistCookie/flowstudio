import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth/firebase-admin';
import { verifyProjectOwnership } from '@/lib/stdb/stdb-server';

const UPLOAD_FUNCTION_URL =
  process.env.UPLOAD_FUNCTION_URL ??
  process.env.NEXT_PUBLIC_UPLOAD_FUNCTION_URL ??
  'http://localhost:8081';

/**
 * Proxy to the GCS signed-URL Cloud Function with Firebase auth.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  console.log('[upload-url] Auth header present:', !!authHeader, 'starts with Bearer:', authHeader?.startsWith('Bearer ') ?? false, 'token length:', authHeader ? authHeader.length - 7 : 0);
  console.log('[upload-url] FIREBASE_SERVICE_ACCOUNT_KEY set:', !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'length:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length ?? 0);

  const authResult = await verifyAuthToken(request);
  console.log('[upload-url] authResult:', authResult ? `uid=${authResult.uid}` : 'null');
  if (!authResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { projectId, filename, contentType, folder } = body;

  console.log('[upload-url] body parsed:', { projectId, filename, contentType, folder });
  if (!projectId || !filename || !contentType) {
    return NextResponse.json(
      { error: 'Missing required fields: projectId, filename, contentType' },
      { status: 400 },
    );
  }

  if (typeof projectId !== 'string' || projectId.length > 200 || /[.]{2}|[/\\]/.test(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 });
  }

  // Verify the caller owns this project
  const isOwner = await verifyProjectOwnership(projectId, authResult.uid);
  console.log('[upload-url] ownership check:', isOwner);
  if (!isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  console.log('[upload-url] UPLOAD_FUNCTION_URL:', UPLOAD_FUNCTION_URL);

  if (typeof filename !== 'string' || filename.length > 200 || /[.]{2}|[/\\]/.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const ALLOWED_CONTENT_PREFIXES = ['video/', 'audio/', 'image/', 'application/json'];
  if (!ALLOWED_CONTENT_PREFIXES.some(prefix => contentType === prefix || contentType.startsWith(prefix))) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
  }

  try {
    const upstreamHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      upstreamHeaders['Authorization'] = authHeader;
    }

    const upstream = await fetch(`${UPLOAD_FUNCTION_URL}/generate-upload-url`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify({ projectId, filename, contentType, folder }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text();
      console.error(`[upload-url] Upstream error: status=${upstream.status} body=${errBody.slice(0, 200)}`);
      return NextResponse.json(
        { error: `Upload function error: ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const data = await upstream.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: `Upload proxy error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
