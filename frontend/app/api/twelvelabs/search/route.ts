import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth/firebase-admin';
import { verifyProjectOwnership } from '@/lib/stdb/stdb-server';
import { GoogleGenAI } from '@google/genai';

const STDB_BACKEND =
  process.env.STDB_BACKEND_URL ??
  process.env.NEXT_PUBLIC_STDB_BACKEND_URL ??
  'http://127.0.0.1:3000';
const DB_NAME = process.env.STDB_MODULE ?? process.env.NEXT_PUBLIC_STDB_MODULE ?? 'flowstudio';

interface Signal {
  id: string;
  projectId: string;
  mediaId: string;
  signalType: string;
  startTime: number;
  endTime: number;
  content: string;
  metadata?: string;
}

async function fetchSignals(projectId: string): Promise<{ signals: Signal[] } | { error: string }> {
  const res = await fetch(`${STDB_BACKEND}/v1/database/${DB_NAME}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `SELECT * FROM signals WHERE project_id = '${projectId}'`,
  });

  if (!res.ok) return { error: `Signal database unavailable (${res.status})` };

  const results = await res.json();
  if (!results?.[0]?.rows?.length) return { signals: [] };

  const { schema, rows } = results[0];
  const columns: string[] = schema.elements.map(
    (el: { name: { some: string } }) => {
      const raw = el.name.some;
      return raw.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    },
  );

  return {
    signals: (rows as unknown[][]).map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        const val = row[i];
        obj[col] = typeof val === 'bigint' ? Number(val) : val;
      });
      return obj as unknown as Signal;
    }),
  };
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuthToken(req);
  if (!authResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Search not configured (missing GOOGLE_AI_API_KEY)' },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    // Branch on call shape: projectId (media-panel) vs indexId (auto-enhance)
    const isMediaPanel = !!body.projectId;
    const projectId: string | undefined = body.projectId ?? body.indexId;

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId or indexId' }, { status: 400 });
    }

    // Verify project ownership
    const isOwner = await verifyProjectOwnership(projectId, authResult.uid);
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch signals from SpacetimeDB
    const result = await fetchSignals(projectId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    const signals = result.signals;
    if (signals.length === 0) {
      return NextResponse.json(isMediaPanel ? { results: [] } : { data: [] });
    }

    // Filter to relevant videoIds if provided
    let relevantSignals = signals;
    if (body.videoIds && Array.isArray(body.videoIds) && body.videoIds.length > 0) {
      relevantSignals = signals.filter((s) => body.videoIds.includes(s.mediaId));
    }

    if (relevantSignals.length === 0) {
      return NextResponse.json(isMediaPanel ? { results: [] } : { data: [] });
    }

    // Build context for Gemini
    const signalSummary = relevantSignals.map((s) => ({
      mediaId: s.mediaId,
      type: s.signalType,
      start: s.startTime,
      end: s.endTime,
      content: s.content,
    }));

    // Cap signals to avoid exceeding Gemini context window
    const MAX_SIGNALS = 500;
    if (signalSummary.length > MAX_SIGNALS) {
      signalSummary.length = MAX_SIGNALS;
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: JSON.stringify({
        query,
        signals: signalSummary,
      }),
      config: {
        systemInstruction:
          'You are a video search engine. Given a user query and a list of extracted signals ' +
          '(speech segments, scene descriptions, interactions) from video media, find the time ' +
          'ranges that best match the query. Return a JSON array of matches, each with: ' +
          '"mediaId" (string), "start" (number, seconds), "end" (number, seconds), ' +
          '"score" (number, 0-1 relevance). Order by score descending. Return at most 10 results. ' +
          'Return ONLY the JSON array, no other text.',
        temperature: 0.1,
      },
    });

    const raw = response.text?.trim() ?? '[]';
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    let matches: Array<{ mediaId: string; start: number; end: number; score: number }>;
    try {
      matches = JSON.parse(jsonStr);
      if (!Array.isArray(matches)) matches = [];
    } catch {
      console.warn('Failed to parse Gemini search response as JSON:', raw.slice(0, 200));
      matches = [];
    }

    if (isMediaPanel) {
      // media-panel expects { results: [{ videoId, start, end, rank }] }
      const results = matches.map((m, i) => ({
        videoId: m.mediaId,
        start: m.start,
        end: m.end,
        rank: i + 1,
      }));
      return NextResponse.json({ results });
    } else {
      // auto-enhance expects { data: [{ start, end, score }] }
      const data = matches.map((m) => ({
        start: m.start,
        end: m.end,
        score: m.score,
      }));
      return NextResponse.json({ data });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
