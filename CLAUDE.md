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

# Start Discord bot server
npm run server

# Register Discord slash commands
npm run discord:register
```

## Architecture

```
src/
├── index.ts                  # CLI entry point, parseArgs
├── config.ts                 # Env vars, mascot paths, style template, constants
├── wordpress.ts              # WP REST API: fetchDraft, resolvePostId, stripHtml
├── prompt-generator.ts       # Claude prompt generation, shared SYSTEM_PROMPT + buildFullPrompt
├── gemini-generator.ts       # Gemini prompt generation via @google/genai (Vertex AI Express)
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

- **Image backends implement `ImageBackend` interface** — `generate()` takes prompt + mascotPath + seed + wide, returns a PNG `Buffer`. Optional `maxConcurrency` limits parallel jobs.
- **Qwen** needs widescreen padding (output matches input dimensions) via `encodeMascot()`. **Nano Banana** handles aspect ratio via API config — no padding needed, mascot sent as raw base64.
- **Nano Banana** runs with concurrency 1 and exponential backoff retry (5s initial, up to 6 retries) to handle Vertex AI rate limits.
- **Prompt generation** — both Gemini and Claude generators share `SYSTEM_PROMPT` and `buildFullPrompt` from `prompt-generator.ts`. Output schema: `{ scene, mascot, background, scene_description, full_prompt }`.
- **Two mascots**: `miner` (mascot3d.png) and `hat` (mascot-hat.png) — the LLM picks which one to use per prompt.

## Testing

- All tests are in `test/index.test.ts` — run with `npm test`.
- Tests are pure unit tests that don't require env vars or network access (mocked where needed).
- Integration tests (`test/wordpress.integration.test.ts`) require `.env.test` and hit the real WP API.

## Important rules

- **Always update README.md** when any code behavior changes.
- **Always run `npm test` and `npx tsc --noEmit`** after making changes to verify nothing is broken.
- Never commit `.env` files or secrets.
