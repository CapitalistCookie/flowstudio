import WebSocket from 'ws';
import { Logger } from './logger.js';

export interface StdbClientConfig {
  host: string;
  module: string;
  logger: Logger;
}

/**
 * SpacetimeDB client for workers.
 * Calls reducers via HTTP REST API and subscribes to tables via WebSocket.
 *
 * In production, this would use the official SpacetimeDB TypeScript client SDK.
 * This is a minimal implementation for the worker framework.
 */
export class StdbClient {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly moduleName: string;
  private readonly logger: Logger;
  private ws: WebSocket | null = null;
  private connected = false;
  private intentionalDisconnect = false;
  private reconnecting = false;
  private subscriptionCallbacks = new Map<string, Array<(row: unknown) => void>>();

  constructor(config: StdbClientConfig) {
    // Determine protocol based on host
    const isSecure = config.host.startsWith('wss://') || config.host.startsWith('https://');
    const cleanHost = config.host.replace(/^(wss?|https?):\/\//, '');

    this.baseUrl = `${isSecure ? 'https' : 'http'}://${cleanHost}`;
    this.wsUrl = `${isSecure ? 'wss' : 'ws'}://${cleanHost}`;
    this.moduleName = config.module;
    this.logger = config.logger;
  }

  /** Connect to SpacetimeDB via WebSocket */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.wsUrl}/database/subscribe/${this.moduleName}`;
      this.logger.info('Connecting to SpacetimeDB', { url });

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        this.logger.info('Connected to SpacetimeDB');
        resolve();
      };

      this.ws.onerror = (event) => {
        this.logger.error('SpacetimeDB WebSocket error', { error: String(event) });
        if (!this.connected) reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.logger.warn('SpacetimeDB WebSocket closed, reconnecting in 3s...');
        if (!this.intentionalDisconnect) {
          setTimeout(() => this.reconnect(), 3000);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /** Call a SpacetimeDB reducer via HTTP */
  async callReducer(reducerName: string, args: Record<string, unknown>): Promise<void> {
    const url = `${this.baseUrl}/database/call/${this.moduleName}/${reducerName}`;
    this.logger.debug(`Calling reducer: ${reducerName}`, { args });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Reducer ${reducerName} failed (${response.status}): ${body}`);
    }
  }

  /** Subscribe to table changes */
  onTableUpdate(tableName: string, callback: (row: unknown) => void): void {
    const existing = this.subscriptionCallbacks.get(tableName) ?? [];
    existing.push(callback);
    this.subscriptionCallbacks.set(tableName, existing);
  }

  /** Disconnect intentionally (no reconnect) */
  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /** Reconnect after unexpected disconnect */
  private reconnect(): void {
    if (this.intentionalDisconnect || this.reconnecting) return;
    this.reconnecting = true;
    this.logger.info('Attempting WebSocket reconnection...');
    this.connect().then(() => {
      this.reconnecting = false;
    }).catch((err) => {
      this.reconnecting = false;
      this.logger.error('Reconnection failed, retrying in 5s...', {
        error: err instanceof Error ? err.message : String(err),
      });
      setTimeout(() => this.reconnect(), 5000);
    });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(data: unknown): void {
    try {
      const msg = typeof data === 'string' ? JSON.parse(data) : data;
      // SpacetimeDB sends table updates as TransactionUpdate messages
      if (msg && typeof msg === 'object' && 'tableUpdate' in (msg as Record<string, unknown>)) {
        const update = (msg as Record<string, unknown>).tableUpdate as Record<string, unknown>;
        const tableName = update.tableName as string;
        const callbacks = this.subscriptionCallbacks.get(tableName);
        if (callbacks) {
          for (const cb of callbacks) {
            cb(update);
          }
        }
      }
    } catch (err) {
      this.logger.warn('Failed to parse SpacetimeDB message', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
