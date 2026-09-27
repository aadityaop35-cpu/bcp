import { ButtonInteraction } from "discord.js";
import { PermissionService } from "../../services/PermissionService";
import { PermissionError } from "../../utils/errors";
import { CORE_CONFIG } from "../../config/core";
import { EmbedModel } from "../../models/Embed";
import { ApplicationModel } from "../../models/Application";
import { ApplicationSubmissionModel } from "../../models/ApplicationSubmission";
import { ApplicationSessionModel } from "../../models/ApplicationSession";
import { GuildConfigModel } from "../../models/GuildConfig";
import { AuditLogModel } from "../../models/AuditLog";
import { successEmbed } from "../../utils/discord";

/** Handles customIds of the form dbpurge:<guildId>:confirm | dbpurge:<guildId>:cancel */
export async function handleDatabasePurgeButton(interaction: ButtonInteraction): Promise<void> {
  const [, guildId, action] = interaction.customId.split(":");

  if (!PermissionService.isDeveloper(interaction.user.id) && !CORE_CONFIG.developerUserIds.includes(interaction.user.id)) {
    throw new PermissionError("Only bot developers can purge guild data.");
  }

  if (action === "cancel") {
    await interaction.update({ content: "Purge cancelled.", components: [] });
    return;
  }

  await interaction.update({ content: "Purging...", components: [] });

  const [embeds, apps, submissions, sessions, config, logs] = await Promise.all([
    EmbedModel.deleteMany({ guildId }),
    ApplicationModel.deleteMany({ guildId }),
    ApplicationSubmissionModel.deleteMany({ guildId }),
    ApplicationSessionModel.deleteMany({ guildId }),
    GuildConfigModel.deleteMany({ guildId }),
    AuditLogModel.deleteMany({ guildId }),
  ]);

  await interaction.editReply({
    content: undefined,
    embeds: [
      successEmbed(
        `Purged guild \`${guildId}\`: ${embeds.deletedCount} embeds, ${apps.deletedCount} applications, ${submissions.deletedCount} submissions, ${sessions.deletedCount} sessions, ${config.deletedCount} config docs, ${logs.deletedCount} log entries.`
      ),
    ],
  });
}
