import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
  if (!DEEPGRAM_API_KEY) {
    return NextResponse.json(
      { error: 'Speech-to-text not configured (missing DEEPGRAM_API_KEY)' },
      { status: 503 },
    );
  }

  try {
    const formData = await req.formData();
    const audio = formData.get('audio') as Blob | null;
    if (!audio) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());

    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': audio.type || 'audio/webm',
        },
        body: buffer,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Deepgram error: ${response.status} ${text}` },
        { status: 502 },
      );
    }

    const result = await response.json();
    const transcript =
      result.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

    return NextResponse.json({ transcript });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
