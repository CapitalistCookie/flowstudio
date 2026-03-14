# PLAN-26: Non-Destructive Edit Timeline & Re-prompt Loop

**Objective:** Enable the "Cursor for video editing" experience — user sees an unrendered edit plan, can reprompt the AI to modify it, and only renders when satisfied.

---

## Current State

The pipeline is fire-and-forget:
1. Upload video → extract signals → build intent → plan edits → render → done
2. No way for users to see/modify edits before rendering
3. No re-prompt capability
4. Rendering is the most expensive step (FFmpeg, CPU-heavy)

## Desired Flow

```
Upload → Extract Signals → Build Intent → Plan Edits
                                              ↓
                                    Show Edit Plan (preview)
                                              ↓
                              ┌─── User accepts → Render → Done
                              │
                              └─── User reprompts → "Make intro faster, add zoom at 0:45"
                                              ↓
                                    Re-run Edit Agent with feedback
                                              ↓
                                    Show Updated Edit Plan → repeat
```

## Architecture Changes

### 1. Pause Before Render
Modify the DAG so `TIMELINE_BUILD` doesn't auto-chain to `RENDER`. Instead:
- `TIMELINE_BUILD` completes → project enters `preview` state
- User reviews the timeline in the frontend
- User clicks "Render" OR "Reprompt" 
- "Render" creates the RENDER task manually
- "Reprompt" calls the Railtracks gateway `/api/v1/reprompt`

### 2. Non-Destructive Edit Storage
Edit plans are already non-destructive (they reference source video timestamps, not modified video). The key insight:

```
Source Video (never modified) + Edit Plan (JSON) = Rendered Output
```

Each reprompt creates a new version of the edit plan:
```
edit_plan_v1.json → user says "too long"
edit_plan_v2.json → user says "add zoom at 0:45"
edit_plan_v3.json → user accepts → render
```

### 3. SpacetimeDB Changes
```typescript
// New reducer: userApproveTimeline
// Creates RENDER task
@reducer
function userApproveTimeline(projectId: string): void {
  // Find TIMELINE_BUILD task for this project
  // Create RENDER task with timeline as input
}

// New reducer: userRepromptEdits
// Calls Railtracks gateway
@reducer
function userRepromptEdits(projectId: string, feedback: string): void {
  // Store feedback
  // Call Railtracks gateway /api/v1/reprompt
  // Create new EDIT_PLAN task with feedback in config
}
```

### 4. DAG Modification
```typescript
// Before:
TIMELINE_BUILD: [RENDER]

// After:
TIMELINE_BUILD: []  // Stop here, wait for user
// RENDER created manually by userApproveTimeline reducer
```

## Test Cases

### T26.1 — Pipeline Pauses at Timeline
```typescript
test('TIMELINE_BUILD completion does NOT create RENDER', () => {});
```

### T26.2 — User Approve Creates Render
```typescript
test('userApproveTimeline creates RENDER task', () => {});
```

### T26.3 — Reprompt Flow
```typescript
test('reprompt creates new edit plan version', async () => {
  // Original edit plan → user feedback → modified edit plan
  // Verify: new edit_plan JSON written to GCS
});
```

### T26.4 — Edit Plan Versioning
```typescript
test('multiple reprompts create versioned edit plans', () => {
  // edit_plan_v1.json, edit_plan_v2.json, etc.
});
```

### T26.5 — Source Video Never Modified
```typescript
test('source video remains unchanged through all reprompts', () => {
  // Verify source_video file in GCS is never overwritten
});
```

---

## Success Criteria
- Pipeline pauses at timeline stage
- User can preview edit plan before rendering
- Reprompt modifies edit plan without re-running signal extraction
- Source video is never modified (non-destructive)
- Multiple reprompt iterations create versioned edit plans
- Final render uses the accepted version
