import fs from "node:fs";
import { config } from "../config.ts";
import type { WPCredentials } from "../credentials.ts";
import { validateWPCredentials } from "../credentials.ts";
import { loadCredentials, saveCredentials, deleteCredentials, getCredentialInfo } from "../store.ts";
import { generateWorkflow } from "../workflows/generate.ts";
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

function requireCredentials(
  interaction: any,
): WPCredentials | null {
  const userId = getUserId(interaction);
  const creds = loadCredentials(userId);
  return creds;
}

async function handleGenerate(interaction: any) {
  const token = interaction.token;
  const userId = getUserId(interaction);
  const rawPostId = getOptionValue(interaction, "post_id") || "";
  const model = (getOptionValue(interaction, "model") || "gemini") as "gemini" | "claude";
  const imageModel = (getOptionValue(interaction, "image_model") || "qwen") as "qwen" | "nano-banana";
  const hint = getOptionValue(interaction, "hint");

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
    const progressMessages: string[] = [];

    const result = await generateWorkflow(
      { creds, postId, model, imageModel, wide: true, hint },
      (msg) => progressMessages.push(msg),
    );

    const promptList = result.prompts
      .map((p, i) => `**${i + 1}.** ${p.scene}`)
      .join("\n");

    const mention = getUserMention(interaction);
    const content = `${mention} **${result.postTitle}**\n\n${promptList}\n\nGenerated ${result.imagePaths.length} images:`;

    const files = result.imagePaths.map((p) => ({
      name: p.split("/").pop()!,
      path: p,
    }));

    await editOriginalMessage(token, content, files);
  } catch (err) {
    const mention = getUserMention(interaction);
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

async function handleRegister(interaction: any): Promise<{ type: number; data: { content: string; flags: number } }> {
  // Reject if used in a guild channel (password would be visible to others)
  if (isInGuild(interaction)) {
    return {
      type: CHANNEL_MESSAGE,
      data: {
        content: "For security, please use `/register` in a **DM with me** — your app password would be visible to others in a channel.",
        flags: EPHEMERAL,
      },
    };
  }

  const userId = getUserId(interaction);
  const wpUrl = (getOptionValue(interaction, "wp_url") || "").replace(/\/+$/, "");
  const username = getOptionValue(interaction, "username") || "";
  const appPassword = getOptionValue(interaction, "app_password") || "";

  if (!wpUrl || !username || !appPassword) {
    return {
      type: CHANNEL_MESSAGE,
      data: {
        content: "All fields are required: `wp_url`, `username`, `app_password`.",
        flags: EPHEMERAL,
      },
    };
  }

  const creds: WPCredentials = {
    wpUrl,
    wpUsername: username,
    wpAppPassword: appPassword,
  };

  const result = await validateWPCredentials(creds);
  if (!result.valid) {
    return {
      type: CHANNEL_MESSAGE,
      data: {
        content: `WordPress authentication failed: ${result.error}\n\nPlease check your URL, username, and app password.`,
        flags: EPHEMERAL,
      },
    };
  }

  saveCredentials(userId, creds);

  return {
    type: CHANNEL_MESSAGE,
    data: {
      content: `Registered successfully as **${result.displayName}** on \`${wpUrl}\`.`,
      flags: EPHEMERAL,
    },
  };
}

function handleUnregister(interaction: any): { type: number; data: { content: string; flags: number } } {
  const userId = getUserId(interaction);
  const deleted = deleteCredentials(userId);

  return {
    type: CHANNEL_MESSAGE,
    data: {
      content: deleted
        ? "Your WordPress credentials have been removed."
        : "No credentials found — you weren't registered.",
      flags: EPHEMERAL,
    },
  };
}

function handleWhoami(interaction: any): { type: number; data: { content: string; flags: number } } {
  const userId = getUserId(interaction);
  const info = getCredentialInfo(userId);

  if (!info) {
    return {
      type: CHANNEL_MESSAGE,
      data: {
        content: "You haven't registered yet. Use `/register` in a DM with me.",
        flags: EPHEMERAL,
      },
    };
  }

  return {
    type: CHANNEL_MESSAGE,
    data: {
      content: `**WordPress credentials:**\nURL: \`${info.wpUrl}\`\nUsername: \`${info.wpUsername}\`\nRegistered: ${info.registeredAt}`,
      flags: EPHEMERAL,
    },
  };
}

export function handleInteraction(body: any) {
  const commandName = body.data?.name;

  // Synchronous commands — return immediate response
  if (commandName === "register") {
    // register is async (validates WP credentials) but we handle it inline
    // since Discord needs a response within 3s and validation is fast
    return handleRegister(body);
  }

  if (commandName === "unregister") {
    return handleUnregister(body);
  }

  if (commandName === "whoami") {
    return handleWhoami(body);
  }

  // Fire-and-forget: run the handler without awaiting
  if (commandName === "generate") {
    handleGenerate(body);
  } else if (commandName === "pick") {
    handlePick(body);
  }

  // Return deferred response immediately (under 3s deadline)
  return { type: DEFERRED_CHANNEL_MESSAGE };
}
