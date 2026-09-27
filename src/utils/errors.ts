import {
  BaseInteraction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  AnySelectMenuInteraction,
  EmbedBuilder,
  RepliableInteraction,
  MessageFlags,
} from "discord.js";

/** Thrown deliberately by services/commands for expected, user-facing failures. */
export class BotError extends Error {
  public readonly userMessage: string;
  public readonly ephemeral: boolean;

  constructor(userMessage: string, options?: { ephemeral?: boolean; cause?: unknown }) {
    super(userMessage);
    this.name = "BotError";
    this.userMessage = userMessage;
    this.ephemeral = options?.ephemeral ?? true;
    if (options?.cause) this.cause = options.cause;
  }
}

export class PermissionError extends BotError {
  constructor(message = "You do not have permission to do that.") {
    super(message, { ephemeral: true });
    this.name = "PermissionError";
  }
}

export class NotFoundError extends BotError {
  constructor(what: string) {
    super(`${what} could not be found.`, { ephemeral: true });
    this.name = "NotFoundError";
  }
}

export class ValidationError extends BotError {
  constructor(message: string) {
    super(message, { ephemeral: true });
    this.name = "ValidationError";
  }
}

type RepliableInteractionUnion =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | AnySelectMenuInteraction
  | RepliableInteraction;

function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${message}`);
}

/**
 * Central error handler for interaction-based commands/components.
 * Sends a friendly, safe message to the user and logs full detail to console
 * (and, where possible, to the configured guild log channel via LoggingService).
 */
export async function handleInteractionError(
  interaction: RepliableInteractionUnion,
  error: unknown
): Promise<void> {
  const known = error instanceof BotError;
  const userMessage = known
    ? (error as BotError).userMessage
    : "Something went wrong while processing that. The issue has been logged.";

  if (!known) {
    // eslint-disable-next-line no-console
    console.error(`[UNHANDLED ERROR] ${interaction.type} in guild=${interaction.guildId}:`, error);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[BOT ERROR] ${(error as BotError).name}: ${(error as BotError).message}`);
  }

  const payload = { embeds: [errorEmbed(userMessage)], components: [], content: undefined };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => undefined);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  } catch {
    // Interaction likely expired — nothing more we can do.
  }
}

export function isDiscordAPIError(error: unknown, code?: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (code === undefined || (error as { code: number }).code === code)
  );
}
