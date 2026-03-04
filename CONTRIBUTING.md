# Contributing to Kanario

Thanks for your interest in contributing! Here's how to get started.

## Getting started

1. Fork the repo and clone your fork
2. Copy `.env.test` to fill in your WordPress credentials for integration tests
3. Install dependencies: `npm install`
4. Run unit tests: `npm test`
5. Type check: `npx tsc --noEmit`

See [README.md](README.md) for full setup instructions.

## Development workflow

- **Unit tests** are colocated with source files (`src/**/*.test.ts`) and run with `npm test`. They don't require env vars or network access.
- **Integration tests** (`test/wordpress.integration.test.ts`) require `.env.test` with real WordPress credentials: `npm run test:integration`.
- **Smoke tests** (`./test/smoke.sh`) generate real images and require a full `.env`. Run after changing prompts or image generators.
- Always run `npm test` and `npx tsc --noEmit` before opening a PR.

## Making changes

- Keep changes focused. One PR per concern.
- Match the existing code style (ESM, TypeScript with native stripping, no build step).
- Add or update tests for any behavior you change.
- If you change Discord slash command definitions (`COMMAND_DEFINITIONS` in `src/discord/commands.ts`), note it in your PR — the bot owner needs to re-run `npm run discord:register` after deploy.
- Update `README.md` if your change affects user-facing behavior.

## Submitting a pull request

1. Create a branch from `main`
2. Make your changes with passing tests
3. Open a PR against `main` with a clear description of what and why
4. CI will run unit tests, type check, integration tests, and smoke tests automatically

## Reporting issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Node.js version (`node --version`)
