import { createServer, type Server } from 'node:http';
import { Logger } from './logger.js';

export interface HealthStatus {
  healthy: boolean;
  workerName: string;
  workerId: string;
  activeTasks: number;
  uptime: number;
}

export type HealthCheckFn = () => HealthStatus;

/** Simple HTTP health check server for Cloud Run */
export function startHealthServer(port: number, healthCheck: HealthCheckFn, logger: Logger): Server {
  const server = createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const status = healthCheck();
      const code = status.healthy ? 200 : 503;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    logger.info(`Health server listening on port ${port}`);
  });

  return server;
}
