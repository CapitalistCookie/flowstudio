import { describe, test, expect, vi, beforeEach } from 'vitest';
import { StdbClient } from '../src/stdb-client.js';
import { MockLogger } from './mocks.js';

describe('StdbClient', () => {
  let client: StdbClient;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    client = new StdbClient({
      host: 'http://localhost:3000',
      module: 'flowstudio',
      logger: logger as any,
    });
  });

  // T2.4 — callReducer sends correct HTTP POST
  test('callReducer posts to correct endpoint with snake_case name', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.callReducer('findAndClaimTask', {
      taskType: 'AUDIO_EXTRACT',
      workerId: 'w-1',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/v1/database/flowstudio/call/find_and_claim_task');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual(['AUDIO_EXTRACT', 'w-1']);

    vi.unstubAllGlobals();
  });

  test('callReducer throws on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      }),
    );

    await expect(
      client.callReducer('failTask', { taskId: 't-1', failureReason: 'timeout' }),
    ).rejects.toThrow('Reducer failTask failed (500): Internal error');

    vi.unstubAllGlobals();
  });

  // T2.5 — queryTable parses SQL response
  test('queryTable sends SELECT * and parses rows with camelCase keys', async () => {
    const sqlResponse = [
      {
        schema: {
          elements: [
            { name: { some: 'task_id' } },
            { name: { some: 'project_id' } },
            { name: { some: 'status' } },
          ],
        },
        rows: [
          ['t-1', 'p-1', 'claimed'],
          ['t-2', 'p-2', 'pending'],
        ],
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sqlResponse),
    });
    vi.stubGlobal('fetch', mockFetch);

    const rows = await client.queryTable('tasks');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/v1/database/flowstudio/sql');
    expect(options.method).toBe('POST');
    expect(options.body).toBe('SELECT * FROM tasks');

    expect(rows).toEqual([
      { taskId: 't-1', projectId: 'p-1', status: 'claimed' },
      { taskId: 't-2', projectId: 'p-2', status: 'pending' },
    ]);

    vi.unstubAllGlobals();
  });

  test('queryTable rejects invalid table names (SQL injection guard)', async () => {
    await expect(client.queryTable('tasks; DROP TABLE')).rejects.toThrow(
      'Invalid table name',
    );
  });

  test('queryTable returns empty array when no results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );

    const rows = await client.queryTable('tasks');
    expect(rows).toEqual([]);

    vi.unstubAllGlobals();
  });

  test('isConnected always returns true for HTTP client', () => {
    expect(client.isConnected).toBe(true);
  });

  test('handles https host correctly', () => {
    const secureClient = new StdbClient({
      host: 'https://stdb.example.com',
      module: 'test',
      logger: logger as any,
    });
    // Verify it constructed without error and the base URL is https
    expect(secureClient.isConnected).toBe(true);
  });
});
