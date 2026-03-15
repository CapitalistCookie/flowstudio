import { NextRequest, NextResponse } from 'next/server';

const STDB_BACKEND =
  process.env.STDB_BACKEND_URL ?? process.env.NEXT_PUBLIC_STDB_BACKEND_URL ?? 'http://127.0.0.1:3000';

/**
 * Proxy requests to the local SpacetimeDB instance to avoid CORS when the
 * frontend runs on a different port (e.g. Next on 3001, SpacetimeDB on 3000).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const pathStr = path.join('/');
  const url = `${STDB_BACKEND}/${pathStr}`;

  try {
    const body = await request.text();
    const contentType = request.headers.get('content-type') ?? '';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...(contentType && { 'Content-Type': contentType }),
      },
      body: body || undefined,
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[STDB proxy]', err);
    return NextResponse.json(
      { error: 'SpacetimeDB proxy failed', details: String(err) },
      { status: 502 },
    );
  }
}
