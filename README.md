<p align="center">
  <img src="assets/logo.png" alt="Kanario" width="128" />
</p>

# Kanario

Blog thumbnail generator. Reads a WordPress draft, generates image prompts via an LLM (Gemini or Claude), then produces cover images via Qwen Image Edit on RunPod.

Works as a **CLI** (`./kanario`) or a **Discord bot** (`/generate`, `/improve`, `/pick`). Both interfaces use the same underlying workflows.

Given a post ID (or URL), Kanario:

1. Fetches the draft from WordPress REST API
2. Summarizes the full post content via a fast LLM to extract key points
3. Sends the summary to an LLM, which generates scene descriptions — the LLM decides per scene whether a mascot character fits or if a scene-only diorama works better
4. Submits image jobs (1 per prompt) to Qwen Image Edit on RunPod
5. Saves everything to `output/<post-id>/`

Once you've picked a favorite, the `pick` subcommand uploads it to WordPress and sets it as the post's featured image.

Kanario ships with an example mascot config. See [Customizing or removing the mascot](docs/custom-mascot.md) to use your own images or disable it entirely.

## Setup

```bash
npm install
cp .env.example .env  # fill in credentials
```

See [WordPress Application Password setup](docs/wordpress-setup.md) for how to create a WP app password.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `WP_URL` | CLI | WordPress site URL |
| `WP_USERNAME` | CLI | WordPress username |
| `WP_APP_PASSWORD` | CLI | WordPress application password |
| `GEMINI_API_KEY` | Yes | Google Vertex AI API key (default LLM — [get one from Vertex AI Studio](https://console.cloud.google.com/vertex-ai)) |
| `RUNPOD_API_KEY` | Yes | RunPod API key — from [runpod.io](https://www.runpod.io/) account settings |
| `ANTHROPIC_API_KEY` | Optional | Only needed with `--model claude` or as Gemini fallback |
| `DISCORD_TOKEN` | Discord bot | Discord bot token |
| `DISCORD_PUBLIC_KEY` | Discord bot | Discord application public key |
| `DISCORD_APPLICATION_ID` | Discord bot | Discord application ID |
| `CREDENTIAL_ENCRYPTION_KEY` | Discord bot | 32-byte hex key for AES-256-GCM encryption of stored WP passwords (optional for local dev) |

## Usage

### Generate thumbnails

```bash
./kanario <post-id-or-url> [--model gemini|claude] [--no-wide] [--hint <text>]
```

| Flag | Description |
|---|---|
| `--model` | LLM for prompt generation: `gemini` (default) or `claude` |
| `-o, --output` | Custom output directory (default: `output/<post-id>`) |
| `--no-wide` | Disable 16:9 padding, output matches mascot aspect ratio (square) |
| `--hint` | Guide the visual metaphor (e.g. `"two models competing side by side"`) |
| `-h, --help` | Show help |

Examples:

```bash
./kanario 12487
./kanario 12487 --no-wide
./kanario 12487 --model claude
./kanario "https://your-wordpress-site.com/wp-admin/post.php?post=12487&action=edit"
./kanario "https://your-wordpress-site.com/some-post-slug/"
```

### Improve an existing image

```bash
./kanario improve <post-id> <image> --prompt "your instructions"
```

Iterates on an existing generated image. `<image>` accepts a shorthand like `2` (resolves to `output/<post-id>/prompt-2.png`) or a full file path.

```bash
./kanario improve 12487 2 --prompt "make the background darker"
./kanario improve 12487 3 --prompt "remove the robot and add more plants"
```

### Pick & upload featured image

```bash
./kanario pick <post-id-or-url> <image>
```

Shows the post title and image path, then asks for confirmation before uploading. `<image>` accepts a shorthand like `2` or a full file path.

```bash
./kanario pick 12487 2
./kanario pick 12487 /path/to/custom.png
```

Output goes to `output/<post-id>/`:

```
output/12345/
├── prompt-1.png
├── prompt-2.png
├── prompt-3.png
├── prompt-4.png
└── prompts.json
```

## Discord Bot

The same workflows are available as Discord slash commands. Each user registers their own WordPress credentials via `/register` (DM only).

| Command | Description |
|---|---|
| `/help` | Learn how Kanario works |
| `/register wp_url username app_password` | Register your WordPress credentials (DMs only) |
| `/unregister` | Remove your stored credentials |
| `/whoami` | Show your registered URL and username |
| `/generate post_id [model] [hint]` | Generate thumbnails for a post |
| `/improve post_id image prompt` | Iterate on a generated image |
| `/pick post_id image` | Upload and set as featured image |

See [docs/discord-bot.md](docs/discord-bot.md) for full setup instructions.

## Tests

```bash
npm test              # unit + integration tests — colocated *.test.ts files (no network, no .env)
./test/smoke.sh       # smoke test — generates real images for 5 posts, opens output
./test/smoke-hint.sh  # hint smoke test — validates hint precedence with 3 posts
```

## Documentation

- [WordPress setup](docs/wordpress-setup.md) — Application Password how-to
- [Discord bot](docs/discord-bot.md) — full Discord setup and commands
- [Cloud Run deployment](docs/cloud-run.md) — deployment, CI/CD, GCP auth, RunPod API
- [LLM backends](docs/llm-backends.md) — Gemini/Claude details and auto-fallback
- [Prompting notes](docs/prompting-notes.md) — lessons learned from iterating on prompts
- [Custom mascot](docs/custom-mascot.md) — how to remove or replace the mascot

## Stack

- Node.js >= 24 (native fetch, native TypeScript stripping, native SQLite, `node:test`)
- Two LLM SDKs: `@google/genai` (Gemini via Vertex AI), `@anthropic-ai/sdk` (Claude)
- `sharp` for image processing (padding mascot to widescreen canvas)
- `fastify` for the Discord bot HTTP server
- `HttpClient` abstraction for all HTTP calls (base URL binding, header merging, `HttpError` on non-ok responses)
- Custom error hierarchy (`KanarioError` → `HttpError`, `WordPressError`, `ImageBackendError`, `ConfigError`, `FileError`) with structured metadata and actionable hints
- RunPod Hub serverless endpoint for Qwen Image Edit (image backend)
