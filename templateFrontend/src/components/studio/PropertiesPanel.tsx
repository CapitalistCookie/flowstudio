'use client';

import { useTimelineStore } from '@/hooks/useStores';
import { SignalOverlay } from '@/components/studio/SignalOverlay';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Input } from '@/components/ui/Input';
import { Separator } from '@/components/ui/Separator';
import { formatTimecode } from '@/lib/utils';

export function PropertiesPanel() {
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const clips = useTimelineStore((s) => s.clips);
  const updateClip = useTimelineStore((s) => s.updateClip);

  const selectedClip = selectedClipIds.length === 1
    ? clips.find((c) => c.id === selectedClipIds[0])
    : null;

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-muted)' }}
        >
          Properties
        </h3>
      </div>

      <ScrollArea className="flex-1 p-3">
        {!selectedClip ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--color-muted)' }}>
            {selectedClipIds.length > 1
              ? `${selectedClipIds.length} clips selected`
              : 'Select a clip to edit properties'}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Label */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--color-muted)' }}>
                Label
              </label>
              <Input
                value={selectedClip.label}
                onChange={(e) => updateClip(selectedClip.id, { label: e.target.value })}
                className="h-7 text-xs"
              />
            </div>

            <Separator />

            {/* Timing */}
            <div>
              <label className="text-xs mb-2 block font-medium" style={{ color: 'var(--color-muted)' }}>
                Timing
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs block mb-1" style={{ color: 'var(--color-muted)' }}>Start</span>
                  <span className="text-xs font-mono">{formatTimecode(selectedClip.startMs)}</span>
                </div>
                <div>
                  <span className="text-xs block mb-1" style={{ color: 'var(--color-muted)' }}>Duration</span>
                  <span className="text-xs font-mono">{formatTimecode(selectedClip.durationMs)}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Speed */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--color-muted)' }}>
                Speed
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.25"
                  value={selectedClip.speed}
                  onChange={(e) => updateClip(selectedClip.id, { speed: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-10 text-right">{selectedClip.speed}x</span>
              </div>
            </div>

            {/* Opacity */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--color-muted)' }}>
                Opacity
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedClip.opacity}
                  onChange={(e) => updateClip(selectedClip.id, { opacity: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-10 text-right">
                  {Math.round(selectedClip.opacity * 100)}%
                </span>
              </div>
            </div>

            {/* Volume */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--color-muted)' }}>
                Volume
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedClip.volume}
                  onChange={(e) => updateClip(selectedClip.id, { volume: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-10 text-right">
                  {Math.round(selectedClip.volume * 100)}%
                </span>
              </div>
            </div>

            <Separator />

            {/* Toggles */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedClip.locked}
                  onChange={(e) => updateClip(selectedClip.id, { locked: e.target.checked })}
                />
                Locked
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedClip.muted}
                  onChange={(e) => updateClip(selectedClip.id, { muted: e.target.checked })}
                />
                Muted
              </label>
            </div>
          </div>
        )}

        {/* AI Signals */}
        <div className="mt-3">
          <SignalOverlay />
        </div>
      </ScrollArea>
    </div>
  );
}
