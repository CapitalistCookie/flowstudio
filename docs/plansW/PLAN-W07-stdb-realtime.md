# PLAN-W07 — SpacetimeDB Real-Time Frontend Integration

> **Problem**: `finalFrontend` used HTTP polling (every 3s) instead of WebSocket subscriptions. For the real frontend, we need live updates as workers process tasks.
> **Goal**: Frontend subscribes to STDB tables via WebSocket. Task completions, signals, and edit plans appear instantly.

---

## Current State

`finalFrontend` polls via HTTP every 3s:
```typescript
setInterval(async () => {
  const tasks = await queryTable("tasks", `SELECT * FROM tasks WHERE project_id = '${id}'`);
  // update store
}, 3000);
```

This is wasteful and has 3s latency. SpacetimeDB supports WebSocket subscriptions that push changes instantly.

---

## Target: SpacetimeDB Client SDK

SpacetimeDB provides a TypeScript client SDK that connects via WebSocket and subscribes to table changes.

### Connection
```typescript
import { SpacetimeDBClient } from "@spacetimedb/sdk";

const client = new SpacetimeDBClient(
  process.env.NEXT_PUBLIC_STDB_HOST!,  // ws://localhost:3000
  process.env.NEXT_PUBLIC_STDB_MODULE! // "flowstudio"
);

client.subscribe([
  "SELECT * FROM projects WHERE owner_id = :userId",
  "SELECT * FROM tasks WHERE project_id = :projectId",
  "SELECT * FROM signals WHERE project_id = :projectId",
  "SELECT * FROM assets WHERE project_id = :projectId",
]);
```

### Table Callbacks
```typescript
client.on("tasks", (oldRow, newRow) => {
  if (newRow?.status === "COMPLETED") {
    // Update pipeline progress
    // If task is EDIT_PLAN → fetch edit plan from GCS
  }
});

client.on("signals", (oldRow, newRow) => {
  if (newRow) {
    // New signal arrived → update signal overlay on timeline
  }
});
```

---

## Implementation Strategy

### Phase 1: Keep HTTP bridge as fallback
Don't remove the HTTP bridge yet. Add WebSocket alongside.

### Phase 2: WebSocket as primary
Once WebSocket is verified working, switch default to WS. HTTP bridge becomes fallback for environments where WS doesn't work.

---

## STDB Client Wrapper

Create `frontend/lib/stdb/client.ts`:

```typescript
class FlowStudioStdbClient {
  private client: SpacetimeDBClient;

  connect(userId: string): void;
  subscribeToProject(projectId: string): void;
  onTaskUpdate(cb: (task: Task) => void): void;
  onSignalUpdate(cb: (signal: Signal) => void): void;
  onAssetUpdate(cb: (asset: Asset) => void): void;
  callReducer(name: string, ...args: any[]): void;
  disconnect(): void;
}
```

---

## React Integration

### `frontend/lib/stdb/provider.tsx`:
```typescript
const StdbContext = createContext<FlowStudioStdbClient | null>(null);

export function StdbProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useUser(); // Clerk
  const client = useMemo(() => new FlowStudioStdbClient(), []);

  useEffect(() => {
    if (userId) client.connect(userId);
    return () => client.disconnect();
  }, [userId]);

  return <StdbContext.Provider value={client}>{children}</StdbContext.Provider>;
}

export function useStdb() {
  return useContext(StdbContext)!;
}
```

### Add to layout:
```typescript
<ClerkProvider>
  <StdbProvider>
    {children}
  </StdbProvider>
</ClerkProvider>
```

---

## Dependencies

Need to check SpacetimeDB TypeScript SDK compatibility:
- `@spacetimedb/sdk` package
- May need STDB bindings generated from our module

If SDK is not straightforward, fall back to improved HTTP polling (1s interval, SSE, or long-poll).

---

## Test Plan

```typescript
describe("FlowStudioStdbClient", () => {
  it("connects to STDB WebSocket on init")
  it("subscribes to project tables")
  it("fires onTaskUpdate when task status changes")
  it("fires onSignalUpdate when new signal arrives")
  it("calls reducer via WebSocket")
  it("reconnects on disconnect")
  it("handles auth token from Clerk")
})

describe("StdbProvider", () => {
  it("connects when user is authenticated")
  it("disconnects on unmount")
  it("provides client to children via context")
})
```

### Acceptance Criteria:
- [ ] Frontend receives task updates within 500ms of worker completion
- [ ] No polling interval visible (or < 1s if falling back to HTTP)
- [ ] Pipeline progress bar updates in real-time
- [ ] New signals appear on timeline overlay instantly
- [ ] Connection state shown in UI (connected / reconnecting / offline)
