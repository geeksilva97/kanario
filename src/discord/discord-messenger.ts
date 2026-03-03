import fs from "node:fs";
import { DISCORD_API_BASE } from "../config.ts";
import type { DiscordMessenger } from "./command-deps.ts";

export function makeDiscordMessenger(applicationId: string, botToken: string): DiscordMessenger {
  return {
    async editOriginalMessage(token, content, files?) {
      const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${token}/messages/@original`;

      if (!files || files.length === 0) {
        await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bot ${botToken}`,
          },
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

      const body = Buffer.concat(parts);

      await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bot ${botToken}`,
        },
        body,
      });
    },
  };
}
