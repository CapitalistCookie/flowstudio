'use client';

/**
 * SpacetimeDB connection manager for the browser client.
 * In production, this would use the official SpacetimeDB TypeScript client SDK.
 * This is a minimal WebSocket-based implementation.
 */

export interface StdbConfig {
  host: string;
  module: string;
}

export type TableUpdateCallback = (tableName: string, rows: unknown[]) => void;

export class StdbConnection {
  private ws: WebSocket | null = null;
  private connected = false;
  private callbacks: TableUpdateCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: StdbConfig;

  constructor(config: StdbConfig) {
    this.config = config;
  }

  connect(): void {
    const url = `${this.config.host}/database/subscribe/${this.config.module}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      console.log('[StDB] Connected');
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.log('[StDB] Disconnected, reconnecting in 3s...');
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (e) => {
      console.error('[StDB] Error:', e);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg?.tableUpdate) {
          const { tableName, rows } = msg.tableUpdate;
          for (const cb of this.callbacks) {
            cb(tableName, rows ?? []);
          }
        }
      } catch (err) {
        console.warn('[StDB] Failed to parse message:', err);
      }
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  onTableUpdate(callback: TableUpdateCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  async callReducer(name: string, args: Record<string, unknown>): Promise<void> {
    const httpHost = this.config.host
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');
    const url = `${httpHost}/database/call/${this.config.module}/${name}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      throw new Error(`Reducer ${name} failed: ${response.status}`);
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
