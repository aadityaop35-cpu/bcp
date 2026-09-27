import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  OverwriteResolvable,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { IApplication } from "../models/Application";
import { IApplicationSubmission } from "../models/ApplicationSubmission";
import { PermissionService } from "./PermissionService";
import { ValidationError } from "../utils/errors";
import { slugify } from "../utils/validation";

export function ticketButtonsRow(submissionId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:accept:${submissionId}`).setLabel("Accept").setEmoji("🟢").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`ticket:reject:${submissionId}`).setLabel("Reject").setEmoji("🔴").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`ticket:info:${submissionId}`).setLabel("Request Info").setEmoji("🟡").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`ticket:view:${submissionId}`).setLabel("View Application").setEmoji("📋").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket:close:${submissionId}`).setLabel("Close").setEmoji("🔒").setStyle(ButtonStyle.Secondary)
  );
}

export function buildSubmissionEmbed(application: IApplication, submission: IApplicationSubmission): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(application.name.toUpperCase())
    .setDescription(`Submission ID: \`${String(submission._id)}\``)
    .addFields(
      { name: "Applicant", value: `<@${submission.applicantId}> (${submission.applicantTag})`, inline: true },
      { name: "Status", value: submission.status, inline: true }
    )
    .setTimestamp(submission.createdAt);

  for (const answer of submission.answers) {
    embed.addFields({
      name: answer.question.slice(0, 256),
      value: (answer.answer || "*(no answer)*").slice(0, 1024),
      inline: false,
    });
  }
  return embed;
}

export class TicketService {
  /**
   * Creates a private ticket channel visible to the applicant, the bot, and
   * every configured staff role (guild staff ∪ application staff), posts the
   * submission embed with review buttons, and pings the applicant + the
   * application's configured ping role (once, in a single message).
   */
  static async createApplicationTicket(
    client: Client,
    guild: Guild,
    application: IApplication,
    submission: IApplicationSubmission
  ): Promise<TextChannel> {
    const guildStaffRoleIds = await PermissionService.getGuildStaffRoleIds(guild.id);
    const allStaffRoleIds = Array.from(new Set([...guildStaffRoleIds, ...application.staffRoleIds]));

    const categoryId = application.ticketCategoryId ?? (await PermissionService.getTicketCategoryId(guild.id));

    const overwrites: OverwriteResolvable[] = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: submission.applicantId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    for (const roleId of allStaffRoleIds) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) continue; // role deleted — skip gracefully, don't fail ticket creation
      overwrites.push({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    const channelName = `app-${slugify(application.name)}-${submission.applicantTag.split("#")[0]}`.slice(0, 90);

    let category = null;
    if (categoryId) {
      category = await guild.channels.fetch(categoryId).catch(() => null);
      if (category && category.type !== ChannelType.GuildCategory) category = null;
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: overwrites,
      topic: `Application: ${application.name} | Submission: ${String(submission._id)} | Applicant: ${submission.applicantId}`,
    });

    const pingParts = [`<@${submission.applicantId}>`];
    if (application.pingRoleId) {
      const pingRole = await guild.roles.fetch(application.pingRoleId).catch(() => null);
      if (pingRole) pingParts.push(`<@&${application.pingRoleId}>`);
    }

    const embed = buildSubmissionEmbed(application, submission);
    await channel.send({
      content: `${pingParts.join(" ")}\n\nNew **${application.name}** submission — please review below.`,
      embeds: [embed],
      components: [ticketButtonsRow(String(submission._id))],
      allowedMentions: { users: [submission.applicantId], roles: application.pingRoleId ? [application.pingRoleId] : [] },
    });

    return channel;
  }

  static async applyDecisionRoles(
    guild: Guild,
    application: IApplication,
    applicantId: string,
    decision: "ACCEPTED" | "REJECTED"
  ): Promise<void> {
    const member = await guild.members.fetch(applicantId).catch(() => null);
    if (!member) return; // user left the server — nothing to do

    if (decision === "ACCEPTED") {
      if (application.acceptedRoleId) {
        const role = await guild.roles.fetch(application.acceptedRoleId).catch(() => null);
        if (role) await member.roles.add(role).catch(() => undefined);
      }
      if (application.removeRoleIdOnAccept) {
        const role = await guild.roles.fetch(application.removeRoleIdOnAccept).catch(() => null);
        if (role) await member.roles.remove(role).catch(() => undefined);
      }
    } else if (decision === "REJECTED" && application.rejectedRoleId) {
      const role = await guild.roles.fetch(application.rejectedRoleId).catch(() => null);
      if (role) await member.roles.add(role).catch(() => undefined);
    }
  }

  static async dmApplicant(client: Client, userId: string, embed: EmbedBuilder): Promise<boolean> {
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
      return true;
    } catch {
      return false; // DMs closed — caller should notify staff in-channel
    }
  }

  static assertIsTicketChannel(topic: string | null): { applicationName: string; submissionId: string } {
    if (!topic) throw new ValidationError("This doesn't look like an application ticket channel.");
    const match = topic.match(/Application: (.+) \| Submission: ([a-f0-9]{24}) \| Applicant: (\d+)/);
    if (!match) throw new ValidationError("This doesn't look like an application ticket channel.");
    return { applicationName: match[1], submissionId: match[2] };
  }
}
