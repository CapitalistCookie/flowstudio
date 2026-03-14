import { TimelineBuilderWorker } from './worker.js';

const worker = new TimelineBuilderWorker();
worker.start().catch((err) => {
  console.error('Failed to start timeline-builder worker:', err);
  process.exit(1);
});
