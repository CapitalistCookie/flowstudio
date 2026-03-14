/**
 * Minimal type declarations for spacetimedb/server.
 * The actual runtime is provided by the SpacetimeDB WASM host.
 * These stubs allow `tsc --noEmit` to validate our module code.
 */
declare module 'spacetimedb/server' {
  /** Schedule specification — interval or one-shot */
  export interface ScheduleAt {
    __brand: 'ScheduleAt';
  }

  export const ScheduleAt: {
    /** Create a repeating interval schedule (milliseconds) */
    interval(ms: number): ScheduleAt;
    /** Create a one-shot schedule at a specific time (Unix ms) */
    at(timestampMs: number): ScheduleAt;
  };

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

  /** Table handle with CRUD operations */
  export interface TableHandle<TRow> {
    insert(row: TRow): void;
    findByPrimaryKey(key: string | number): TRow | undefined;
    updateByPrimaryKey(key: string | number, updates: Partial<TRow>): void;
    deleteByPrimaryKey(key: string | number): void;
    iter(): Iterable<TRow>;
  }

  /** Table options */
  interface TableOptions {
    name: string;
    public?: boolean;
    scheduledAt?: string;
  }

  /** A table descriptor that carries its column definitions and resolved row type */
  export interface TableDescriptor<TName extends string, TColumns, TRow> {
    readonly __tableName: TName;
    readonly __columns: TColumns;
    readonly __row: TRow;
  }

  /** Define a table; returns a table descriptor */
  export function table<TName extends string, TColumns extends Record<string, ColumnDef<unknown>>>(
    opts: TableOptions & { name: TName },
    columns: TColumns,
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
  }

  /** Schema builder — parameterised over the DB shape */
  export interface SchemaBuilder<TDb> {
    reducer(
      name: string,
      args: Record<string, ColumnDef<unknown>>,
      fn: (ctx: ReducerContext<TDb>, args: Record<string, unknown>) => void,
    ): void;
  }

  /** Build the schema from table descriptors */
  export function schema<T extends Array<TableDescriptor<string, unknown, unknown>>>(
    ...tables: T
  ): SchemaBuilder<DbFromTables<T>>;
}
