# PLAN-X18 — STDB Connection Lifecycle

> **Problem**: The frontend has `initConnection()` in `lib/stdb/connection.ts` but nobody calls it. No page, no layout, no provider initializes the STDB connection. The `queryTable` and `callReducer` functions will fail because the connection is never established (though they don't actually require `initialised` to be true — they just fire HTTP requests).
>
> The real issues are:
> 1. No connection error handling — if STDB is down, every call fails silently
> 2. No retry/reconnect logic
> 3. No connection status shown to the user
> 4. The `/api/stdb` proxy is only used when on localhost — in production, it calls STDB directly (no auth)
>
> **Impact**: Users see a broken app with no indication why. STDB errors are swallowed.

---

## Acceptance Criteria

- [ ] STDB connection is initialized in a root layout or provider
- [ ] Connection status is exposed via a hook (`useStdbStatus`)
- [ ] Failed connection shows a user-visible error banner
- [ ] Retry logic attempts reconnection every 5 seconds
- [ ] In production, STDB calls go through the `/api/stdb` proxy (with Clerk auth)
- [ ] A test verifies the connection initialization flow

---

## Implementation

### Step 1: Create `StdbProvider` component

```typescript
// frontend/components/stdb-provider.tsx
'use client';
import { useEffect, useState } from 'react';
import { initConnection, isConnected, disconnect } from '@/lib/stdb/connection';

export function StdbProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = async () => {
      try {
        await initConnection(
          () => mounted && setStatus('connected'),
          () => mounted && setStatus('error'),
        );
      } catch {
        if (mounted) {
          setStatus('error');
          retryTimer = setTimeout(() => {
            setRetryCount(c => c + 1);
          }, 5000);
        }
      }
    };

    connect();
    return () => { mounted = false; clearTimeout(retryTimer); disconnect(); };
  }, [retryCount]);

  return <>{children}</>;
}
```

### Step 2: Fix connection.ts to always use the proxy

The proxy at `/api/stdb/[...path]` adds Clerk auth. All STDB calls should go through it, not just localhost.

```typescript
function getHttpHost(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/stdb`;
  }
  return process.env.STDB_BACKEND_URL ?? 'http://127.0.0.1:3000';
}
```

### Step 3: Add StdbProvider to root layout

### Step 4: Show connection error banner

---

## Dependencies

- X-01 (STDB call format — otherwise even with the connection, calls fail)
