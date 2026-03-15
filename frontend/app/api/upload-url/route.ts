import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const UPLOAD_FUNCTION_URL =
  process.env.UPLOAD_FUNCTION_URL ??
  process.env.NEXT_PUBLIC_UPLOAD_FUNCTION_URL ??
  'http://localhost:8081';

/**
 * Proxy to the GCS signed-URL Cloud Function with Clerk auth.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { projectId, filename, contentType } = body;

  if (!projectId || !filename || !contentType) {
    return NextResponse.json(
      { error: 'Missing required fields: projectId, filename, contentType' },
      { status: 400 },
    );
  }

  if (typeof projectId !== 'string' || projectId.length > 200 || /[.]{2}|[/\\]/.test(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 });
  }

  if (typeof filename !== 'string' || filename.length > 200 || /[.]{2}|[/\\]/.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const ALLOWED_CONTENT_TYPES = ['video/webm', 'video/mp4', 'video/quicktime', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${UPLOAD_FUNCTION_URL}/generate-upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, filename, contentType }),
    });

    if (!upstream.ok) {
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
