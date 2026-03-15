# PLAN-W14 — End-to-End Tests & Demo Script

> **Problem**: No automated verification that the full flow works. No rehearsed demo.
> **Goal**: Automated E2E test suite + scripted 2-minute demo.

---

## E2E Test Suite

### Test: Full Pipeline (Automated)

```typescript
describe("E2E: Upload → Edit Plan", () => {
  it("creates project, uploads video, and pipeline produces edit plan", async () => {
    // 1. Create project via STDB
    const projectId = await createProject("E2E Test");

    // 2. Upload test video (short 30s screen recording)
    await uploadVideo(projectId, TEST_VIDEO_PATH);

    // 3. Wait for pipeline completion (timeout 120s)
    await waitForTaskCompletion(projectId, "EDIT_PLAN", 120_000);

    // 4. Verify edit plan exists in GCS
    const editPlan = await downloadEditPlan(projectId);
    expect(editPlan).toBeInstanceOf(Array);
    expect(editPlan.length).toBeGreaterThan(0);

    // 5. Verify each edit has required fields
    for (const edit of editPlan) {
      expect(edit.editType).toBeDefined();
      expect(edit.sourceStartMs).toBeGreaterThanOrEqual(0);
      expect(edit.sourceEndMs).toBeGreaterThan(edit.sourceStartMs);
    }
  });
});

describe("E2E: Reprompt", () => {
  it("modifies edit plan based on user feedback", async () => {
    // 1. Get existing edit plan from previous test
    const editPlan = await downloadEditPlan(projectId);

    // 2. Send reprompt
    const response = await fetch(`${GATEWAY_URL}/api/v1/reprompt`, {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        previous_edit_plan: editPlan,
        feedback: "Add a zoom at the 10 second mark",
      }),
    });

    const result = await response.json();
    expect(result.edit_plan).toBeInstanceOf(Array);

    // 3. Verify zoom edit exists near 10s
    const zoomEdit = result.edit_plan.find(
      (e: any) => e.editType === "zoom" && e.sourceStartMs < 12000
    );
    expect(zoomEdit).toBeDefined();
  });
});
```

### Test: Frontend Integration (Playwright)

```typescript
test("Record → Upload → See edits on timeline", async ({ page }) => {
  // 1. Sign in
  await page.goto("/sign-in");
  await page.fill('[name="email"]', TEST_EMAIL);
  await page.fill('[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // 2. Upload a video file
  await page.goto("/dashboard");
  await page.click("text=New Project");
  await page.setInputFiles('input[type="file"]', TEST_VIDEO_PATH);

  // 3. Wait for pipeline progress
  await page.waitForSelector('[data-testid="pipeline-status"]');
  await page.waitForSelector('[data-testid="pipeline-complete"]', { timeout: 120_000 });

  // 4. Verify clips on timeline
  const clips = await page.$$('[data-testid="ai-clip"]');
  expect(clips.length).toBeGreaterThan(0);

  // 5. Send reprompt
  await page.fill('[data-testid="chat-input"]', "Zoom in at 0:10");
  await page.click('[data-testid="chat-send"]');

  // 6. Wait for updated timeline
  await page.waitForSelector('[data-testid="ai-clip-zoom"]', { timeout: 30_000 });
});
```

---

## Demo Script (2 minutes)

### Slide 1: Problem (15s)
"Every product team records demos. Editing takes hours. FlowStudio makes it automatic."

### Live Demo (90s):

**Step 1 (20s)**: Open FlowStudio → Dashboard. Show a pre-processed project.
"Here's a recording I made earlier. FlowStudio already analyzed it."

**Step 2 (15s)**: Click into Studio. Show timeline with AI edits.
"The AI identified key moments, cut dead time, and added zoom effects."

**Step 3 (20s)**: Show chat sidebar. Type: "Zoom in deeper at 0:50 on the button click"
"But like Cursor for code, I can tell the AI to make changes."

**Step 4 (15s)**: Show timeline update with new zoom.
"The AI re-planned the edits. New version applied."

**Step 5 (10s)**: Type: "Speed up the typing section from 1:00 to 1:20"
Show another update.

**Step 6 (10s)**: Click Export. Show download.
"One click export with all edits applied."

### Slide 2: Architecture (15s)
Show the 6-layer architecture diagram. Highlight Railtracks.
"Built on Railtracks for agent observability. SpacetimeDB for real-time state."

### Slide 3: Railtracks Viz (15s)
Show `railtracks viz` with a completed run.
"Every agent decision is traceable. Token usage, latency, step-by-step."

---

## Pre-baked Demo Data

For a reliable demo, pre-process a video so the pipeline is already complete:
1. Record a 90-second screen demo
2. Run through full pipeline
3. Save the GCS artifacts
4. Pre-load into STDB

This way the "live" part is just the reprompt (fast, 3-5s).

---

## Test Plan

### Acceptance Criteria:
- [ ] E2E test passes: upload → edit plan in < 120s
- [ ] E2E reprompt test passes: feedback → modified plan in < 10s
- [ ] Playwright test passes: sign in → upload → timeline → reprompt
- [ ] Demo runs smoothly in < 2 minutes
- [ ] Pre-baked demo data loads correctly
- [ ] `railtracks viz` shows demo runs
