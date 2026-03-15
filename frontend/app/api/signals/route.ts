import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const STDB_BACKEND =
  process.env.STDB_BACKEND_URL ??
  process.env.NEXT_PUBLIC_STDB_BACKEND_URL ??
  'http://127.0.0.1:3000';
const DB_NAME = process.env.STDB_MODULE ?? process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  try {
    const url = `${STDB_BACKEND}/v1/database/${DB_NAME}/sql`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `SELECT * FROM signals`,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `STDB query failed: ${res.status}` },
        { status: 502 },
      );
    }

    const results = await res.json();
    if (!results?.[0]) {
      return NextResponse.json({ signals: [] });
    }

    const { schema, rows } = results[0];
    const columns: string[] = schema.elements.map(
      (el: { name: { some: string } }) => {
        const raw = el.name.some;
        return raw.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
      },
    );

    const allSignals = (rows as unknown[][]).map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        const val = row[i];
        obj[col] = typeof val === 'bigint' ? Number(val) : val;
      });
      return obj;
    });

    const projectSignals = allSignals.filter((s) => s.projectId === projectId);

    return NextResponse.json({ signals: projectSignals });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
