# PLAN-20: GCS Path Contract Verification

**Objective:** Verify all 12 writer→reader GCS path pairs match correctly.

---

## The 12 Contracts

| # | Writer | Path Written | Reader | Path Read | Status |
|---|--------|-------------|--------|-----------|--------|
| 1 | Upload | `source_video/{filename}` | audio-extract | `source_video/{inputAssetId}` | ✅ (bug C4 fixed) |
| 2 | Upload | `source_video/{filename}` | video-sample | `source_video/{inputAssetId}` | ✅ |
| 3 | audio-extract | `audio_track/audio.wav` | speech-transcription | `audio_track/audio.wav` | ✅ Verify |
| 4 | video-sample | `frame_sample/frame-NNNN.jpg` | video-understanding | `frame_sample/{assetId}.jpg` | ✅ (bug C1 fixed) |
| 5 | video-sample | `frame_sample/frame-NNNN.jpg` | ui-change-detector | `frame_sample/frame-NNNN.jpg` | ✅ Verify |
| 6 | cursor-processor | `signals/cursor_movements.json` | interaction-pattern | `signals/cursor_movements.json` | ✅ (bug C2 fixed) |
| 7 | typing-detector | `signals/typing_events.json` | interaction-pattern | `signals/typing_events.json` | ✅ (bug C2 fixed) |
| 8 | speech-transcription | `signals/speech_segments.json` | intent-graph | `signals/speech_segments.json` | ✅ (bug C3 fixed) |
| 9 | video-understanding | `signals/scene_descriptions.json` | intent-graph | `signals/scene_descriptions.json` | ✅ Verify |
| 10 | ui-change-detector | `signals/ui_transitions.json` | intent-graph | `signals/ui_transitions.json` | ✅ Verify |
| 11 | interaction-pattern | `signals/interaction_clusters.json` | intent-graph | `signals/interaction_clusters.json` | ✅ Verify |
| 12 | timeline-builder | `timeline/timeline.json` | render | `timeline/timeline.json` | ✅ Verify |

---

## Automated Verification Script

```bash
#!/bin/bash
# verify-gcs-contracts.sh

echo "=== GCS Path Contract Verification ==="

# Extract all gcs.upload paths
echo "--- Writers ---"
grep -rn 'this.gcs.upload' packages/workers/ --include='*.ts' | \
  sed "s/.*\`\(.*\)\`.*/\1/"

# Extract all gcs.download paths  
echo "--- Readers ---"
grep -rn 'this.gcs.download' packages/workers/ --include='*.ts' | \
  sed "s/.*\`\(.*\)\`.*/\1/"

# Check for mismatches
echo "--- Signal file names ---"
grep -rn 'signals/' packages/workers/ --include='*.ts' | grep -E '\.(upload|download)' | sort

echo "=== Verification Complete ==="
```

---

## Test Cases

### T20.1 — Automated Grep Check
```bash
# Run the verification script
bash docs/plansV/verify-gcs-contracts.sh
# Manually inspect output for any mismatches
```

### T20.2 — Frame Naming Consistency
```bash
grep -rn 'frame-' packages/workers/ --include='*.ts'
# All references should use frame-NNNN (4-digit zero-padded)
```

### T20.3 — Signal File Naming Consistency
```bash
grep -rn "signals/" packages/workers/ --include='*.ts' | sort
# Each signal file should have exactly one writer and one reader
```

---

## Success Criteria
- All 12 writer→reader pairs verified
- No orphaned writers (files written but never read)
- No orphaned readers (files read but never written)
- Frame naming uses consistent `frame-NNNN` format everywhere
