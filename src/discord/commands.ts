import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config, OUTPUT_DIR } from "../config.ts";
import type { WPCredentials } from "../credentials.ts";
import { validateWPCredentials } from "../credentials.ts";
import { loadCredentials, saveCredentials, deleteCredentials, getCredentialInfo } from "../store.ts";
import { generateWorkflow } from "../workflows/generate.ts";
import { improveWorkflow } from "../workflows/improve.ts";
import { pickWorkflow } from "../workflows/pick.ts";
import { resolveImagePath } from "../commands/pick.ts";
import { fetchDraft, resolvePostId } from "../wordpress.ts";

// Discord interaction response types
const DEFERRED_CHANNEL_MESSAGE = 5;
const CHANNEL_MESSAGE = 4;

// Ephemeral flag — only visible to the invoking user
const EPHEMERAL = 64;

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
        name: "image_model",
        description: "Image generation backend",
        type: 3, // STRING
        choices: [
          { name: "Qwen on RunPod (default)", value: "qwen" },
          { name: "Nano Banana (Vertex AI)", value: "nano-banana" },
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
        name: "image_url",
        description: "Discord CDN URL of the image to improve",
        type: 3, // STRING
        required: true,
      },
      {
        name: "prompt",
        description: "Improvement instructions (e.g. \"make the background darker\")",
        type: 3, // STRING
        required: true,
      },
      {
        name: "image_model",
        description: "Image generation backend",
        type: 3, // STRING
        choices: [
          { name: "Qwen on RunPod (default)", value: "qwen" },
          { name: "Nano Banana (Vertex AI)", value: "nano-banana" },
        ],
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

function getOptionValue(interaction: any, name: string): string | undefined {
  const options = interaction.data?.options || [];
  const opt = options.find((o: any) => o.name === name);
  return opt?.value;
}

function getUserId(interaction: any): string {
  return interaction.member?.user?.id || interaction.user?.id || "";
}

function getUserMention(interaction: any): string {
  const userId = getUserId(interaction);
  return userId ? `<@${userId}>` : "";
}

function isInGuild(interaction: any): boolean {
  return !!interaction.guild_id;
}

async function editOriginalMessage(
  token: string,
  content: string,
  files?: { name: string; path: string }[],
) {
  const url = `https://discord.com/api/v10/webhooks/${config.discordApplicationId}/${token}/messages/@original`;

  if (!files || files.length === 0) {
    await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${config.discordToken}`,
      },
      body: JSON.stringify({ content }),
    });
    return;
  }

  // Multipart form data with file attachments
  const boundary = `----kanario${Date.now()}`;
  const parts: Buffer[] = [];

  // JSON payload part with attachments metadata
  const payload = {
    content,
    attachments: files.map((f, i) => ({ id: i, filename: f.name })),
  };

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n`,
    ),
  );

  // File parts
  for (const [i, file] of files.entries()) {
    const fileData = fs.readFileSync(file.path);
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files[${i}]"; filename="${file.name}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
    );
    parts.push(fileData);
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Authorization: `Bot ${config.discordToken}`,
    },
    body,
  });
}

async function handleGenerate(interaction: any) {
  const token = interaction.token;
  const userId = getUserId(interaction);
  const mention = getUserMention(interaction);
  const rawPostId = getOptionValue(interaction, "post_id") || "";
  const model = (getOptionValue(interaction, "model") || "gemini") as "gemini" | "claude";
  const imageModel = (getOptionValue(interaction, "image_model") || "qwen") as "qwen" | "nano-banana";
  const hint = getOptionValue(interaction, "hint");

  const creds = loadCredentials(userId);
  if (!creds) {
    await editOriginalMessage(
      token,
      `${mention} You need to register your WordPress credentials first. Use \`/register\` in a DM with me.`,
    );
    return;
  }

  try {
    const postId = await resolvePostId(creds, rawPostId);
    let progress = "";
    const onProgress = (msg: string) => {
      progress += msg + "\n";
      editOriginalMessage(token, `${mention}\n\`\`\`\n${progress}\`\`\``);
    };

    const result = await generateWorkflow(
      { creds, postId, model, imageModel, wide: true, hint },
      onProgress,
    );

    const promptList = result.prompts
      .map((p, i) => `**${i + 1}.** ${p.scene}`)
      .join("\n");

    const content = `${mention} **${result.postTitle}**\n\n${promptList}\n\nGenerated ${result.imagePaths.length} images:`;

    const files = result.imagePaths.map((p) => ({
      name: p.split("/").pop()!,
      path: p,
    }));

    await editOriginalMessage(token, content, files);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await editOriginalMessage(token, `${mention} Generation failed: ${msg}`);
  }
}

async function handlePick(interaction: any) {
  const token = interaction.token;
  const userId = getUserId(interaction);
  const rawPostId = getOptionValue(interaction, "post_id") || "";
  const imageArg = getOptionValue(interaction, "image") || "";

  const creds = loadCredentials(userId);
  if (!creds) {
    const mention = getUserMention(interaction);
    await editOriginalMessage(
      token,
      `${mention} You need to register your WordPress credentials first. Use \`/register\` in a DM with me.`,
    );
    return;
  }

  try {
    const postId = await resolvePostId(creds, rawPostId);
    const imagePath = resolveImagePath(postId, imageArg);
    const post = await fetchDraft(creds, postId);

    const result = await pickWorkflow({ creds, postId, imagePath });
    const mention = getUserMention(interaction);

    await editOriginalMessage(
      token,
      `${mention} Featured image set for **${post.title}**\n\nImage: \`${imageArg}\`\nMedia ID: ${result.mediaId}`,
    );
  } catch (err) {
    const mention = getUserMention(interaction);
    const msg = err instanceof Error ? err.message : String(err);
    await editOriginalMessage(token, `${mention} Pick failed: ${msg}`);
  }
}

async function handleImprove(interaction: any) {
  const token = interaction.token;
  const mention = getUserMention(interaction);
  const rawPostId = getOptionValue(interaction, "post_id") || "";
  const imageUrl = getOptionValue(interaction, "image_url") || "";
  const prompt = getOptionValue(interaction, "prompt") || "";
  const imageModel = (getOptionValue(interaction, "image_model") || "qwen") as "qwen" | "nano-banana";

  let tempFile: string | undefined;

  try {
    // Download image from URL to temp file
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    tempFile = path.join(os.tmpdir(), `kanario-improve-${Date.now()}.png`);
    fs.writeFileSync(tempFile, buffer);

    const outputDir = path.join(OUTPUT_DIR, rawPostId);

    let progress = "";
    const onProgress = (msg: string) => {
      progress += msg + "\n";
      editOriginalMessage(token, `${mention}\n\`\`\`\n${progress}\`\`\``);
    };

    const result = await improveWorkflow(
      { sourceImagePath: tempFile, prompt, imageModel, outputDir },
      onProgress,
    );

    const content = `${mention} Improved image with: "${prompt}"\n\nGenerated ${result.imagePaths.length} variants:`;

    const files = result.imagePaths.map((p) => ({
      name: p.split("/").pop()!,
      path: p,
    }));

    await editOriginalMessage(token, content, files);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await editOriginalMessage(token, `${mention} Improve failed: ${msg}`);
  } finally {
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch {}
    }
  }
}

async function handleRegisterAsync(interaction: any) {
  const token = interaction.token;
  const userId = getUserId(interaction);
  const wpUrl = (getOptionValue(interaction, "wp_url") || "").replace(/\/+$/, "");
  const username = getOptionValue(interaction, "username") || "";
  const appPassword = getOptionValue(interaction, "app_password") || "";

  if (!wpUrl || !username || !appPassword) {
    await editOriginalMessage(token, "All fields are required: `wp_url`, `username`, `app_password`.");
    return;
  }

  const creds: WPCredentials = {
    wpUrl,
    wpUsername: username,
    wpAppPassword: appPassword,
  };

  const result = await validateWPCredentials(creds);
  if (!result.valid) {
    await editOriginalMessage(
      token,
      `WordPress authentication failed: ${result.error}\n\nPlease check your URL, username, and app password.`,
    );
    return;
  }

  saveCredentials(userId, creds);
  await editOriginalMessage(
    token,
    `Registered successfully as **${result.displayName}** on \`${wpUrl}\`.`,
  );
}

async function handleUnregisterAsync(interaction: any) {
  const token = interaction.token;
  const userId = getUserId(interaction);
  const deleted = deleteCredentials(userId);

  await editOriginalMessage(
    token,
    deleted
      ? "Your WordPress credentials have been removed."
      : "No credentials found — you weren't registered.",
  );
}

async function handleWhoamiAsync(interaction: any) {
  const token = interaction.token;
  const userId = getUserId(interaction);
  const info = getCredentialInfo(userId);

  if (!info) {
    await editOriginalMessage(token, "You haven't registered yet. Use `/register` in a DM with me.");
    return;
  }

  await editOriginalMessage(
    token,
    `**WordPress credentials:**\nURL: \`${info.wpUrl}\`\nUsername: \`${info.wpUsername}\`\nRegistered: ${info.registeredAt}`,
  );
}

const HELP_TEXT = `**Kanario** — Blog thumbnail generator

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
\`/generate post_id [model] [image_model] [hint]\` — Generate 5 thumbnail options
\`/improve post_id image_url prompt [image_model]\` — Iterate on an existing image
\`/pick post_id image\` — Upload an image and set it as featured
\`/help\` — Show this message

**Tips:**
- \`post_id\` accepts a numeric ID, a wp-admin URL, or a published post URL
- Use \`--hint\` to guide the visual metaphor (e.g. "two models competing")
- Use \`/improve\` to tweak a generated image — copy its URL from \`/generate\` output
- Image models: **Qwen** (default, RunPod) or **Nano Banana** (Vertex AI)
- \`/generate\` and \`/improve\` show live progress updates while images are being generated`;

export function handleInteraction(body: any) {
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
