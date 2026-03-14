import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

const SIGNAL_FILE_MAP: Record<string, string> = {
  speech_segments: 'speech_segments.json',
  scene_descriptions: 'scene_descriptions.json',
  ui_transitions: 'ui_transitions.json',
  interaction_clusters: 'interaction_clusters.json',
  intent_graph: 'intent_graph.json',
  narrative_plan: 'narrative_plan.json',
  edit_plan: 'edit_plan.json',
};

// Singleton GCS client — reuse across requests
const storage = new Storage();

function checkAuth(request: NextRequest): NextResponse | null {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: 'ADMIN_API_KEY not configured' }, { status: 503 });
  }
  const provided = request.headers.get('x-admin-key');
  if (provided !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const type = searchParams.get('type');

    if (!projectId || !type) {
      return NextResponse.json(
        { error: 'Missing projectId or type parameter' },
        { status: 400 }
      );
    }

    // Validate projectId format to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      return NextResponse.json(
        { error: 'Invalid projectId format — only alphanumeric, hyphens, and underscores allowed' },
        { status: 400 }
      );
    }

    const filename = SIGNAL_FILE_MAP[type];
    if (!filename) {
      return NextResponse.json(
        { error: `Unknown signal type: ${type}. Valid: ${Object.keys(SIGNAL_FILE_MAP).join(', ')}` },
        { status: 400 }
      );
    }

    const bucket = process.env.GCS_BUCKET ?? '';
    const gcsPath = `projects/${projectId}/signals/${filename}`;

    const [content] = await storage.bucket(bucket).file(gcsPath).download();
    const data = JSON.parse(content.toString('utf-8'));

    return NextResponse.json({ data, path: gcsPath });
  } catch {
    // Sanitize error — do not leak GCS paths or bucket names
    return NextResponse.json({ error: 'Failed to load signal data' }, { status: 500 });
  }
}
