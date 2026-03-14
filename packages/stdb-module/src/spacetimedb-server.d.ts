/**
 * Minimal type declarations for spacetimedb/server.
 * The actual runtime is provided by the SpacetimeDB WASM host.
 * These stubs allow `tsc --noEmit` to validate our module code.
 */

/** Console is available in SpacetimeDB WASM runtime */
declare var console: {
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

declare module 'spacetimedb' {
  /** Schedule specification — interval or one-shot */
  export interface ScheduleAt {
    __brand: 'ScheduleAt';
  }

  export const ScheduleAt: {
    /** Create a repeating interval schedule (microseconds) */
    interval(micros: bigint): ScheduleAt;
    /** Create a one-shot schedule at a specific time (Unix ms) */
    at(timestampMs: number): ScheduleAt;
  };
}

declare module 'spacetimedb/server' {
  import type { ScheduleAt } from 'spacetimedb';

  /** Re-export ScheduleAt for convenience */
  export type { ScheduleAt };

  /** Opaque column definition marker */
  export interface ColumnDef<T = unknown> {
    /** Mark this column as the primary key */
    primaryKey(): ColumnDef<T>;
    /** Mark this column as auto-incrementing */
    autoInc(): ColumnDef<T>;
    /** @internal type brand */
    readonly __type?: T;
  }

  /** Type builder namespace */
  export const t: {
    string(): ColumnDef<string>;
    u64(): ColumnDef<number>;
    i32(): ColumnDef<number>;
    f64(): ColumnDef<number>;
    bool(): ColumnDef<boolean>;
    scheduleAt(): ColumnDef<ScheduleAt>;
  };

  /** Unwrap column defs to their runtime types */
  type RowOf<TColumns> = {
    [K in keyof TColumns]: TColumns[K] extends ColumnDef<infer U> ? U : never;
  };

  /** BTree index definition */
  interface IndexDef {
    name: string;
    algorithm: 'btree';
    columns: string[];
  }

  /** Table index options */
  interface TableIndexOptions {
    indexes?: IndexDef[];
  }

  /** Table handle with CRUD operations */
  export interface TableHandle<TRow> {
    insert(row: TRow): void;
    findByPrimaryKey(key: string | number): TRow | undefined;
    updateByPrimaryKey(key: string | number, updates: Partial<TRow>): void;
    deleteByPrimaryKey(key: string | number): void;
    iter(): Iterable<TRow>;
    /** Index-based access — available via named indexes */
    [indexName: string]: any;
  }

  /** Table options */
  interface TableOptions {
    name: string;
    public?: boolean;
    scheduledAt?: string;
    /** Link a scheduled table to its trigger reducer */
    scheduled?: () => any;
  }

  /** A table descriptor that carries its column definitions and resolved row type */
  export interface TableDescriptor<TName extends string, TColumns, TRow> {
    readonly __tableName: TName;
    readonly __columns: TColumns;
    readonly __row: TRow;
    /** Runtime row type reference for scheduled table reducers */
    readonly rowType: any;
  }

  /** Define a table; returns a table descriptor */
  export function table<TName extends string, TColumns extends Record<string, ColumnDef<unknown>>>(
    opts: TableOptions & { name: TName },
    columns: TColumns,
    indexOpts?: TableIndexOptions,
  ): TableDescriptor<TName, TColumns, RowOf<TColumns>>;

  /** Extract table name from descriptor */
  type TableName<T> = T extends TableDescriptor<infer N, unknown, unknown> ? N : never;
  /** Extract row type from descriptor */
  type TableRow<T> = T extends TableDescriptor<string, unknown, infer R> ? R : never;

  /** Build a DB interface from a tuple of table descriptors */
  type DbFromTables<TTables extends unknown[]> = {
    [K in TableName<TTables[number]>]: TableHandle<
      TableRow<Extract<TTables[number], TableDescriptor<K, unknown, unknown>>>
    >;
  };

  /** Reducer context — gives access to db tables */
  export interface ReducerContext<TDb> {
    db: TDb;
    /** Sender identity */
    sender: any;
    /** Timestamp of the reducer invocation */
    timestamp: {
      microsSinceUnixEpoch: bigint;
    };
  }

  /** Reducer registration result */
  type ReducerResult = (...args: any[]) => any;

  /** Schema builder — parameterised over the DB shape */
  export interface SchemaBuilder<TDb> {
    reducer(
      name: string,
      args: Record<string, ColumnDef<unknown>>,
      fn: (ctx: ReducerContext<TDb>, args: Record<string, unknown>) => void,
    ): ReducerResult;
    reducer(
      opts: { arg: any },
      fn: (ctx: ReducerContext<TDb>, opts: { arg: any }) => void,
    ): ReducerResult;
    /** Register module initialization reducer */
    init(fn: (ctx: ReducerContext<TDb>) => void): ReducerResult;
    /** Register client connected handler */
    clientConnected(fn: (ctx: ReducerContext<TDb>) => void): ReducerResult;
    /** Register client disconnected handler */
    clientDisconnected(fn: (ctx: ReducerContext<TDb>) => void): ReducerResult;
  }

  /** Build the schema from table descriptors */
  export function schema<T extends Array<TableDescriptor<string, unknown, unknown>>>(
    ...tables: T
  ): SchemaBuilder<DbFromTables<T>>;
}
