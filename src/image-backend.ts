export interface ImageBackend {
  generate(options: {
    prompt: string;
    mascotPath?: string;
    seed: number;
    wide: boolean;
  }): Promise<Buffer>;
  maxConcurrency?: number;
}

export type ImageModel = "qwen" | "nano-banana";
