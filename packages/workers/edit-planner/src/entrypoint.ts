import { EditPlannerWorker } from './worker.js';

const worker = new EditPlannerWorker();
worker.start().catch((err) => {
  console.error('Failed to start edit-planner worker:', err);
  process.exit(1);
});
