import { InteractionPatternWorker } from './worker.js';

const worker = new InteractionPatternWorker();
worker.start().catch((err) => {
  console.error('Failed to start interaction-pattern worker:', err);
  process.exit(1);
});
