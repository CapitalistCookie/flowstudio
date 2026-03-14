import { VideoUnderstandingWorker } from './worker.js';

const worker = new VideoUnderstandingWorker();
worker.start().catch((err) => {
  console.error('Failed to start video-understanding worker:', err);
  process.exit(1);
});
