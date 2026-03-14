declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    noVideo(): this;
    audioCodec(codec: string): this;
    audioFrequency(freq: number): this;
    audioChannels(channels: number): this;
    outputOptions(options: string[]): this;
    output(path: string): this;
    on(event: 'end', callback: () => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
    run(): this;
  }
  namespace ffmpeg {
    function setFfmpegPath(path: string): void;
  }
  function ffmpeg(input: string): FfmpegCommand;
  export = ffmpeg;
}

declare module '@ffmpeg-installer/ffmpeg' {
  export const path: string;
}
