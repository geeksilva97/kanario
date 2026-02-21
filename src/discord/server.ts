import Fastify from "fastify";
import { config } from "../config.ts";
import { handleInteraction } from "./commands.ts";

export function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function verifySignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKeyHex: string = config.discordPublicKey,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToUint8Array(publicKeyHex),
    "Ed25519",
    false,
    ["verify"],
  );

  const message = new TextEncoder().encode(timestamp + rawBody);
  const sig = hexToUint8Array(signature);

  return crypto.subtle.verify("Ed25519", key, sig, message);
}

export function buildApp() {
  const app = Fastify({ logger: true });

  // Custom content type parser to keep raw body as string
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  async function handlePost(request: any, reply: any) {
    const rawBody = request.body as string;
    const signature = request.headers["x-signature-ed25519"] as string;
    const timestamp = request.headers["x-signature-timestamp"] as string;

    if (!signature || !timestamp) {
      return reply.code(401).send("Missing signature headers");
    }

    const isValid = await verifySignature(rawBody, signature, timestamp);
    if (!isValid) {
      return reply.code(401).send("Invalid signature");
    }

    const body = JSON.parse(rawBody);

    // PING (type 1) → respond with PONG
    if (body.type === 1) {
      return { type: 1 };
    }

    // APPLICATION_COMMAND (type 2)
    if (body.type === 2) {
      return handleInteraction(body);
    }

    return reply.code(400).send("Unknown interaction type");
  }

  app.post("/interactions", handlePost);
  app.post("/", handlePost);

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}

// Only start the server when run directly
const isMainModule = process.argv[1]?.replace(/\.ts$/, "") === import.meta.url.replace(/^file:\/\//, "").replace(/\.ts$/, "");
if (isMainModule) {
  const app = buildApp();
  const port = parseInt(process.env.PORT || "3000", 10);

  app.listen({ port, host: "0.0.0.0" }, (err) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
  });
}
