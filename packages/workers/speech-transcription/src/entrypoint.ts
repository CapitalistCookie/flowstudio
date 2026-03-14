import { SpeechTranscriptionWorker } from './worker.js';

const worker = new SpeechTranscriptionWorker();
worker.start().catch((err) => {
  console.error('Failed to start speech-transcription worker:', err);
  process.exit(1);
});
