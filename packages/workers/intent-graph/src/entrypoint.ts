import { IntentGraphWorker } from './worker.js';

const worker = new IntentGraphWorker();
worker.start().catch((err) => {
  console.error('Failed to start intent-graph worker:', err);
  process.exit(1);
});
