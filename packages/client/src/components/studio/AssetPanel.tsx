'use client';

import { useState, useMemo } from 'react';
import { useProjectStore } from '@/hooks/useStores';
import { timelineStore } from '@/hooks/useStores';
import { useTimelineActions } from '@/hooks/useTimeline';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Input } from '@/components/ui/Input';
import { formatBytes } from '@/lib/utils';
import {
  Search,
  Film,
  Music,
  Image,
  FileText,
  Plus,
} from 'lucide-react';

function safeParseMeta(metadata: string | undefined): Record<string, unknown> {
  try { return JSON.parse(metadata || '{}'); }
  catch { return {}; }
}

const ASSET_ICONS: Record<string, typeof Film> = {
  source_video: Film,
  audio_track: Music,
  frame_sample: Image,
  thumbnail: Image,
  rendered_video: Film,
  transcript: FileText,
};

export function AssetPanel() {
  const assets = useProjectStore((s) => s.assets);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const { addClip, addTrack } = useTimelineActions();

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (filterType && a.assetType !== filterType) return false;
      if (search) {
        const meta = safeParseMeta(a.metadata);
        const name = (String(meta.originalName || a.gcsPath || '')).toLowerCase();
        if (!name.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [assets, search, filterType]);

  const assetTypes = [...new Set(assets.map((a) => a.assetType))];

  const handleDragStart = (e: React.DragEvent, assetId: string) => {
    e.dataTransfer.setData('application/x-asset-id', assetId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleAddToTimeline = (asset: typeof assets[0]) => {
    const isAudio = asset.assetType === 'audio_track';
    const trackType = isAudio ? 'audio' : 'video';

    addTrack({
      type: trackType,
      label: `${trackType} track`,
      height: isAudio ? 48 : 64,
      muted: false,
      locked: false,
      visible: true,
    });

    // Zustand set is synchronous — read the new track immediately
    const state = timelineStore.getState();
    const newTrack = state.tracks[state.tracks.length - 1];
    if (!newTrack) return;

    const meta = safeParseMeta(asset.metadata);
    addClip({
      trackId: newTrack.id,
      assetId: asset.id,
      label: (meta.originalName as string) || asset.assetType,
      startMs: 0,
      durationMs: asset.durationMs || 30000,
      sourceOffsetMs: 0,
      sourceDurationMs: asset.durationMs || 30000,
      opacity: 1,
      volume: 1,
      speed: 1,
      locked: false,
      muted: false,
    });
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="p-3 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.2)' }}>
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--color-muted)' }}
        >
          Assets
        </h3>
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3"
            style={{ color: 'var(--color-muted)' }}
          />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
        {assetTypes.length > 1 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            <button
              onClick={() => setFilterType(null)}
              className="px-2 py-0.5 rounded text-xs"
              style={{
                backgroundColor: !filterType ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: !filterType ? 'var(--color-primary)' : 'var(--color-muted)',
              }}
            >
              All
            </button>
            {assetTypes.map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? null : type)}
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  backgroundColor: filterType === type ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                  color: filterType === type ? 'var(--color-primary)' : 'var(--color-muted)',
                }}
              >
                {type.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 p-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--color-muted)' }}>
            {assets.length === 0 ? 'No assets yet' : 'No matching assets'}
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((asset) => {
              const Icon = ASSET_ICONS[asset.assetType] ?? FileText;
              const meta = safeParseMeta(asset.metadata);
              const name = String(meta.originalName || asset.assetType);

              return (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, asset.id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-grab hover:bg-white/5 group"
                >
                  <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--color-muted)' }} />
                  <span className="flex-1 truncate">{name}</span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-muted)' }}>
                    {formatBytes(asset.sizeBytes)}
                  </span>
                  <button
                    onClick={() => handleAddToTimeline(asset)}
                    className="opacity-0 group-hover:opacity-100 shrink-0"
                    title="Add to timeline"
                  >
                    <Plus className="h-3 w-3" style={{ color: 'var(--color-primary)' }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
