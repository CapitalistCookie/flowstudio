import { TaskType, SignalType } from '@flowstudio/shared';
import { BaseWorker, type TaskData, type TaskResult } from '@flowstudio/worker-shared';

interface EditDecision {
  signalType: string;
  timestampMs: number;
  durationMs: number;
  payload: {
    editType: string;
    sourceStartMs: number;
    sourceEndMs: number;
    outputStartMs: number;
    outputEndMs: number;
    parameters: Record<string, unknown>;
  };
}

interface TimelineClip {
  trackIndex: number;
  trackType: 'video' | 'audio' | 'overlay' | 'text';
  clipId: string;
  startMs: number;
  endMs: number;
  sourceAssetId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  effects: Array<{ type: string; params: Record<string, unknown> }>;
}

export class TimelineBuilderWorker extends BaseWorker {
  readonly taskType = TaskType.TIMELINE_BUILD;

  async processTask(task: TaskData): Promise<TaskResult> {
    const editPath = `projects/${task.projectId}/signals/edit_plan.json`;
    const editData = await this.gcs.download(editPath);
    const editDecisions: EditDecision[] = JSON.parse(editData.toString('utf-8'));

    // Get source video path from STDB (fallback to GCS list)
    const sourceVideoPath = await this.getSourceVideoPath(task.projectId);
    const sourceAssetId = sourceVideoPath.split('/').pop() ?? 'source';

    // Sort edits by output start time
    editDecisions.sort((a, b) => a.payload.outputStartMs - b.payload.outputStartMs);

    const videoClips: TimelineClip[] = [];
    const audioClips: TimelineClip[] = [];
    let clipCounter = 0;

    for (const edit of editDecisions) {
      const p = edit.payload;
      const clipId = `clip-${String(clipCounter++).padStart(4, '0')}`;
      const effects: Array<{ type: string; params: Record<string, unknown> }> = [];

      // Build effects from edit type
      switch (p.editType) {
        case 'speedup':
        case 'slowdown':
          effects.push({
            type: 'speed',
            params: { rate: (p.parameters.speed as number) ?? (p.editType === 'speedup' ? 2.0 : 0.5) },
          });
          break;
        case 'zoom':
          effects.push({
            type: 'zoom',
            params: { level: (p.parameters.zoomLevel as number) ?? 1.5 },
          });
          break;
        case 'pan':
          effects.push({
            type: 'pan',
            params: p.parameters,
          });
          break;
        case 'transition':
          effects.push({
            type: 'transition',
            params: { transitionType: (p.parameters.transitionType as string) ?? 'crossfade', durationMs: 500 },
          });
          break;
      }

      // Video track clip
      videoClips.push({
        trackIndex: 0,
        trackType: 'video',
        clipId,
        startMs: p.outputStartMs,
        endMs: p.outputEndMs,
        sourceAssetId,
        sourceStartMs: p.sourceStartMs,
        sourceEndMs: p.sourceEndMs,
        effects,
      });

      // Corresponding audio clip (unless it's a visual-only edit)
      if (p.editType !== 'zoom' && p.editType !== 'pan' && p.editType !== 'overlay') {
        audioClips.push({
          trackIndex: 1,
          trackType: 'audio',
          clipId: `${clipId}-audio`,
          startMs: p.outputStartMs,
          endMs: p.outputEndMs,
          sourceAssetId: `audio-${task.projectId}`,
          sourceStartMs: p.sourceStartMs,
          sourceEndMs: p.sourceEndMs,
          effects: p.editType === 'speedup' || p.editType === 'slowdown'
            ? [{ type: 'speed', params: { rate: (p.parameters.speed as number) ?? (p.editType === 'speedup' ? 2.0 : 0.5) } }]
            : [],
        });
      }
    }

    // Convert to signals
    const allClips = [...videoClips, ...audioClips];
    const signals: TaskResult['signals'] = allClips.map(clip => ({
      signalType: SignalType.TIMELINE_EVENT,
      timestampMs: clip.startMs,
      durationMs: clip.endMs - clip.startMs,
      confidence: 1.0,
      payload: {
        trackIndex: clip.trackIndex,
        trackType: clip.trackType,
        clipId: clip.clipId,
        startMs: clip.startMs,
        endMs: clip.endMs,
        sourceAssetId: clip.sourceAssetId,
        effects: clip.effects,
      },
    }));

    // Save timeline to GCS
    const timelinePath = `projects/${task.projectId}/timeline/timeline.json`;
    const timeline = { videoTrack: videoClips, audioTrack: audioClips };
    await this.gcs.upload(timelinePath, Buffer.from(JSON.stringify(timeline, null, 2)), 'application/json');

    return { outputAssetIds: [`timeline-${task.projectId}`], signals };
  }
}
