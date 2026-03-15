/**
 * Mock for the SpacetimeDB SDK.
 * Tests that use pure functions from signal-fetcher etc. don't need a real SDK.
 * This mocks spacetimedb, spacetimedb/server, and spacetimedb/sdk imports.
 */

// spacetimedb/server mocks
export function table(..._args: any[]): any {
  return {};
}
export const t = {
  string: () => ({ primaryKey: () => ({}) }),
  u64: () => ({}),
  u32: () => ({}),
  i32: () => ({}),
  f64: () => ({}),
  bool: () => ({}),
};
export function schema(..._args: any[]): any {
  return { schemaType: {} };
}

// spacetimedb/sdk mocks
export function reducerSchema(..._args: any[]): any {
  return {};
}
export function reducers(..._args: any[]): any {
  return { reducersType: {} };
}

// spacetimedb mocks
export class DbConnectionBuilder {
  withUri() { return this; }
  withDatabaseName() { return this; }
  withToken() { return this; }
  onConnect() { return this; }
  onConnectError() { return this; }
  onDisconnect() { return this; }
  build() { return null; }
}
export class DbConnectionImpl {}
