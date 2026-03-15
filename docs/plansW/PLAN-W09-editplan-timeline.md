# PLAN-W09 — Edit Plan → Timeline Visualization

> **Problem**: Workers produce an edit plan (JSON), but the frontend timeline doesn't receive or display it. The timeline is currently local-only with manual clip placement.
> **Goal**: When the EDIT_PLAN task completes, the edit decisions appear as clips/markers on the frontend timeline automatically.

---

## Edit Plan Structure

From `packages/shared/src/schemas.ts`, the edit plan is:
```typescript
type EditDecision = {
  editType: "cut" | "trim" | "speedup" | "slowdown" | "zoom" | "pan" | "transition" | "overlay";
  sourceStartMs: number;
  sourceEndMs: number;
  outputStartMs: number;
  outputEndMs: number;
  params: Record<string, unknown>; // e.g., { speed: 1.5 } or { zoomLevel: 2.0, region: {...} }
};
```

## How Edits Map to Timeline

| Edit Type | Timeline Representation |
|-----------|------------------------|
| `cut` | Gap in video track (segment removed) |
| `trim` | Clip shortened (start/end adjusted) |
| `speedup` | Clip with speed badge, shorter duration |
| `slowdown` | Clip with speed badge, longer duration |
| `zoom` | Effect marker on effects track |
| `pan` | Effect marker on effects track |
| `transition` | Transition marker between clips |
| `overlay` | Item on overlay track |

---

## Architecture

### 1. Listen for EDIT_PLAN completion

Via STDB subscription (W-07) or polling:
```typescript
// In studio page or editor context
useEffect(() => {
  stdb.onTaskUpdate((task) => {
    if (task.taskType === "EDIT_PLAN" && task.status === "COMPLETED") {
      loadEditPlan(task.projectId);
    }
  });
}, []);
```

### 2. Fetch edit plan from GCS

```typescript
async function loadEditPlan(projectId: string): Promise<EditDecision[]> {
  const signedUrl = await getSignedDownloadUrl(`projects/${projectId}/signals/edit_plan.json`);
  const response = await fetch(signedUrl);
  return response.json();
}
```

### 3. Convert edit decisions to timeline clips

```typescript
function editPlanToTimelineClips(
  editPlan: EditDecision[],
  sourceVideoAsset: Asset
): TimelineClip[] {
  // Group by type
  // Video edits (cut, trim, speed) → video track clips
  // Effects (zoom, pan) → effects track markers
  // Transitions → transition track markers
  // Sort by outputStartMs
}
```

### 4. Apply to editor context

The existing `EditorContext` in `frontend/components/editor-context.tsx` manages:
- `clips` array
- `addClip()`, `updateClip()`, `removeClip()`

We add `applyEditPlan(plan: EditDecision[])` that:
1. Clears existing AI-generated clips (preserving manual edits)
2. Converts edit plan to clips
3. Adds them to the timeline
4. Updates playback duration

---

## Edit Plan Versioning

Per PLAN-26 (reprompt loop), edit plans are versioned:
- `edit_plan_v1.json`, `edit_plan_v2.json`, ...
- Each reprompt creates a new version
- Timeline shows the latest version
- User can switch between versions

Store version info:
```typescript
interface EditPlanVersion {
  version: number;
  editPlan: EditDecision[];
  feedback?: string; // User's reprompt message
  createdAt: number;
}
```

---

## Visual Design

### AI-generated clips look different from manual clips:
- Subtle border glow (AI badge)
- "AI" label on clip
- Different color tint
- Tooltip: "AI-generated edit — click to modify or remove"

### Pipeline progress overlay:
While the pipeline is running, show:
- "Analyzing your recording..." with progress bar
- Steps: Extracting → Transcribing → Understanding → Planning → Ready
- Each step lights up as it completes
- When EDIT_PLAN completes, clips animate onto timeline

---

## Test Plan

```typescript
describe("editPlanToTimelineClips", () => {
  it("converts cut edits to gaps in video track")
  it("converts trim edits to shortened clips")
  it("converts speedup edits to clips with speed property")
  it("converts zoom edits to effects track markers")
  it("sorts clips by outputStartMs")
  it("handles empty edit plan")
  it("preserves source time references for playback")
})

describe("applyEditPlan", () => {
  it("adds AI clips to editor context")
  it("does not remove user's manual clips")
  it("replaces previous AI clips on re-apply")
  it("updates total duration")
})

describe("Pipeline → Timeline flow", () => {
  it("loads edit plan when EDIT_PLAN task completes")
  it("shows loading overlay during pipeline")
  it("animates clips onto timeline when ready")
  it("shows version indicator for edit plan")
})
```

### Acceptance Criteria:
- [ ] When pipeline completes, edits appear on timeline within 2s
- [ ] AI-generated clips are visually distinct from manual clips
- [ ] Clips are positioned correctly based on outputStartMs/outputEndMs
- [ ] Effects (zoom, pan) appear on effects track
- [ ] User can remove individual AI edits
- [ ] Pipeline progress is visible during processing
