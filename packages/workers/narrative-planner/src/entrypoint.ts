import { NarrativePlannerWorker } from './worker.js';

const worker = new NarrativePlannerWorker();
worker.start().catch((err) => {
  console.error('Failed to start narrative-planner worker:', err);
  process.exit(1);
});
