import fs from "node:fs";
import { DISCORD_API_BASE } from "../config.ts";
import { createHttpClient, type HttpRequestInit } from "../http.ts";
import { HttpError } from "../errors/index.ts";
import type { DiscordMessenger } from "./command-deps.ts";

export function makeDiscordMessenger(applicationId: string, botToken: string): DiscordMessenger {
  const http = createHttpClient({
    baseUrl: DISCORD_API_BASE,
    headers: { Authorization: `Bot ${botToken}` },
  });

  async function patchWithRetry(path: string, init: HttpRequestInit): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await http.request(path, { method: "PATCH", ...init });
        return;
      } catch (err) {
        if (HttpError.is(err) && err.meta.status === 429) {
          const retryAfter: number = JSON.parse(err.meta.body).retry_after ?? 1;
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        throw err;
      }
    }
  }

  return {
    async editOriginalMessage(token, content, files?) {
      const path = `/webhooks/${applicationId}/${token}/messages/@original`;

      if (!files || files.length === 0) {
        await patchWithRetry(path, {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        return;
      }

      // Multipart form data with file attachments
      const boundary = `----kanario${Date.now()}`;
      const parts: Buffer[] = [];

      // JSON payload part with attachments metadata
      const payload = {
        content,
        attachments: files.map((f, i) => ({ id: i, filename: f.name })),
      };

      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n`,
        ),
      );

      // File parts
      for (const [i, file] of files.entries()) {
        const fileData = fs.readFileSync(file.path);
        parts.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="files[${i}]"; filename="${file.name}"\r\nContent-Type: image/png\r\n\r\n`,
          ),
        );
        parts.push(fileData);
        parts.push(Buffer.from("\r\n"));
      }

      parts.push(Buffer.from(`--${boundary}--\r\n`));

      await patchWithRetry(path, {
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: Buffer.concat(parts),
      });
    },
  };
}
