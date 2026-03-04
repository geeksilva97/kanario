# LLM Backends

Kanario uses LLMs for two tasks: **summarization** (fast, before prompting) and **prompt generation** (the main creative step).

## Gemini (default)

Uses `gemini-2.5-pro-preview` for prompt generation via Vertex AI Express mode (`@google/genai` SDK with `vertexai: true`). Requires `GEMINI_API_KEY`.

Uses `gemini-2.5-flash` for summarization (fast, lower cost).

Select with: `--model gemini` (or omit — it's the default)

## Claude

Uses `claude-sonnet-4-20250514` for prompt generation via the Anthropic API (`@anthropic-ai/sdk`). Requires `ANTHROPIC_API_KEY`.

Uses `claude-haiku-4-5-20251001` for summarization.

Select with: `--model claude`

## Automatic fallback

When Gemini returns a `RESOURCE_EXHAUSTED` error (quota exceeded), Kanario automatically falls back to Claude Sonnet. `ANTHROPIC_API_KEY` must be set for the fallback to work.

## Summarization

Before prompt generation, the full post content is summarized by a fast LLM to extract key points. The summary replaces the raw content in the prompt generator's user message. Falls back to `content.slice(0, 4000)` if summarization fails.

- Gemini path: `gemini-2.5-flash`
- Claude path: `claude-haiku-4-5-20251001`

## Gemini vs Claude for prompt generation

Both models share the same system prompt and output schema. In testing:

- **Gemini** (default) produces more narrative, expressive scene descriptions. It tends to add visual storytelling details (e.g. "one robot appears damaged and sparking").
- **Claude** is more obedient to the system prompt hierarchy — it respects "Creative direction from the author" more strictly and avoids literal topic restatements.
- Both models nail prompt 1 when a hint is provided. The difference shows in prompts 2-3, where Claude stays closer to the hint spirit and Gemini drifts toward blog content themes.

Use `--model gemini` (default) or `--model claude` to switch between them.
