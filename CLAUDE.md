# Kanario

Blog thumbnail generator. Fetches a WordPress draft, generates image prompts via an LLM, then produces cover images via an image backend.

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

# Smoke test with hints (validates hint precedence)
./test/smoke-hint.sh

# Start Discord bot server
npm run server

# Register Discord slash commands
npm run discord:register

# Deploy Discord bot to Cloud Run (manual)
GCP_PROJECT_ID=your-gcp-project GCS_CREDENTIALS_BUCKET=your-bucket ./deploy/deploy.sh

# Deploy happens automatically via CI on push to main
# (all tests must pass first — see CI/CD section below)

# Set secrets on Cloud Run (after first deploy)
gcloud run services update kanario-discord \
  --region southamerica-east1 \
  --set-env-vars "GEMINI_API_KEY=...,RUNPOD_API_KEY=...,DISCORD_TOKEN=...,DISCORD_PUBLIC_KEY=...,DISCORD_APPLICATION_ID=...,CREDENTIAL_ENCRYPTION_KEY=..."
```

## Architecture

```
deploy/
└── deploy.sh                 # Build, push, deploy Discord bot to Cloud Run (GCS FUSE mount, min-instances=1)
src/
├── index.ts                  # CLI entry point, parseArgs
├── config.ts                 # Env vars, mascot paths, style template, constants
├── credentials.ts            # WPCredentials interface, validateWPCredentials, credentialsFromEnv, createWpClient
├── errors/
│   ├── index.ts              # Barrel re-export for all error classes
│   ├── kanario-error.ts      # KanarioError base class
│   ├── http-error.ts         # HttpError (thrown by HttpClient on non-ok responses)
│   ├── wordpress-error.ts    # WordPressError + parseWpErrorCode
│   ├── image-backend-error.ts# ImageBackendError
│   ├── config-error.ts       # ConfigError
│   ├── file-error.ts         # FileError
│   └── error-reporter.ts     # formatError() — message + actionable hints dispatched by error type
├── http.ts                   # HttpClient interface + createHttpClient factory (base URL binding, header merging, ok-check)
├── store.ts                  # SQLite-backed credential store with AES-256-GCM encryption (node:sqlite)
├── wordpress.ts              # WP REST API: fetchDraft, resolvePostId, stripHtml (all take HttpClient)
├── prompt-generator.ts       # Claude prompt generation, shared schema data (enums, descriptions, user message, response mapping)
├── gemini-generator.ts       # Gemini prompt generation via @google/genai (Vertex AI Express)
├── summarizer.ts             # Pre-prompt summarization: extracts key points via LLM (Gemini or Claude)
├── image-backend.ts          # ImageBackend interface + ImageModel type
├── image-generator.ts        # Orchestrator: generateSingleImage, createImageBackend factory, shared utils
├── qwen-backend.ts           # Qwen Image Edit on RunPod Hub (async submit → poll → download), createRunpodClient
├── nano-banana-backend.ts    # Gemini 2.5 Flash Image on Vertex AI (synchronous, returns base64)
├── types/
│   └── sqlite.d.ts           # Type declarations for node:sqlite
├── commands/
│   ├── generate.ts           # CLI generate command handler
│   ├── improve.ts            # CLI improve command handler
│   ├── pick.ts               # CLI pick command handler
│   └── restyle.ts            # CLI restyle command handler (URL download, image validation)
├── workflows/
│   ├── generate.ts           # Core generate workflow (shared by CLI + Discord)
│   ├── improve.ts            # Core improve workflow (shared by CLI + Discord)
│   ├── pick.ts               # Core pick workflow (shared by CLI + Discord)
│   └── restyle.ts            # Core restyle workflow (shared by CLI + Discord)
└── discord/
    ├── command-deps.ts       # Dependency interfaces (CredentialStore, DiscordMessenger, WordPressClient, Workflows, CommandDeps)
    ├── commands.ts           # makeCommandHandler(deps) factory + COMMAND_DEFINITIONS + HELP_TEXT
    ├── discord-messenger.ts  # makeDiscordMessenger(appId, token) — Discord API edit-message adapter
    ├── image-downloader.ts   # makeImageDownloader() — URL download to temp file
    ├── register.ts           # One-time slash command registration script
    └── server.ts             # Fastify server, composition root (wires real deps into command handler)
```

## Code conventions

- **Node.js >= 24** — TypeScript stripping, `node:sqlite`, and `node:test` are all stable. Only `--experimental-test-module-mocks` remains (for `mock.module()` in tests).
- **TypeScript with native stripping** — no build step, Node runs `.ts` directly. Use `.ts` extensions in all imports.
- **`verbatimModuleSyntax`** — use `import type` for type-only imports.
- **Node.js built-in test runner** (`node:test` + `node:assert/strict`) — no Jest/Vitest.
- **ESM only** (`"type": "module"` in package.json).
- **No build step** — `tsconfig.json` has `noEmit: true`, used only for type checking.
- **Env loading** — the `./kanario` shell wrapper passes `--env-file=.env` to Node. Tests don't load `.env`.
- **Shared workflows** — CLI commands and Discord handlers both call the same workflow functions in `src/workflows/`.

## Key patterns

- **HttpClient dependency injection** — all HTTP calls go through the `HttpClient` interface (`src/http.ts`). `createHttpClient({ baseUrl, headers })` returns a client that prepends baseUrl, merges default headers, and throws `HttpError` on non-ok responses. Services receive a pre-configured client: `createWpClient(creds)` for WordPress (baseUrl + Basic auth), `createRunpodClient()` for RunPod. WP functions take `HttpClient` as first parameter. Absolute URLs (e.g. RunPod image downloads to CloudFront) bypass the baseUrl.
- **Per-user WordPress credentials** — Discord bot users register their own WP credentials via `/register`. CLI uses env vars via `credentialsFromEnv()`. Callers create a WP client with `createWpClient(creds)` and pass it to WP functions.
- **`/register` flow** — user DMs the bot with `/register wp_url username app_password`. The bot calls `GET /wp-json/wp/v2/users/me` with those credentials to validate. On success, credentials are saved to SQLite (app password encrypted with AES-256-GCM). Rejected in guild channels for security (password visible to others). `/generate` and `/pick` require registration — they load credentials from SQLite by Discord user ID.
- **Discord credential commands** — `/register` (DMs only, validates + stores), `/unregister` (deletes stored credentials), `/whoami` (shows URL + username, no password), `/help` (explains how the bot works). All ephemeral (only visible to invoker). `/help` returns an immediate response; all others use deferred responses.
- **Credential storage** — `node:sqlite` with SQLite file at `/app/data/credentials.db` (production, GCS FUSE mount) or `./data/credentials.db` (local dev). Encryption key from `CREDENTIAL_ENCRYPTION_KEY` env var; no-op if unset.
- **All Discord commands use deferred responses** — Discord requires a response within 3s. All commands return a deferred message immediately and edit it after async work completes. Credential commands use ephemeral flag. `/register` in a guild channel is the only exception — rejected immediately with a security warning.
- **Discord command registration is separate from deploy** — `deploy.sh` only deploys the server. When slash command definitions change (add/remove/rename commands or options in `COMMAND_DEFINITIONS`), you must also run `npm run discord:register` to push the changes to Discord's API.
- **Always-on instance** — `deploy.sh` sets `--min-instances 1` to prevent cold starts that would exceed Discord's 3s deadline.
- **CI/CD pipeline** — GitHub Actions runs unit tests, type check, integration tests, and smoke tests on every push. On `main`, after all jobs pass, the deploy job builds a Docker image on the GH Actions runner, pushes to Artifact Registry, and deploys to Cloud Run. Uses **Workload Identity Federation** (WIF) for keyless GCP auth — no service account keys. The WIF pool (`github`), OIDC provider (`kanario`), and deployer service account (`kanario-deployer`) are scoped to the `geeksilva97/kanario` repo via attribute condition.
- **Image backends implement `ImageBackend` interface** — `generate()` takes prompt + optional mascotPath + seed + wide, returns a PNG `Buffer`. Optional `maxConcurrency` limits parallel jobs.
- **Mascot is optional per scene** — the LLM decides independently for each scene whether a mascot fits (`miner`, `hat`) or a scene-only diorama works better (`none`). When `none`, Qwen gets a blank white canvas (required field), Nano Banana gets text-only content.
- **Qwen** needs widescreen padding (output matches input dimensions) via `encodeMascot()`, mascot scaled to 1/3 canvas width. **Nano Banana** handles aspect ratio via API config — no padding needed, mascot sent as raw base64.
- **Nano Banana** runs with concurrency 1 and exponential backoff retry (5s initial, up to 6 retries) to handle Vertex AI rate limits.
- **Post summarization** — before prompt generation, the full post content is summarized via a fast LLM (`gemini-2.5-flash` or `claude-haiku-4-5-20251001`, matching the `--model` flag). The summary replaces raw content in the user message sent to the prompt generator.
- **Prompt generation** — both Gemini and Claude generators share `SYSTEM_PROMPT`, `buildFullPrompt`, enum arrays (`MASCOT_CHOICES`, `BACKGROUND_CHOICES`), field descriptions (`SCHEMA_DESCRIPTIONS`), user message builder (`buildUserMessage`), and response mapping (`mapRawPrompts`) from `prompt-generator.ts`. Only the SDK-specific schema wrappers differ. Output schema: `{ scene, mascot, background, scene_description, full_prompt }`.
- **Two mascots + none**: `miner` (mascot3d.png), `hat` (mascot-hat.png), or `none` (no mascot) — the LLM picks per prompt.
- **Secondary characters** — use "cute round-bodied bot buddy" (never "robot" — Qwen confuses it with the mascot). Seed is `-1` (Qwen picks random).
- **Custom error classes** — all errors use `KanarioError` subclasses with `type` (machine-readable), `meta` (structured context), and static factory methods. `HttpError` handles all HTTP failures (thrown by `HttpClient` on non-ok responses). Services catch `HttpError` and re-throw as domain-specific errors: `WordPressError` (fetch failed, slug lookup failed, upload failed, set featured failed, slug not found, unresolvable input), `ImageBackendError` (RunPod API error, download failed, job failed, no image data, retries exhausted). Also `ConfigError`, `FileError`. Catch sites use `formatError(err)` from `error-reporter.ts` which appends actionable hints. `WordPressError` HTTP-wrapping factories accept the response `body` and store `wpCode` (parsed from WP REST API JSON `code` field via `parseWpErrorCode()`) in meta. `error-reporter.ts` dispatches on `wpCode` first (e.g. `rest_post_invalid_id`, `rest_cannot_edit`, `rest_upload_file_too_big`), then falls back to `status` (401/403/404/500). Each class has a static `is()` type guard for dispatch.
- **Discord command handler uses dependency injection** — `makeCommandHandler(deps)` is a factory that takes a `CommandDeps` object (credential store, Discord messenger, WordPress client, workflows, `createWpClient`, image downloader). `server.ts` is the composition root that wires real implementations. Tests inject mocks directly via the factory — no module mocking needed. Interfaces live in `command-deps.ts`.

## Testing

- Tests are colocated as `*.test.ts` next to their source files (e.g. `src/wordpress.test.ts`) — run with `npm test`.
- Tests are pure unit tests that don't require env vars or network access (mocked where needed).
- **No `try`/`catch`/`finally` in tests** — use `beforeEach`/`afterEach` for setup and cleanup (e.g. temp files). For expected errors, use `assert.rejects()` or `assert.throws()`.
- Integration tests (`test/wordpress.integration.test.ts`) require `.env.test` and hit the real WP API.
- **Smoke test** (`test/smoke.sh`) — generates thumbnails for 5 fixed posts in parallel, prints summary with mascot/none split, opens output folders. Run after changing `system.md` or generators to evaluate prompt quality visually.
- **Hint smoke test** (`test/smoke-hint.sh`) — generates thumbnails for 3 posts with specific hints, prints scene titles to verify hint precedence. Run after changing the creative direction section in `system.md`.

### Mocking strategies

- **Mock `HttpClient`** — WP and RunPod tests inject a mock `HttpClient` object (`{ baseUrl, request: async (path, init) => Response }`) instead of mocking `globalThis.fetch`. Only `src/http.test.ts` mocks `globalThis.fetch` (to test `createHttpClient` itself). `credentials.test.ts` still mocks `globalThis.fetch` because `validateWPCredentials` creates its own client internally.
- **`@google/genai` module mock** — the `@google/genai` SDK also calls `globalThis.fetch` under the hood, but mocking at the module level with `mock.module` is cleaner: replace `GoogleGenAI` with a fake class whose `models.generateContent` delegates to a swappable variable. Each test sets the variable to its own implementation before calling the code under test.
- **File-level `mock.module` + swappable variable** — ESM caches modules, so calling `t.mock.module()` + `await import()` per test only works for the first test (subsequent imports return the cached module). Fix: call `mock.module()` once at file level (imported from `node:test`), use a file-scoped `let impl: Function` variable, `await import()` the module under test once after the mock, and swap `impl` per test. Use `t.mock.fn()` per test to track calls.
- **`--experimental-test-module-mocks`** — required Node flag for `mock.module()`. Already added to `npm test` and `npm run test:coverage` scripts.
- **`t.mock.method(console, "log", () => {})` — suppress noisy console output in tests that exercise code with `console.log` calls (e.g. image backends).
- **Temp files** — use `fs.mkdtempSync` in `beforeEach` and `fs.rmSync(dir, { recursive: true })` in `afterEach` for tests that need real files on disk (e.g. `uploadMedia` reads the file with `fs.readFileSync`, Qwen/Nano Banana tests need a valid PNG for `sharp`). Create minimal test PNGs with `sharp({ create: { width: 100, height: 100, ... } }).png().toBuffer()`.
- **Factory + dependency injection** — `commands.test.ts` uses `makeCommandHandler(mockDeps)` to inject mock implementations directly (no `mock.module` needed). A `makeMockDeps()` helper creates all mocks with call tracking. Fire-and-forget async handlers are tested with a `tick()` helper (`setTimeout(resolve, 10)`) to let the event loop flush.
- **Fastify `inject()`** — test HTTP routes without starting a real server. For Discord signature verification: generate an Ed25519 keypair at module level, override `config.discordPublicKey` via `Object.defineProperty` (readonly config), sign payloads with the test private key.
- **Config validation** — since tests run without `.env`, all `config.*ApiKey` values default to `""`. Tests for missing env var errors just call the workflow with valid model names and assert the error message contains the expected variable name.

## Important rules

- **Always update README.md** when any code behavior changes.
- **Always run `npm test` and `npx tsc --noEmit`** after making changes to verify nothing is broken.
- Never commit `.env` files or secrets.
- **Commit headline never has "and"** — if you need "and", you're doing two things at once. Either separate into two commits or find a single headline that covers both.
- **Always verify CI before confirming deploy** — when asked if deploy succeeded, run `gh run list --limit 1` and check the status. Never assume success without checking.
