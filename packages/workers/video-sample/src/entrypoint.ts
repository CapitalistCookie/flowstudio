import { VideoSampleWorker } from './worker.js';

const worker = new VideoSampleWorker();
worker.start().catch((err) => {
  console.error('Failed to start video-sample worker:', err);
  process.exit(1);
});
