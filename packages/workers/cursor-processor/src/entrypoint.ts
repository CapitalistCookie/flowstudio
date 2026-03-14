import { CursorProcessorWorker } from './worker.js';

const worker = new CursorProcessorWorker();
worker.start().catch((err) => {
  console.error('Failed to start cursor-processor worker:', err);
  process.exit(1);
});
