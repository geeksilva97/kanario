export interface ImageBackend {
  generate(options: {
    prompt: string;
    mascotPath?: string;
    seed: number;
    wide: boolean;
    onProgress?: (msg: string) => void;
  }): Promise<Buffer>;
  maxConcurrency?: number;
}

export type ImageModel = "qwen";
