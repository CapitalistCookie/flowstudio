import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth/firebase-admin';
import { GoogleGenAI } from '@google/genai';

async function fetchImageAsBase64(url: string): Promise<{ bytes: string; mimeType: string }> {
  // Validate URL scheme to prevent SSRF
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid image URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP(S) image URLs are allowed');
  }

  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return { bytes: buffer.toString('base64'), mimeType: contentType.split(';')[0] };
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAuthToken(req);
  if (!authResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = process.env.VERTEX_PROJECT_ID ?? process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_REGION ?? process.env.GCP_REGION ?? 'us-central1';

  if (!projectId) {
    return NextResponse.json(
      { error: 'Video generation not configured (missing GCP_PROJECT_ID)' },
      { status: 503 },
    );
  }

  try {
    const { startImageUrl, endImageUrl, durationSeconds: rawDuration } = await req.json();

    if (!startImageUrl || !endImageUrl) {
      return NextResponse.json({ error: 'Missing startImageUrl or endImageUrl' }, { status: 400 });
    }

    const durationSeconds = typeof rawDuration === 'number' && rawDuration > 0 && rawDuration <= 60
      ? Math.round(rawDuration)
      : 5;

    // Download both frame images
    const [startFrame, endFrame] = await Promise.all([
      fetchImageAsBase64(startImageUrl),
      fetchImageAsBase64(endImageUrl),
    ]);

    const ai = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location,
    });

    // Generate video using Veo with first-and-last-frame interpolation
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-001',
      source: {
        prompt: 'Smoothly interpolate between the start and end frames with natural motion.',
        image: {
          imageBytes: startFrame.bytes,
          mimeType: startFrame.mimeType,
        },
      },
      config: {
        lastFrame: {
          imageBytes: endFrame.bytes,
          mimeType: endFrame.mimeType,
        },
        durationSeconds,
        numberOfVideos: 1,
      },
    });

    // Poll until complete (up to 4 minutes)
    const maxWaitMs = 240_000;
    const startTime = Date.now();
    while (!operation.done && Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (!operation.done) {
      return NextResponse.json({ error: 'Video generation timed out' }, { status: 504 });
    }

    if (operation.error) {
      return NextResponse.json(
        { error: `Video generation failed: ${JSON.stringify(operation.error)}` },
        { status: 502 },
      );
    }

    const generated = operation.response?.generatedVideos?.[0];
    if (!generated?.video) {
      return NextResponse.json({ error: 'No video generated' }, { status: 502 });
    }

    // Prefer base64 (universally accessible) over GCS URI (needs auth)
    if (generated.video.videoBytes) {
      const mime = generated.video.mimeType ?? 'video/mp4';
      const dataUrl = `data:${mime};base64,${generated.video.videoBytes}`;
      return NextResponse.json({ videoUrl: dataUrl });
    }

    if (generated.video.uri) {
      return NextResponse.json({ videoUrl: generated.video.uri });
    }

    return NextResponse.json({ error: 'No video output available' }, { status: 502 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
