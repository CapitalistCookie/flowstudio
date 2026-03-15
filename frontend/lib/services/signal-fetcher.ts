'use client';

/**
 * Signal Fetcher — bridges worker pipeline signals to the gateway.
 *
 * Workers write signals to STDB (via writeSignal reducer). This module
 * queries STDB for all signals belonging to a project, groups them by
 * type, and formats them for the gateway's /api/v1/generate-edits endpoint.
 *
 * This is the critical bridge between Layer 2 (signal extraction) and
 * Layer 4 (agentic AI loop). See ARCHITECTURE.md §0.
 */

import { SignalType } from '@flowstudio/shared';
import { getConnection, isConnected } from '../stdb/spacetimedb';

export interface GatewaySignals {
  speech_segments: Record<string, unknown>[];
  scene_descriptions: Record<string, unknown>[];
  ui_transitions: Record<string, unknown>[];
  interaction_clusters: Record<string, unknown>[];
}

const SIGNAL_TYPE_MAP: Record<string, keyof GatewaySignals> = {
  [SignalType.SPEECH_SEGMENT]: 'speech_segments',
  [SignalType.SCENE_CHANGE]: 'scene_descriptions',
  [SignalType.UI_TRANSITION]: 'ui_transitions',
  [SignalType.INTERACTION_CLUSTER]: 'interaction_clusters',
};

export function signalTypeToGatewayField(signalType: string): string | undefined {
  return SIGNAL_TYPE_MAP[signalType];
}

export function parseSignalPayload(
  signal: { payload: string },
): Record<string, unknown> {
  try {
    return JSON.parse(signal.payload);
  } catch {
    return {};
  }
}

/**
 * Group raw STDB signals into the format the gateway expects.
 * Pure function — testable without STDB.
 */
export function groupSignalsForGateway(
  rawSignals: Array<{
    signalType: string;
    payload: string;
    timestampMs: number;
    durationMs: number;
    confidence: number;
  }>,
): GatewaySignals {
  const result: GatewaySignals = {
    speech_segments: [],
    scene_descriptions: [],
    ui_transitions: [],
    interaction_clusters: [],
  };

  for (const signal of rawSignals) {
    const field = SIGNAL_TYPE_MAP[signal.signalType];
    if (!field) continue;

    const payload = parseSignalPayload(signal);
    result[field].push({
      ...payload,
      timestampMs: signal.timestampMs,
      durationMs: signal.durationMs,
      confidence: signal.confidence,
    });
  }

  return result;
}

/**
 * Fetch all signals for a project from the SDK's in-memory cache.
 */
export function fetchProjectSignals(
  projectId: string,
): GatewaySignals {
  const projectSignals: Array<{
    signalType: string;
    payload: string;
    timestampMs: number;
    durationMs: number;
    confidence: number;
  }> = [];

  if (isConnected()) {
    try {
      const conn = getConnection();
      for (const row of conn.db.signals.iter()) {
        if (row.projectId === projectId) {
          projectSignals.push({
            signalType: row.signalType,
            payload: row.payload,
            timestampMs: Number(row.timestampMs),
            durationMs: Number(row.durationMs),
            confidence: Number(row.confidence),
          });
        }
      }
    } catch {
      // Connection not ready
    }
  }

  return groupSignalsForGateway(projectSignals);
}

/**
 * Check if a project has enough signals for meaningful AI planning.
 */
export function hasMinimumSignals(signals: GatewaySignals): boolean {
  const total =
    signals.speech_segments.length +
    signals.scene_descriptions.length +
    signals.ui_transitions.length +
    signals.interaction_clusters.length;
  return total > 0;
}
