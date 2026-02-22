# Kanario

Blog thumbnail generator for Codeminer42. Fetches a WordPress draft, generates image prompts via an LLM, then produces cover images via an image backend.

## Commands

```bash
# Run the CLI (loads .env automatically)
./kanario <post-id> [options]

# Run tests
npm test

# Type check
npx tsc --noEmit

# Smoke test (generates real images, requires .env)
./test/smoke.sh

# Start Discord bot server
npm run server

# Register Discord slash commands
npm run discord:register

# Deploy Discord bot to Cloud Run
GCP_PROJECT_ID=edy-ai-playground ./deploy/deploy.sh

# Set secrets on Cloud Run (after first deploy)
gcloud run services update kanario-discord \
  --region southamerica-east1 \
  --set-env-vars "WP_USERNAME=...,WP_APP_PASSWORD=...,GEMINI_API_KEY=...,RUNPOD_API_KEY=...,DISCORD_TOKEN=...,DISCORD_PUBLIC_KEY=...,DISCORD_APPLICATION_ID=..."
```

## Architecture

```
deploy/
└── deploy.sh                 # Build, push, and deploy Discord bot to Cloud Run
src/
├── index.ts                  # CLI entry point, parseArgs
├── config.ts                 # Env vars, mascot paths, style template, constants
├── wordpress.ts              # WP REST API: fetchDraft, resolvePostId, stripHtml
├── prompt-generator.ts       # Claude prompt generation, shared SYSTEM_PROMPT + buildFullPrompt
├── gemini-generator.ts       # Gemini prompt generation via @google/genai (Vertex AI Express)
├── summarizer.ts             # Pre-prompt summarization: extracts key points via LLM (Gemini or Claude)
├── image-backend.ts          # ImageBackend interface + ImageModel type
├── image-generator.ts        # Orchestrator: generateSingleImage, createImageBackend factory, shared utils
├── qwen-backend.ts           # Qwen Image Edit on RunPod Hub (async submit → poll → download)
├── nano-banana-backend.ts    # Gemini 2.5 Flash Image on Vertex AI (synchronous, returns base64)
├── commands/
│   ├── generate.ts           # CLI generate command handler
│   └── pick.ts               # CLI pick command handler
├── workflows/
│   ├── generate.ts           # Core generate workflow (shared by CLI + Discord)
│   └── pick.ts               # Core pick workflow (shared by CLI + Discord)
└── discord/
    ├── commands.ts           # Discord slash command definitions + interaction handler
    ├── register.ts           # One-time slash command registration script
    └── server.ts             # Fastify server with Ed25519 signature verification
```

## Code conventions

- **TypeScript with `--experimental-strip-types`** — no build step, Node runs `.ts` directly. Use `.ts` extensions in all imports.
- **`verbatimModuleSyntax`** — use `import type` for type-only imports.
- **Node.js built-in test runner** (`node:test` + `node:assert/strict`) — no Jest/Vitest.
- **ESM only** (`"type": "module"` in package.json).
- **No build step** — `tsconfig.json` has `noEmit: true`, used only for type checking.
- **Env loading** — the `./kanario` shell wrapper passes `--env-file=.env` to Node. Tests don't load `.env`.
- **Shared workflows** — CLI commands and Discord handlers both call the same workflow functions in `src/workflows/`.

## Key patterns

- **Image backends implement `ImageBackend` interface** — `generate()` takes prompt + optional mascotPath + seed + wide, returns a PNG `Buffer`. Optional `maxConcurrency` limits parallel jobs.
- **Mascot is optional per scene** — the LLM decides independently for each scene whether a mascot fits (`miner`, `hat`) or a scene-only diorama works better (`none`). When `none`, Qwen gets a blank white canvas (required field), Nano Banana gets text-only content.
- **Qwen** needs widescreen padding (output matches input dimensions) via `encodeMascot()`, mascot scaled to 1/3 canvas width. **Nano Banana** handles aspect ratio via API config — no padding needed, mascot sent as raw base64.
- **Nano Banana** runs with concurrency 1 and exponential backoff retry (5s initial, up to 6 retries) to handle Vertex AI rate limits.
- **Post summarization** — before prompt generation, the full post content is summarized via a fast LLM (`gemini-2.5-flash` or `claude-haiku-4-5-20251001`, matching the `--model` flag). The summary replaces raw content in the user message sent to the prompt generator.
- **Prompt generation** — both Gemini and Claude generators share `SYSTEM_PROMPT` and `buildFullPrompt` from `prompt-generator.ts`. Output schema: `{ scene, mascot, background, scene_description, full_prompt }`.
- **Two mascots + none**: `miner` (mascot3d.png), `hat` (mascot-hat.png), or `none` (no mascot) — the LLM picks per prompt.
- **Secondary characters** — use "cute round-bodied bot buddy" (never "robot" — Qwen confuses it with the mascot). Seed is `-1` (Qwen picks random).

## Testing

- All tests are in `test/index.test.ts` — run with `npm test`.
- Tests are pure unit tests that don't require env vars or network access (mocked where needed).
- Integration tests (`test/wordpress.integration.test.ts`) require `.env.test` and hit the real WP API.
- **Smoke test** (`test/smoke.sh`) — generates thumbnails for 3 fixed posts in parallel, prints summary with mascot/none split, opens output folders. Run after changing `system.md` or generators to evaluate prompt quality visually.

## Important rules

- **Always update README.md** when any code behavior changes.
- **Always run `npm test` and `npx tsc --noEmit`** after making changes to verify nothing is broken.
- Never commit `.env` files or secrets.
