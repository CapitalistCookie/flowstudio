# PLAN-X22 — Implement Missing API Routes

> **Problem**: Several frontend components reference API routes that don't exist:
> 1. `/api/speech-to-text` — used by `inspector-panel.tsx` for voice input
> 2. `/api/refine-transcription` — used by `inspector-panel.tsx` for transcription refinement
> 3. `/api/kling` — used by `morph-transition.ts` for AI morph effects
> 4. `/api/twelvelabs/search` — used by `auto-enhance-modal.tsx` and `media-panel.tsx`
>
> **Impact**: Voice input, transcription refinement, AI morphs, and AI-powered search all fail silently or with 404 errors.

---

## Acceptance Criteria

- [ ] `/api/speech-to-text` accepts audio blob, returns transcription (via Deepgram)
- [ ] `/api/refine-transcription` accepts raw text, returns refined text (via Gemini)
- [ ] `/api/kling` returns a stub/placeholder (Kling API is external; document what's needed)
- [ ] `/api/twelvelabs/search` returns a stub/placeholder (TwelveLabs is optional)
- [ ] All routes have Clerk auth
- [ ] A test verifies each route returns the expected response structure

---

## Implementation

### `/api/speech-to-text/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const audio = formData.get('audio') as Blob;
  if (!audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 });

  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
  if (!DEEPGRAM_API_KEY) return NextResponse.json({ error: 'Deepgram not configured' }, { status: 503 });

  const buffer = Buffer.from(await audio.arrayBuffer());
  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': audio.type || 'audio/webm',
    },
    body: buffer,
  });

  const result = await response.json();
  const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  return NextResponse.json({ transcript });
}
```

### `/api/refine-transcription/route.ts`

Use Gemini to refine/clean up a raw transcription.

### `/api/kling/route.ts` and `/api/twelvelabs/search/route.ts`

Return 501 Not Implemented with a message explaining the dependency. These are nice-to-haves that require external API keys.

---

## Dependencies

- Valid `DEEPGRAM_API_KEY` in `.env`
- Valid `GOOGLE_AI_API_KEY` for transcription refinement
