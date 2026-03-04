# Discord Bot

The same generate and pick workflows are available as Discord slash commands, so your team can trigger thumbnail generation and pick images directly from a channel.

For deployment to Cloud Run, see [cloud-run.md](cloud-run.md).

## Creating a Discord application

1. Create a Discord application at [discord.com/developers](https://discord.com/developers/applications)
2. Create a bot under the application and copy the **Bot Token** → `DISCORD_TOKEN`
3. Copy the **Application ID** → `DISCORD_APPLICATION_ID`
4. Copy the **Public Key** → `DISCORD_PUBLIC_KEY`
5. Add the bot to your server with the `applications.commands` scope
6. Register slash commands:

```bash
npm run discord:register
```

7. Start the server locally (for development) or deploy to Cloud Run (for production):

```bash
npm run server                                    # local
GCP_PROJECT_ID=your-project ./deploy/deploy.sh    # Cloud Run
```

8. Set the **Interactions Endpoint URL** in the Discord developer portal to your service URL + `/interactions`

> Re-run `npm run discord:register` any time you add, remove, or rename commands or options in `COMMAND_DEFINITIONS` in `src/discord/commands.ts`.

## Per-user WordPress credentials

The Discord bot uses **per-user WordPress credentials** — each team member registers their own WP credentials so actions are attributed correctly. The CLI continues using environment variables as before.

**Registration flow:**

1. DM the bot: `/register wp_url:https://your-wordpress-site.com username:your-wp-user app_password:xxxx xxxx xxxx`
2. The bot validates the credentials against the WordPress API
3. On success, credentials are stored (encrypted with AES-256-GCM if `CREDENTIAL_ENCRYPTION_KEY` is set)
4. Now `/generate` and `/pick` use your credentials

For security, `/register` must be used in a **DM with the bot** — it will reject the command in a channel (where the password would be visible to others).

To generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Commands

| Command | Description |
|---|---|
| `/help` | Learn how Kanario works |
| `/register wp_url username app_password` | Register your WordPress credentials (DMs only) |
| `/unregister` | Remove your stored WordPress credentials |
| `/whoami` | Show your registered URL and username (no password) |
| `/generate post_id [model] [hint]` | Generate 5 thumbnail images for a WordPress post (requires registration) |
| `/improve post_id image prompt` | Iterate on a generated image with a new prompt |
| `/pick post_id image` | Upload an image and set it as the post's featured image (requires registration) |

All commands use deferred responses (Discord's 3s deadline). `/help`, `/register`, `/unregister`, and `/whoami` are ephemeral (only visible to you). `/generate`, `/improve`, and `/pick` results are visible to the channel.

`/generate` and `/improve` show live progress updates in the deferred message while images are being generated. Each workflow step replaces the message content with an accumulated log inside a code block. The final message with attached images replaces the progress log. Progress edits are fire-and-forget; Discord 429 rate limits are retried automatically (up to 3 attempts, honouring `retry_after`).

## Health check

```
GET /health → { "status": "ok" }
```

Used by Cloud Scheduler to keep the service warm (pings every 5 minutes to prevent cold starts, which exceed Discord's 3s deadline).

## Running locally

```bash
npm run server
```

The server listens on port 8080. You'll need all Discord env vars set plus any WP/LLM/RunPod vars needed by the commands you want to test. Use a tunneling tool (e.g. ngrok) to expose the local server and update the Interactions Endpoint URL in the Discord developer portal for testing.
