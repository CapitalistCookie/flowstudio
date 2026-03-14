'use client';

import { useMemo } from 'react';
import { useSignalStore, useTimelineStore } from '@/hooks/useStores';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { formatTimecode } from '@/lib/utils';
import { Zap } from 'lucide-react';

/**
 * Shows signals linked to clips on the timeline.
 * Enables signal↔clip linking for AI-generated edit points.
 */
export function SignalOverlay() {
  const signals = useSignalStore((s) => s.signals);
  const selectedSignalId = useSignalStore((s) => s.selectedSignalId);
  const selectSignal = useSignalStore((s) => s.selectSignal);
  const clips = useTimelineStore((s) => s.clips);

  // Signals linked to clips
  const linkedSignals = useMemo(() => {
    const clipSignalIds = new Set(clips.map((c) => c.signalId).filter(Boolean));
    return signals.filter((s) => clipSignalIds.has(s.id));
  }, [signals, clips]);

  // Unlinked signals (available for linking)
  const unlinkedSignals = useMemo(() => {
    const clipSignalIds = new Set(clips.map((c) => c.signalId).filter(Boolean));
    return signals.filter((s) => !clipSignalIds.has(s.id));
  }, [signals, clips]);

  if (signals.length === 0) return null;

  return (
    <div
      className="rounded-lg p-3"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-3.5 w-3.5" style={{ color: 'var(--color-warning)' }} />
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
          Signals ({signals.length})
        </h4>
      </div>

      <ScrollArea className="max-h-40">
        <div className="space-y-1">
          {signals.map((signal) => {
            const isLinked = linkedSignals.some((ls) => ls.id === signal.id);
            const isSelected = selectedSignalId === signal.id;

            return (
              <button
                key={signal.id}
                onClick={() => selectSignal(isSelected ? null : signal.id)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-white/5"
                style={{
                  backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.15)' : undefined,
                }}
              >
                <span className="truncate flex-1 text-left">
                  {signal.signalType.replace(/_/g, ' ')}
                </span>
                <span style={{ color: 'var(--color-muted)' }}>
                  {formatTimecode(signal.timestampMs)}
                </span>
                {isLinked && <Badge variant="success" className="text-xs py-0">linked</Badge>}
                <span
                  className="text-xs"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {Math.round(signal.confidence * 100)}%
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
