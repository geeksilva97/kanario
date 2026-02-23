import { config } from "../config.ts";
import { COMMAND_DEFINITIONS } from "./commands.ts";

const { discordApplicationId, discordToken } = config;

if (!discordApplicationId || !discordToken) {
  console.error("Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN environment variables.");
  process.exit(1);
}

const url = `https://discord.com/api/v10/applications/${discordApplicationId}/commands`;

console.log(`Registering ${COMMAND_DEFINITIONS.length} commands ...`);

const response = await fetch(url, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bot ${discordToken}`,
  },
  body: JSON.stringify(COMMAND_DEFINITIONS),
});

if (!response.ok) {
  const text = await response.text();
  console.error(`Failed to register commands: ${response.status} ${text}`);
  process.exit(1);
}

// Discord PUT /commands returns an array — no SDK types for this endpoint
const result = await response.json() as { name: string; id: string }[];
console.log(`Registered ${result.length} commands:`);
for (const cmd of result) {
  console.log(`  /${cmd.name} (${cmd.id})`);
}
