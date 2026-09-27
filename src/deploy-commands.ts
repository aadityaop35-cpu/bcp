import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { REST, Routes, Client } from "discord.js";
import { CORE_CONFIG } from "./config/core";

function loadCommandJSON(): unknown[] {
  const commandsRoot = path.join(__dirname, "commands");
  const categories = fs.readdirSync(commandsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  const commands: unknown[] = [];

  for (const category of categories) {
    const categoryPath = path.join(commandsRoot, category.name);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js") || (f.endsWith(".ts") && !f.endsWith(".d.ts")));
    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const command = require(path.join(categoryPath, file)) as { data?: { toJSON: () => unknown } };
      if (command?.data) commands.push(command.data.toJSON());
    }
  }
  return commands;
}

/**
 * Registers all slash commands either to a single guild (fast propagation,
 * used for development and for /reload's "guild" scope) or globally
 * (used for production and /reload's "global" scope, can take up to 1 hour).
 */
export async function deployCommandsForGuild(client: Client, guildId?: string): Promise<number> {
  const rest = new REST().setToken(CORE_CONFIG.botToken);
  const body = loadCommandJSON();

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(CORE_CONFIG.clientId, guildId), { body });
  } else {
    await rest.put(Routes.applicationCommands(CORE_CONFIG.clientId), { body });
  }

  return body.length;
}

async function standalone(): Promise<void> {
  const rest = new REST().setToken(CORE_CONFIG.botToken);
  const body = loadCommandJSON();

  if (CORE_CONFIG.devGuildId) {
    await rest.put(Routes.applicationGuildCommands(CORE_CONFIG.clientId, CORE_CONFIG.devGuildId), { body });
    console.log(`[deploy] Registered ${body.length} command(s) to dev guild ${CORE_CONFIG.devGuildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(CORE_CONFIG.clientId), { body });
    console.log(`[deploy] Registered ${body.length} command(s) globally (can take up to 1 hour to propagate).`);
  }
}

// Only run standalone deployment when this file is executed directly
// (e.g. `npm run deploy`), not when imported by reload.ts.
if (require.main === module) {
  standalone().catch((err) => {
    console.error("[deploy] Failed to deploy commands:", err);
    process.exit(1);
  });
}
