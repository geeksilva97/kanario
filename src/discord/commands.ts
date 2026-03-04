import path from "node:path";
import type { WPCredentials } from "../credentials.ts";
import type { CommandDeps } from "./command-deps.ts";
import { formatError } from "../errors/error-reporter.ts";

// Discord interaction response types
const DEFERRED_CHANNEL_MESSAGE = 5;
const CHANNEL_MESSAGE = 4;

// Ephemeral flag — only visible to the invoking user
const EPHEMERAL = 64;

export interface DiscordOption {
  name: string;
  value: string;
}

export interface InteractionResponse {
  type: number;
  data?: { content?: string; flags?: number };
}

export interface DiscordInteraction {
  token: string;
  guild_id?: string;
  data?: { name: string; options?: DiscordOption[] };
  member?: { user?: { id: string } };
  user?: { id: string };
}

// Slash command definitions (for registration)
export const COMMAND_DEFINITIONS = [
  {
    name: "generate",
    description: "Generate thumbnail images for a WordPress draft",
    options: [
      {
        name: "post_id",
        description: "WordPress post ID or wp-admin URL",
        type: 3, // STRING
        required: true,
      },
      {
        name: "model",
        description: "LLM for prompt generation",
        type: 3, // STRING
        choices: [
          { name: "Gemini (default)", value: "gemini" },
          { name: "Claude", value: "claude" },
        ],
      },
      {
        name: "hint",
        description: "Guide the visual metaphor",
        type: 3, // STRING
      },
    ],
  },
  {
    name: "pick",
    description: "Upload an image and set it as the post's featured image",
    options: [
      {
        name: "post_id",
        description: "WordPress post ID or wp-admin URL",
        type: 3, // STRING
        required: true,
      },
      {
        name: "image",
        description: 'Image shorthand (e.g. "2") or full file path',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "improve",
    description: "Iterate on an existing image with a new prompt",
    options: [
      {
        name: "post_id",
        description: "WordPress post ID (used for output directory)",
        type: 3, // STRING
        required: true,
      },
      {
        name: "image",
        description: 'Image number (e.g. "2") or URL',
        type: 3, // STRING
        required: true,
      },
      {
        name: "prompt",
        description: "Improvement instructions (e.g. \"make the background darker\")",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "register",
    description: "Register your WordPress credentials (use in DMs for security)",
    options: [
      {
        name: "wp_url",
        description: "WordPress site URL (e.g. https://blog.codeminer42.com)",
        type: 3, // STRING
        required: true,
      },
      {
        name: "username",
        description: "WordPress username",
        type: 3, // STRING
        required: true,
      },
      {
        name: "app_password",
        description: "WordPress application password",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "unregister",
    description: "Remove your stored WordPress credentials",
  },
  {
    name: "whoami",
    description: "Show your registered WordPress credentials (no password)",
  },
  {
    name: "help",
    description: "Learn how Kanario works",
  },
];

export const HELP_TEXT = `**Kanario** — Blog thumbnail generator

Fetches a WordPress draft, generates scene prompts via AI, and produces cover images.

**Getting started:**
1. Create a WordPress [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/): **WP Admin → Users → Profile → Application Passwords**
2. DM me: \`/register\` with your WordPress URL, username, and the app password
3. Use \`/generate\` in any channel to create thumbnails for a post
4. Use \`/pick\` to set one as the post's featured image

**Commands:**
\`/register\` — Save your WordPress credentials (DMs only)
\`/unregister\` — Remove your stored credentials
\`/whoami\` — Check your registered credentials
\`/generate post_id [model] [hint]\` — Generate 5 thumbnail options
\`/improve post_id image prompt\` — Iterate on an existing image
\`/pick post_id image\` — Upload an image and set it as featured
\`/help\` — Show this message

**Tips:**
- \`post_id\` accepts a numeric ID, a wp-admin URL, or a published post URL
- Use \`--hint\` to guide the visual metaphor (e.g. "two models competing")
- Use \`/improve\` to tweak a generated image — pass the image number from \`/generate\` output (or a URL)
- \`/generate\` and \`/improve\` show live progress updates while images are being generated`;

function getOptionValue(interaction: DiscordInteraction, name: string): string | undefined {
  const options = interaction.data?.options || [];
  const opt = options.find((o) => o.name === name);
  return opt?.value;
}

function getUserId(interaction: DiscordInteraction): string {
  return interaction.member?.user?.id || interaction.user?.id || "";
}

function getUserMention(interaction: DiscordInteraction): string {
  const userId = getUserId(interaction);
  return userId ? `<@${userId}>` : "";
}

function isInGuild(interaction: DiscordInteraction): boolean {
  return !!interaction.guild_id;
}

const CLOCK_SPINNER = ["🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛"];

export function makeCommandHandler(deps: CommandDeps) {
  const { credentialStore, discord, wordpress, workflows, createWpClient, resolveImagePath, outputDir, downloadImage } = deps;

  async function handleGenerate(interaction: DiscordInteraction) {
    const token = interaction.token;
    const userId = getUserId(interaction);
    const mention = getUserMention(interaction);
    const rawPostId = getOptionValue(interaction, "post_id") || "";
    // Values are constrained by Discord slash command choices in COMMAND_DEFINITIONS
    const model = (getOptionValue(interaction, "model") || "gemini") as "gemini" | "claude";
    const imageModel = "qwen" as const;
    const hint = getOptionValue(interaction, "hint");

    const creds = credentialStore.load(userId);
    if (!creds) {
      await discord.editOriginalMessage(
        token,
        `${mention} You need to register your WordPress credentials first. Use \`/register\` in a DM with me.`,
      );
      return;
    }

    try {
      const wpHttp = createWpClient(creds);
      const postId = await wordpress.resolvePostId(wpHttp, rawPostId);
      let progress = "";
      let step = 0;
      const onProgress = (msg: string) => {
        const clock = CLOCK_SPINNER[step++ % CLOCK_SPINNER.length];
        progress += msg + "\n";
        discord.editOriginalMessage(token, `${mention} ${clock} Generating thumbnails...\n\`\`\`\n${progress}\`\`\``).catch((err) => console.error("Failed to update progress message:", err));
      };

      const result = await workflows.generate(
        { wpHttp, postId, model, imageModel, wide: true, hint },
        onProgress,
      );

      const promptList = result.prompts
        .map((p, i) => `**${i + 1}. ${p.scene}** — ${p.scene_description}`)
        .join("\n");

      const content = `${mention} **${result.postTitle}**\n\n${promptList}\n\nGenerated ${result.imagePaths.length} images:`;

      const files = result.imagePaths.map((p) => ({
        name: p.split("/").pop()!,
        path: p,
      }));

      await discord.editOriginalMessage(token, content, files);
    } catch (err) {
      await discord.editOriginalMessage(token, `${mention} Generation failed: ${formatError(err)}`);
    }
  }

  async function handlePick(interaction: DiscordInteraction) {
    const token = interaction.token;
    const userId = getUserId(interaction);
    const rawPostId = getOptionValue(interaction, "post_id") || "";
    const imageArg = getOptionValue(interaction, "image") || "";

    const creds = credentialStore.load(userId);
    if (!creds) {
      const mention = getUserMention(interaction);
      await discord.editOriginalMessage(
        token,
        `${mention} You need to register your WordPress credentials first. Use \`/register\` in a DM with me.`,
      );
      return;
    }

    try {
      const wpHttp = createWpClient(creds);
      const postId = await wordpress.resolvePostId(wpHttp, rawPostId);
      const imagePath = resolveImagePath(postId, imageArg);
      const post = await wordpress.fetchDraft(wpHttp, postId);

      const result = await workflows.pick({ wpHttp, postId, imagePath });
      const mention = getUserMention(interaction);

      await discord.editOriginalMessage(
        token,
        `${mention} Featured image set for **${post.title}**\n\nImage: \`${imageArg}\`\nMedia ID: ${result.mediaId}`,
      );
    } catch (err) {
      const mention = getUserMention(interaction);
      await discord.editOriginalMessage(token, `${mention} Pick failed: ${formatError(err)}`);
    }
  }

  async function handleImprove(interaction: DiscordInteraction) {
    const token = interaction.token;
    const mention = getUserMention(interaction);
    const rawPostId = getOptionValue(interaction, "post_id") || "";
    const imageArg = getOptionValue(interaction, "image") || "";
    const prompt = getOptionValue(interaction, "prompt") || "";
    const imageModel = "qwen" as const;

    let downloaded: { path: string; cleanup: () => void } | undefined;

    try {
      let sourceImagePath: string;

      if (/^https?:\/\//.test(imageArg)) {
        downloaded = await downloadImage(imageArg);
        sourceImagePath = downloaded.path;
      } else {
        sourceImagePath = resolveImagePath(rawPostId, imageArg);
      }

      const imgOutputDir = path.join(outputDir, rawPostId);

      let progress = "";
      let step = 0;
      const onProgress = (msg: string) => {
        const clock = CLOCK_SPINNER[step++ % CLOCK_SPINNER.length];
        progress += msg + "\n";
        discord.editOriginalMessage(token, `${mention} ${clock} Improving image...\n\`\`\`\n${progress}\`\`\``);
      };

      const result = await workflows.improve(
        { sourceImagePath, prompt, imageModel, outputDir: imgOutputDir },
        onProgress,
      );

      const filename = result.imagePaths[0].split("/").pop()!;
      const imageNumber = filename.match(/^prompt-(\d+)\.png$/)?.[1] ?? "?";
      const content = `${mention} Improved image → **prompt-${imageNumber}** | Prompt: "${prompt}"`;

      const files = result.imagePaths.map((p) => ({
        name: p.split("/").pop()!,
        path: p,
      }));

      await discord.editOriginalMessage(token, content, files);
    } catch (err) {
      await discord.editOriginalMessage(token, `${mention} Improve failed: ${formatError(err)}`);
    } finally {
      if (downloaded) {
        downloaded.cleanup();
      }
    }
  }

  async function handleRegisterAsync(interaction: DiscordInteraction) {
    const token = interaction.token;
    const userId = getUserId(interaction);
    const wpUrl = (getOptionValue(interaction, "wp_url") || "").replace(/\/+$/, "");
    const username = getOptionValue(interaction, "username") || "";
    const appPassword = getOptionValue(interaction, "app_password") || "";

    if (!wpUrl || !username || !appPassword) {
      await discord.editOriginalMessage(token, "All fields are required: `wp_url`, `username`, `app_password`.");
      return;
    }

    const creds: WPCredentials = {
      wpUrl,
      wpUsername: username,
      wpAppPassword: appPassword,
    };

    const result = await wordpress.validateCredentials(creds);
    if (!result.valid) {
      await discord.editOriginalMessage(
        token,
        `WordPress authentication failed: ${result.error}\n\nPlease check your URL, username, and app password.`,
      );
      return;
    }

    credentialStore.save(userId, creds);
    await discord.editOriginalMessage(
      token,
      `Registered successfully as **${result.displayName}** on \`${wpUrl}\`.`,
    );
  }

  async function handleUnregisterAsync(interaction: DiscordInteraction) {
    const token = interaction.token;
    const userId = getUserId(interaction);
    const deleted = credentialStore.delete(userId);

    await discord.editOriginalMessage(
      token,
      deleted
        ? "Your WordPress credentials have been removed."
        : "No credentials found — you weren't registered.",
    );
  }

  async function handleWhoamiAsync(interaction: DiscordInteraction) {
    const token = interaction.token;
    const userId = getUserId(interaction);
    const info = credentialStore.getInfo(userId);

    if (!info) {
      await discord.editOriginalMessage(token, "You haven't registered yet. Use `/register` in a DM with me.");
      return;
    }

    await discord.editOriginalMessage(
      token,
      `**WordPress credentials:**\nURL: \`${info.wpUrl}\`\nUsername: \`${info.wpUsername}\`\nRegistered: ${info.registeredAt}`,
    );
  }

  function handleInteraction(body: DiscordInteraction): InteractionResponse {
    const commandName = body.data?.name;

    // Immediate responses (no async work)
    if (commandName === "help") {
      return {
        type: CHANNEL_MESSAGE,
        data: { content: HELP_TEXT, flags: EPHEMERAL },
      };
    }

    // Reject /register in guild channels immediately (no async work needed)
    if (commandName === "register" && isInGuild(body)) {
      return {
        type: CHANNEL_MESSAGE,
        data: {
          content: "For security, please use `/register` in a **DM with me** — your app password would be visible to others in a channel.",
          flags: EPHEMERAL,
        },
      };
    }

    // Fire-and-forget: run the handler without awaiting
    if (commandName === "register") {
      handleRegisterAsync(body);
      return { type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } };
    }

    if (commandName === "unregister") {
      handleUnregisterAsync(body);
      return { type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } };
    }

    if (commandName === "whoami") {
      handleWhoamiAsync(body);
      return { type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } };
    }

    if (commandName === "generate") {
      handleGenerate(body);
    } else if (commandName === "pick") {
      handlePick(body);
    } else if (commandName === "improve") {
      handleImprove(body);
    }

    // Return deferred response immediately (under 3s deadline)
    return { type: DEFERRED_CHANNEL_MESSAGE };
  }

  return { handleInteraction };
}
