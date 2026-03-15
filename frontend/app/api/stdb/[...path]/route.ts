import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth/firebase-admin';

const STDB_BACKEND =
  process.env.STDB_BACKEND_URL ??
  process.env.NEXT_PUBLIC_STDB_BACKEND_URL ??
  'http://127.0.0.1:3000';

/**
 * Proxies POST requests to SpacetimeDB, avoiding CORS issues
 * when the frontend runs on a different port.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const authResult = await verifyAuthToken(request);
  if (!authResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const stdbPath = resolvedParams.path.join('/');

  if (/[.]{2}/.test(stdbPath)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const ALLOWED_PREFIXES = ['database/', 'v1/'];
  if (!ALLOWED_PREFIXES.some((p) => stdbPath.startsWith(p))) {
    return NextResponse.json({ error: 'Forbidden path' }, { status: 403 });
  }

  // Block SQL and reducer call endpoints — only allow schema introspection
  if (stdbPath.includes('/sql') || stdbPath.includes('/call/')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = `${STDB_BACKEND}/${stdbPath}`;

  const contentType = request.headers.get('content-type') ?? 'application/json';
  const body = await request.text();

  const MAX_BODY_SIZE = 1024 * 1024;
  if (body.length > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  }

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });

    const responseText = await upstream.text();
    return new NextResponse(responseText, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `STDB proxy error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
