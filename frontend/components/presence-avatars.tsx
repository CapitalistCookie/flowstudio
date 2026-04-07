'use client';

import { Crown, Pencil, Eye } from 'lucide-react';
import type { PresenceUser } from '@/hooks/use-presence';
import type { StdbCollaborator } from '@/lib/stdb/spacetimedb';

interface PresenceAvatarsProps {
  users: PresenceUser[];
  maxVisible?: number;
  collaborators?: StdbCollaborator[];
}

function getRoleIcon(role: string | undefined) {
  if (role === 'owner') return <Crown className="h-2.5 w-2.5 text-amber-400" />;
  if (role === 'editor') return <Pencil className="h-2.5 w-2.5 text-blue-400" />;
  if (role === 'viewer') return <Eye className="h-2.5 w-2.5 text-muted-foreground" />;
  return null;
}

function getRoleLabel(role: string | undefined): string {
  if (role === 'owner') return 'Owner';
  if (role === 'editor') return 'Editor';
  if (role === 'viewer') return 'Viewer';
  return '';
}

export function PresenceAvatars({ users, maxVisible = 5, collaborators }: PresenceAvatarsProps) {
  const otherUsers = users.filter(u => !u.isMe);
  if (otherUsers.length === 0) return null;

  const visible = otherUsers.slice(0, maxVisible);
  const overflow = otherUsers.length - maxVisible;

  // Build a map from firebaseUid to role for tooltip enrichment
  const roleMap = new Map<string, string>();
  if (collaborators) {
    for (const c of collaborators) {
      roleMap.set(c.firebaseUid, c.role);
    }
  }

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((user) => {
        const role = roleMap.get(user.firebaseUid);
        const roleLabel = getRoleLabel(role);
        const title = roleLabel
          ? `${user.displayName} (${roleLabel})`
          : user.displayName;

        return (
          <div
            key={user.id}
            className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold text-white"
            style={{ backgroundColor: user.color }}
            title={title}
          >
            {user.displayName.charAt(0).toUpperCase()}
            {role && (
              <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-card bg-card">
                {getRoleIcon(role)}
              </div>
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-bold text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  );
}
