'use client';

import { useTimelineStore } from '@/hooks/useStores';
import { useTimelineActions } from '@/hooks/useTimeline';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu';
import {
  Eye,
  EyeOff,
  Volume2,
  VolumeOff,
  Lock,
  Unlock,
  MoreVertical,
  Trash2,
  Film,
  Music,
  Type,
  Layers,
} from 'lucide-react';
import type { Track, TrackType } from '@/core/types';

const TRACK_ICONS: Record<TrackType, typeof Film> = {
  video: Film,
  audio: Music,
  overlay: Layers,
  text: Type,
};

interface TrackHeaderProps {
  track: Track;
}

export function TrackHeader({ track }: TrackHeaderProps) {
  const updateTrack = useTimelineStore((s) => s.updateTrack);
  const { removeTrack } = useTimelineActions();

  const Icon = TRACK_ICONS[track.type];

  return (
    <div
      className="flex items-center gap-1 px-2 border-b"
      style={{
        height: track.height,
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <Icon className="h-3 w-3 shrink-0" style={{ color: 'var(--color-muted)' }} />
      <span className="text-xs truncate flex-1">{track.label}</span>

      {/* Quick toggles */}
      <button
        onClick={() => updateTrack(track.id, { muted: !track.muted })}
        className="p-0.5 opacity-60 hover:opacity-100"
        title={track.muted ? 'Unmute' : 'Mute'}
      >
        {track.muted ? (
          <VolumeOff className="h-3 w-3" />
        ) : (
          <Volume2 className="h-3 w-3" />
        )}
      </button>
      <button
        onClick={() => updateTrack(track.id, { visible: !track.visible })}
        className="p-0.5 opacity-60 hover:opacity-100"
        title={track.visible ? 'Hide' : 'Show'}
      >
        {track.visible ? (
          <Eye className="h-3 w-3" />
        ) : (
          <EyeOff className="h-3 w-3" />
        )}
      </button>
      <button
        onClick={() => updateTrack(track.id, { locked: !track.locked })}
        className="p-0.5 opacity-60 hover:opacity-100"
        title={track.locked ? 'Unlock' : 'Lock'}
      >
        {track.locked ? (
          <Lock className="h-3 w-3" />
        ) : (
          <Unlock className="h-3 w-3" />
        )}
      </button>

      {/* More menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-0.5 opacity-40 hover:opacity-100">
            <MoreVertical className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => {
            const name = prompt('Track name:', track.label);
            if (name) updateTrack(track.id, { label: name });
          }}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => removeTrack(track.id)}
            style={{ color: 'var(--color-error)' }}
          >
            <Trash2 className="h-3 w-3 mr-2" />
            Delete Track
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
