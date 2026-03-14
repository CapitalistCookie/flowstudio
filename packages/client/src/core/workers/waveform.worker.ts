/**
 * Web Worker: Generates waveform data from an AudioBuffer.
 * Receives Float32Array audio data and returns downsampled peaks.
 */

interface WaveformRequest {
  channelData: Float32Array;
  sampleRate: number;
  samplesPerPixel: number;
}

interface WaveformResult {
  peaks: Float32Array;
  length: number;
}

self.onmessage = (e: MessageEvent<WaveformRequest>) => {
  const { channelData, sampleRate, samplesPerPixel } = e.data;
  const totalSamples = channelData.length;
  const numPeaks = Math.ceil(totalSamples / samplesPerPixel);
  const peaks = new Float32Array(numPeaks);

  for (let i = 0; i < numPeaks; i++) {
    const start = i * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, totalSamples);
    let max = 0;

    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]!);
      if (abs > max) max = abs;
    }

    peaks[i] = max;
  }

  const result: WaveformResult = { peaks, length: numPeaks };
  (self as unknown as Worker).postMessage(result, [peaks.buffer]);
};
