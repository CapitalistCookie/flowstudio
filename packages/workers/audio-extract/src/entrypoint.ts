import { AudioExtractWorker } from './worker.js';

const worker = new AudioExtractWorker();
worker.start().catch((err) => {
  console.error('Failed to start audio-extract worker:', err);
  process.exit(1);
});
