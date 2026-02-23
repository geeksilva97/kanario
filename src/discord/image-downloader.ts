import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandDeps } from "./command-deps.ts";

export function makeImageDownloader(): CommandDeps["downloadImage"] {
  return async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const tempPath = path.join(os.tmpdir(), `kanario-improve-${Date.now()}.png`);
    fs.writeFileSync(tempPath, buffer);
    return {
      path: tempPath,
      cleanup: () => { try { fs.unlinkSync(tempPath); } catch {} },
    };
  };
}
