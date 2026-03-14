import { UIChangeDetectorWorker } from './worker.js';

const worker = new UIChangeDetectorWorker();
worker.start().catch((err) => {
  console.error('Failed to start ui-change-detector worker:', err);
  process.exit(1);
});
