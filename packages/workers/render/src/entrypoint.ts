import { RenderWorker } from './worker.js';

const worker = new RenderWorker();
worker.start().catch((err) => {
  console.error('Failed to start render worker:', err);
  process.exit(1);
});
