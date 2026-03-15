'use client';

import { ContextMenu } from '@/components/ui/ContextMenu';
import { useTimelineStore } from '@/hooks/useStores';
import { useTimelineActions } from '@/hooks/useTimeline';
import type { ReactNode } from 'react';
import {
  Scissors,
  Trash2,
  Copy,
  Lock,
  Unlock,
  VolumeOff,
  Volume2,
} from 'lucide-react';

interface ClipContextMenuProps {
  clipId: string;
  children: ReactNode;
}

export function ClipContextMenu({ clipId, children }: ClipContextMenuProps) {
  const clips = useTimelineStore((s) => s.clips);
  const playheadMs = useTimelineStore((s) => s.playheadMs);
  const { splitClip, removeClip } = useTimelineActions();
  const updateClip = useTimelineStore((s) => s.updateClip);

  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return <>{children}</>;

  const items = [
    {
      label: 'Split at Playhead',
      icon: <Scissors className="h-3.5 w-3.5" />,
      onClick: () => splitClip(clipId, playheadMs),
    },
    {
      label: 'Duplicate',
      icon: <Copy className="h-3.5 w-3.5" />,
      onClick: () => {},
      disabled: true,
    },
    {
      label: clip.locked ? 'Unlock' : 'Lock',
      icon: clip.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />,
      onClick: () => updateClip(clipId, { locked: !clip.locked }),
    },
    {
      label: clip.muted ? 'Unmute' : 'Mute',
      icon: clip.muted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeOff className="h-3.5 w-3.5" />,
      onClick: () => updateClip(clipId, { muted: !clip.muted }),
    },
    { label: '', onClick: () => {}, separator: true },
    {
      label: 'Delete',
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: () => removeClip(clipId),
      destructive: true,
    },
  ];

  return (
    <ContextMenu items={items}>
      {children}
    </ContextMenu>
  );
}
