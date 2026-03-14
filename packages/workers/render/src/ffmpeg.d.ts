declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    noVideo(): this;
    audioCodec(codec: string): this;
    audioFrequency(freq: number): this;
    audioChannels(channels: number): this;
    videoCodec(codec: string): this;
    complexFilter(filters: string | string[]): this;
    outputOptions(options: string[]): this;
    output(path: string): this;
    on(event: 'end', callback: () => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
    run(): this;
  }
  function ffmpeg(input: string): FfmpegCommand;
  namespace ffmpeg {
    function setFfmpegPath(path: string): void;
  }
  export = ffmpeg;
}

declare module '@ffmpeg-installer/ffmpeg' {
  export const path: string;
}
