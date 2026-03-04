import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import { config, OUTPUT_DIR } from "../config.ts";
import { validateWPCredentials, createWpClient } from "../credentials.ts";
import { createCredentialStore } from "../store.ts";
import { resolvePostId, fetchDraft } from "../wordpress.ts";
import { generateWorkflow } from "../workflows/generate.ts";
import { improveWorkflow } from "../workflows/improve.ts";
import { pickWorkflow } from "../workflows/pick.ts";
import { resolveImagePath } from "../commands/pick.ts";
import { makeCommandHandler } from "./commands.ts";
import { makeDiscordMessenger } from "./discord-messenger.ts";
import { makeImageDownloader } from "./image-downloader.ts";
import type { CommandDeps } from "./command-deps.ts";

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
    // TS 5.7+ Uint8Array generic breaks BufferSource compat: https://github.com/nicolo-ribaudo/tc39-proposal-safe-uint8array-methods
    hexToUint8Array(publicKeyHex) as BufferSource,
    "Ed25519",
    false,
    ["verify"],
  );

  const message = new TextEncoder().encode(timestamp + rawBody);

  return crypto.subtle.verify(
    "Ed25519",
    key,
    // Same TS 5.7+ Uint8Array compat issue as above
    hexToUint8Array(signature) as BufferSource,
    message,
  );
}

export function buildApp() {
  const credentialStore = createCredentialStore();
  
  const deps: CommandDeps = {
    credentialStore,
    discord: makeDiscordMessenger(config.discordApplicationId, config.discordToken),
    wordpress: {
      resolvePostId,
      fetchDraft,
      validateCredentials: validateWPCredentials,
    },
    workflows: {
      generate: generateWorkflow,
      improve: improveWorkflow,
      pick: pickWorkflow,
    },
    createWpClient,
    resolveImagePath,
    outputDir: OUTPUT_DIR,
    downloadImage: makeImageDownloader(),
  };

  const { handleInteraction } = makeCommandHandler(deps);

  const app = Fastify({ logger: true });

  // Custom content type parser to keep raw body as string
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  async function handlePost(request: FastifyRequest<{ Body: string }>, reply: FastifyReply) {
    const rawBody = request.body;
    // Fastify types headers as string | string[] | undefined — Discord always sends single strings
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
