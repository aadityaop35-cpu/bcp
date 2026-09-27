import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Client, Collection, GatewayIntentBits, Partials, ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { CORE_CONFIG } from "./config/core";
import { DatabaseService } from "./services/DatabaseService";
import { startKeepAliveServer } from "./keepAlive";

export interface Command {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message], // required to receive DMs reliably
}) as ExtendedClient;

client.commands = new Collection();

function loadCommands(): void {
  const commandsRoot = path.join(__dirname, "commands");
  const categories = fs.readdirSync(commandsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const category of categories) {
    const categoryPath = path.join(commandsRoot, category.name);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js") || (f.endsWith(".ts") && !f.endsWith(".d.ts")));

    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const command = require(path.join(categoryPath, file)) as Command;
      if (!command?.data?.name || !command?.execute) {
        console.warn(`[commands] Skipping ${file} — missing "data" or "execute" export.`);
        continue;
      }
      client.commands.set(command.data.name, command);
    }
  }

  console.log(`[commands] Loaded ${client.commands.size} command(s): ${[...client.commands.keys()].join(", ")}`);
}

function loadEvents(): void {
  const eventsPath = path.join(__dirname, "events");
  const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js") || (f.endsWith(".ts") && !f.endsWith(".d.ts")));

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const event = require(path.join(eventsPath, file)) as { name: string; once?: boolean; execute: (...args: unknown[]) => Promise<void> };
    if (!event?.name || !event?.execute) {
      console.warn(`[events] Skipping ${file} — missing "name" or "execute" export.`);
      continue;
    }
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }

  console.log(`[events] Loaded ${files.length} event handler(s).`);
}

async function main(): Promise<void> {
  await DatabaseService.connect();
  loadCommands();
  loadEvents();
  startKeepAliveServer(client); // keeps Render (and similar) web services from spinning down — see src/keepAlive.ts
  await client.login(CORE_CONFIG.botToken);
}

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[process] Uncaught exception:", err);
});

main().catch((err) => {
  console.error("[index] Fatal startup error:", err);
  process.exit(1);
});
