import { TypingDetectorWorker } from './worker.js';

const worker = new TypingDetectorWorker();
worker.start().catch((err) => {
  console.error('Failed to start typing-detector worker:', err);
  process.exit(1);
});
