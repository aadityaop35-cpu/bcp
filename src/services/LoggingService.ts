import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { AuditEventType, AuditLogModel } from "../models/AuditLog";
import { PermissionService } from "./PermissionService";
import { isDiscordAPIError } from "../utils/errors";

const EVENT_COLORS: Partial<Record<AuditEventType, number>> = {
  APPLICATION_ACCEPTED: 0x57f287,
  APPLICATION_REJECTED: 0xed4245,
  APPLICATION_CANCELLED: 0x99aab5,
  EMBED_DELETED: 0xed4245,
  TICKET_CREATED: 0x5865f2,
};

export class LoggingService {
  /**
   * Persists an audit log entry to MongoDB (source of truth, survives
   * restarts) and best-effort mirrors it to the guild's configured log
   * channel, if any. Never throws — logging failures must not break the
   * feature that triggered them.
   */
  static async log(
    client: Client,
    guildId: string,
    type: AuditEventType,
    message: string,
    options?: { actorId?: string; targetId?: string }
  ): Promise<void> {
    try {
      await AuditLogModel.create({
        guildId,
        type,
        message,
        actorId: options?.actorId,
        targetId: options?.targetId,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[LoggingService] Failed to persist audit log:", err);
    }

    try {
      const channelId = await PermissionService.getLogChannelId(guildId);
      if (!channelId) return;

      const channel = await client.channels.fetch(channelId).catch((err) => {
        if (isDiscordAPIError(err, 10003) /* Unknown Channel */) return null;
        throw err;
      });
      if (!channel || !channel.isTextBased() || !("send" in channel)) return;

      const embed = new EmbedBuilder()
        .setColor(EVENT_COLORS[type] ?? 0x99aab5)
        .setTitle(type.replace(/_/g, " "))
        .setDescription(message)
        .setTimestamp(new Date());
      if (options?.actorId) embed.addFields({ name: "Actor", value: `<@${options.actorId}>`, inline: true });
      if (options?.targetId) embed.addFields({ name: "Target ID", value: options.targetId, inline: true });

      await (channel as TextChannel).send({ embeds: [embed] });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[LoggingService] Failed to mirror log to channel:", err);
    }
  }
}
