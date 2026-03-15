import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth/firebase-admin';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: NextRequest) {
  const authResult = await verifyAuthToken(req);
  if (!authResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Transcription refinement not configured (missing GOOGLE_AI_API_KEY)' },
      { status: 503 },
    );
  }

  try {
    const { transcription } = await req.json();
    if (!transcription || typeof transcription !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid transcription' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: transcription,
      config: {
        systemInstruction:
          'You are a transcription editor. Clean up the raw speech transcription provided. ' +
          'Fix grammar and punctuation. Remove filler words like "um", "uh", "like", "you know". ' +
          'Preserve the original meaning and intent. Return only the cleaned text, nothing else.',
        temperature: 0.1,
      },
    });

    const text = response.text?.trim() ?? '';
    if (!text) {
      console.warn('Gemini returned empty text for transcription refinement (possible safety filter)');
    }
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
