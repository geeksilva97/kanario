import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHttpClient } from "../http.ts";
import type { CommandDeps } from "./command-deps.ts";

export function makeImageDownloader(): CommandDeps["downloadImage"] {
  const http = createHttpClient();

  return async (url: string) => {
    const response = await http.request(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const tempPath = path.join(os.tmpdir(), `kanario-improve-${Date.now()}.png`);
    await fsp.writeFile(tempPath, buffer);
    return {
      path: tempPath,
      cleanup: () => { fsp.unlink(tempPath).catch(() => {}); },
    };
  };
}
