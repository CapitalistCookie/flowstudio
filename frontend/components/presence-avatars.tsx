'use client';

import type { PresenceUser } from '@/hooks/use-presence';

interface PresenceAvatarsProps {
  users: PresenceUser[];
  maxVisible?: number;
}

export function PresenceAvatars({ users, maxVisible = 5 }: PresenceAvatarsProps) {
  const otherUsers = users.filter(u => !u.isMe);
  if (otherUsers.length === 0) return null;

  const visible = otherUsers.slice(0, maxVisible);
  const overflow = otherUsers.length - maxVisible;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((user) => (
        <div
          key={user.id}
          className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold text-white"
          style={{ backgroundColor: user.color }}
          title={user.displayName}
        >
          {user.displayName.charAt(0).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-bold text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  );
}
