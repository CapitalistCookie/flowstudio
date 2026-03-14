import { describe, test, expect, afterEach } from 'vitest';
import http from 'node:http';
import { startHealthServer, type HealthStatus } from '../src/health.js';
import { MockLogger } from './mocks.js';

function fetchJson(port: number, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, body: data });
        }
      });
    });
    req.on('error', reject);
  });
}

describe('Health server', () => {
  let server: http.Server;

  afterEach(() => {
    server?.close();
  });

  // T2.12 — Health endpoint returns JSON with worker status
  test('GET /health returns JSON with worker status', async () => {
    const logger = new MockLogger();
    const healthFn = (): HealthStatus => ({
      healthy: true,
      workerName: 'audio-extract',
      workerId: 'audio-extract-abc123',
      activeTasks: 1,
      uptime: 120,
    });

    // Use port 0 to get a random available port
    server = startHealthServer(0, healthFn, logger as any);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as any).port;

    const { status, body } = await fetchJson(port, '/health');
    expect(status).toBe(200);
    expect(body).toEqual({
      healthy: true,
      workerName: 'audio-extract',
      workerId: 'audio-extract-abc123',
      activeTasks: 1,
      uptime: 120,
    });
  });

  test('GET /health returns 503 when unhealthy', async () => {
    const logger = new MockLogger();
    const healthFn = (): HealthStatus => ({
      healthy: false,
      workerName: 'audio-extract',
      workerId: 'audio-extract-abc123',
      activeTasks: 0,
      uptime: 0,
    });

    server = startHealthServer(0, healthFn, logger as any);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as any).port;

    const { status } = await fetchJson(port, '/health');
    expect(status).toBe(503);
  });

  test('non /health paths return 404', async () => {
    const logger = new MockLogger();
    server = startHealthServer(
      0,
      () => ({ healthy: true, workerName: 'w', workerId: 'w-1', activeTasks: 0, uptime: 0 }),
      logger as any,
    );
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as any).port;

    const { status, body } = await fetchJson(port, '/ready');
    expect(status).toBe(404);
    expect(body).toBe('Not found');
  });
});
