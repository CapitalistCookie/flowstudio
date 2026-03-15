# PLAN-X27 — Export Pipeline with Real AI Edits

> **Problem**: The client-side Canvas/MediaRecorder export works for manually placed clips, and W-09/W-11 ensure AI clips are included. But the export doesn't handle:
> 1. Zoom/pan effects from AI edit decisions (the `parameters` field)
> 2. Speed changes (speedup/slowdown clips have different source vs output duration)
> 3. Transitions between clips
>
> The server-side `render` worker uses FFmpeg and could handle these, but there's no trigger path.
>
> **Impact**: Exported videos miss AI effects. A "zoom" clip exports as a normal clip without zoom.

---

## Acceptance Criteria

- [ ] Client-side export applies zoom parameters (scale + position)
- [ ] Client-side export handles speedup/slowdown (playback rate change)
- [ ] Server-side render can be triggered for HQ export
- [ ] A test verifies zoom clips render with correct canvas transform
- [ ] A test verifies speedup clips have shorter output duration

---

## Implementation

### Step 1: Enhance Canvas export to apply AI edit parameters

In `export-modal.tsx`, when rendering each clip:

```typescript
if (clip.aiEditType === 'zoom' && clip.parameters?.zoomLevel) {
  ctx.save();
  const zoom = clip.parameters.zoomLevel as number;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  // Draw frame
  ctx.restore();
}

if (clip.aiEditType === 'speedup' && clip.parameters?.speed) {
  videoElement.playbackRate = clip.parameters.speed as number;
}
```

### Step 2: Server-side render button

Add a "High Quality Export" option that calls `approveTimeline` (from X-17) to trigger the server-side render worker.

---

## Dependencies

- X-17 (approveTimeline reducer)
- X-26 (timeline has real AI clips)
