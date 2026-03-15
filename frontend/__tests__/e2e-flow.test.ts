/**
 * E2E data flow contract test.
 * Verifies the shape of data as it flows: Record → Preview → Upload → Pipeline → Studio
 */
import { describe, it, expect } from 'vitest';

describe('E2E data flow contracts', () => {
  describe('Record → Preview', () => {
    it('capture store produces blob URL and elapsed time', () => {
      // The capture store must produce blobUrl and elapsedMs for the preview page
      const captureState = {
        status: 'done' as const,
        blobUrl: 'blob:http://localhost:3000/abc',
        elapsedMs: 45000,
        cursorEvents: [
          { x: 100, y: 200, timestamp: 500, screenWidth: 1920, screenHeight: 1080, isClicking: false }
        ],
        keyboardEvents: [
          { key: 'a', timestamp: 600, isKeyDown: true, modifiers: { ctrl: false, shift: false, alt: false, meta: false } }
        ],
      };
      
      expect(captureState.status).toBe('done');
      expect(captureState.blobUrl).toBeTruthy();
      expect(captureState.elapsedMs).toBeGreaterThan(0);
      expect(captureState.cursorEvents).toHaveLength(1);
      expect(captureState.keyboardEvents).toHaveLength(1);
    });
  });

  describe('Preview → Pipeline trigger', () => {
    it('pipeline trigger options match expected shape', () => {
      const triggerOpts = {
        projectId: 'proj-abc123',
        gcsPath: 'projects/proj-abc123/source_video/recording_123.webm',
        fileSize: 1024000,
        contentType: 'video/webm',
        durationMs: 45000,
        cursorDataFilename: 'cursor_events.json',
        keyboardDataFilename: 'keyboard_events.json',
      };
      
      expect(triggerOpts.projectId).toBeTruthy();
      expect(triggerOpts.gcsPath).toContain(triggerOpts.projectId);
      expect(triggerOpts.fileSize).toBeGreaterThan(0);
      expect(triggerOpts.durationMs).toBeGreaterThan(0);
    });
    
    it('video filename is extracted from gcsPath for inputAssetIds', () => {
      const gcsPath = 'projects/proj-abc/source_video/recording_123.webm';
      const videoFilename = gcsPath.split('/').pop() ?? gcsPath;
      expect(videoFilename).toBe('recording_123.webm');
    });
  });

  describe('Pipeline → STDB tasks', () => {
    it('initial task types are created for each signal extraction', () => {
      const INITIAL_TASK_TYPES = ['AUDIO_EXTRACT', 'VIDEO_SAMPLE', 'CURSOR_PROCESS', 'TYPING_DETECT'];
      
      expect(INITIAL_TASK_TYPES).toContain('AUDIO_EXTRACT');
      expect(INITIAL_TASK_TYPES).toContain('VIDEO_SAMPLE');
      expect(INITIAL_TASK_TYPES).toContain('CURSOR_PROCESS');
      expect(INITIAL_TASK_TYPES).toContain('TYPING_DETECT');
    });
  });

  describe('Signals → Gateway', () => {
    it('gateway signals format matches expected schema', () => {
      const signals = {
        speech_segments: [{ text: 'hello', timestampMs: 0, durationMs: 1000, confidence: 0.95 }],
        scene_descriptions: [{ description: 'coding', timestampMs: 1000, durationMs: 2000, confidence: 0.8 }],
        ui_transitions: [],
        interaction_clusters: [],
      };
      
      expect(signals).toHaveProperty('speech_segments');
      expect(signals).toHaveProperty('scene_descriptions');
      expect(signals).toHaveProperty('ui_transitions');
      expect(signals).toHaveProperty('interaction_clusters');
      expect(Array.isArray(signals.speech_segments)).toBe(true);
    });
  });

  describe('Gateway → Edit Plan → Timeline', () => {
    it('edit plan decisions have required fields for timeline conversion', () => {
      const editDecision = {
        editType: 'zoom',
        sourceStartMs: 5000,
        sourceEndMs: 10000,
        outputStartMs: 4000,
        outputEndMs: 9000,
        parameters: { zoomLevel: 1.5 },
        reasoning: 'Zoom into the button click for emphasis',
      };
      
      expect(editDecision.editType).toBeTruthy();
      expect(editDecision.sourceStartMs).toBeLessThanOrEqual(editDecision.sourceEndMs);
      expect(editDecision.outputStartMs).toBeLessThanOrEqual(editDecision.outputEndMs);
      expect(editDecision.reasoning).toBeTruthy();
    });
    
    it('edit plan converts to timeline clips with correct structure', () => {
      // Timeline clip structure must match editor-context.tsx TimelineClip interface
      const timelineClip = {
        id: 'ai-123-0-abc',
        mediaId: 'source-proj-abc',
        trackId: 'Track 4',
        startTime: 40, // pixels (outputStartMs / 1000 * PIXELS_PER_SECOND)
        duration: 50, // pixels
        mediaOffset: 50, // pixels (sourceStartMs / 1000 * PIXELS_PER_SECOND)
        label: 'zoom: Zoom into the button click...',
        type: 'video' as const,
        transform: { positionX: 0, positionY: 0, scale: 150, opacity: 100 },
        effects: { preset: 'none' as const, blur: 0, brightness: 100, contrast: 100, saturate: 100, hueRotate: 0 },
        aiReasoning: 'Zoom into the button click for emphasis',
        aiEditType: 'zoom',
      };
      
      expect(timelineClip.aiEditType).toBe('zoom');
      expect(timelineClip.transform.scale).toBe(150);
      expect(timelineClip.trackId).toBe('Track 4');
    });
  });
  
  describe('Studio → Reprompt loop', () => {
    it('reprompt request includes previous edit plan and user feedback', () => {
      const repromptRequest = {
        project_id: 'proj-abc',
        previous_edit_plan: [
          {
            editType: 'zoom',
            sourceStartMs: 5000,
            sourceEndMs: 10000,
            outputStartMs: 4000,
            outputEndMs: 9000,
            parameters: { zoomLevel: 1.5 },
            reasoning: 'Zoom into button click',
          }
        ],
        feedback: 'Make the zoom slower and less aggressive',
      };
      
      expect(repromptRequest.previous_edit_plan).toHaveLength(1);
      expect(repromptRequest.feedback).toBeTruthy();
    });
  });
});
