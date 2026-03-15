import { describe, it, expect } from 'vitest';
import { serializeReducerArgs, reducerToSnakeCase, REDUCER_PARAMS } from '../src/stdb-reducers';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('STDB HTTP call format', () => {
  describe('serializeReducerArgs', () => {
    it('createProject serializes to positional JSON array', () => {
      const args = { name: 'Test Project', ownerId: 'user-1', metadata: '{}' };
      const result = JSON.parse(serializeReducerArgs('createProject', args));
      expect(result).toEqual(['Test Project', 'user-1', '{}']);
    });

    it('createAsset includes all 7 fields in correct order', () => {
      const args = {
        projectId: 'p1',
        assetType: 'source_video',
        gcsPath: 'projects/p1/source_video/rec.webm',
        sizeBytes: 1024,
        mimeType: 'video/webm',
        durationMs: 30000,
        metadata: '{}',
      };
      const result = JSON.parse(serializeReducerArgs('createAsset', args));
      expect(result).toHaveLength(7);
      expect(result[0]).toBe('p1');
      expect(result[1]).toBe('source_video');
      expect(result[5]).toBe(30000);
    });

    it('createTask serializes with string inputAssetIds', () => {
      const args = {
        projectId: 'p1',
        taskType: 'AUDIO_EXTRACT',
        inputAssetIds: '["video.webm"]',
        config: '{}',
        maxRetries: 3,
      };
      const result = JSON.parse(serializeReducerArgs('createTask', args));
      expect(result).toEqual(['p1', 'AUDIO_EXTRACT', '["video.webm"]', '{}', 3]);
    });

    it('writeSignal includes all 7 fields in correct order', () => {
      const args = {
        projectId: 'p1',
        taskId: 't1',
        signalType: 'SPEECH_SEGMENT',
        timestampMs: 5000,
        durationMs: 2000,
        confidence: 0.95,
        payload: '{"text":"hello"}',
      };
      const result = JSON.parse(serializeReducerArgs('writeSignal', args));
      expect(result).toEqual(['p1', 't1', 'SPEECH_SEGMENT', 5000, 2000, 0.95, '{"text":"hello"}']);
    });

    it('completeTask has exactly 2 fields', () => {
      const args = { taskId: 't1', outputAssetIds: '["audio-p1"]' };
      const result = JSON.parse(serializeReducerArgs('completeTask', args));
      expect(result).toEqual(['t1', '["audio-p1"]']);
    });

    it('throws on unknown reducer', () => {
      expect(() => serializeReducerArgs('nonExistent', {})).toThrow('Unknown reducer');
    });

    it('throws on missing required parameter', () => {
      expect(() => serializeReducerArgs('createProject', { name: 'Test' })).toThrow(
        'Missing required parameter "ownerId"',
      );
    });
  });

  describe('reducerToSnakeCase', () => {
    it('converts camelCase to snake_case', () => {
      expect(reducerToSnakeCase('createProject')).toBe('create_project');
      expect(reducerToSnakeCase('findAndClaimTask')).toBe('find_and_claim_task');
      expect(reducerToSnakeCase('toggleProjectStar')).toBe('toggle_project_star');
    });

    it('handles already lowercase names', () => {
      expect(reducerToSnakeCase('init')).toBe('init');
    });
  });

  describe('REDUCER_PARAMS consistency with stdb-module', () => {
    it('covers all reducers defined in stdb-module/src/index.ts', () => {
      const moduleSource = readFileSync(
        resolve(__dirname, '../../stdb-module/src/index.ts'),
        'utf-8',
      );

      const reducerNameRegex = /stdb\.reducer\(\s*"(\w+)"/g;
      const moduleReducers: string[] = [];
      let match;
      while ((match = reducerNameRegex.exec(moduleSource)) !== null) {
        moduleReducers.push(match[1]);
      }

      for (const name of moduleReducers) {
        expect(REDUCER_PARAMS).toHaveProperty(
          name,
          expect.any(Array),
        );
      }
    });

    it('parameter count matches stdb-module definition for each reducer', () => {
      const moduleSource = readFileSync(
        resolve(__dirname, '../../stdb-module/src/index.ts'),
        'utf-8',
      );

      const reducerBlockRegex =
        /stdb\.reducer\(\s*"(\w+)",\s*\{([^}]+)\}/g;
      let match;
      while ((match = reducerBlockRegex.exec(moduleSource)) !== null) {
        const name = match[1];
        const paramsBlock = match[2];
        const paramNames = paramsBlock
          .split(',')
          .map((p) => p.trim().split(':')[0].trim())
          .filter(Boolean);

        const registryParams = REDUCER_PARAMS[name];
        if (!registryParams) continue;

        expect(registryParams).toHaveLength(paramNames.length);
        expect([...registryParams]).toEqual(paramNames);
      }
    });
  });
});
