import {
  ActionRowBuilder,
  ButtonInteraction,
  GuildMember,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ApplicationService } from "../../services/ApplicationService";
import { TicketService, buildSubmissionEmbed, ticketButtonsRow } from "../../services/TicketService";
import { LoggingService } from "../../services/LoggingService";
import { PermissionService } from "../../services/PermissionService";
import { PermissionError, ValidationError } from "../../utils/errors";
import { infoEmbed, successEmbed } from "../../utils/discord";
import { EmbedBuilder, MessageFlags } from "discord.js";

async function requireTicketStaff(interaction: ButtonInteraction, applicationStaffRoleIds: string[]): Promise<void> {
  const member = interaction.member as GuildMember;
  const ok = await PermissionService.isApplicationStaff(member, applicationStaffRoleIds);
  if (!ok) throw new PermissionError("Only staff assigned to this application can review it.");
}

/** Handles customIds of the form ticket:<action>:<submissionId> */
export async function handleTicketButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, submissionId] = interaction.customId.split(":");
  const guildId = interaction.guildId!;
  const guild = interaction.guild!;

  const submission = await ApplicationService.getSubmission(guildId, submissionId);
  const application = await ApplicationService.getById(guildId, String(submission.applicationId));
  if (!application) throw new ValidationError("The application this ticket belongs to no longer exists.");

  await requireTicketStaff(interaction, application.staffRoleIds);

  switch (action) {
    case "accept":
    case "reject": {
      const decision = action === "accept" ? "ACCEPTED" : "REJECTED";
      if (submission.status !== "PENDING") {
        throw new ValidationError(`This application has already been ${submission.status.toLowerCase()}.`);
      }
      await interaction.deferUpdate();
      const updated = await ApplicationService.decide(guildId, submissionId, decision, interaction.user.id);
      await TicketService.applyDecisionRoles(guild, application, submission.applicantId, decision);

      const dmEmbed = new EmbedBuilder()
        .setColor(decision === "ACCEPTED" ? 0x57f287 : 0xed4245)
        .setTitle(`${application.name} — ${decision === "ACCEPTED" ? "Accepted" : "Rejected"}`)
        .setDescription(
          decision === "ACCEPTED"
            ? "Congratulations! Your application has been accepted."
            : "Thanks for applying. Unfortunately your application was not accepted this time."
        );
      const dmSent = await TicketService.dmApplicant(interaction.client, submission.applicantId, dmEmbed);

      const refreshedEmbed = buildSubmissionEmbed(application, updated);
      await interaction.message.edit({ embeds: [refreshedEmbed], components: [ticketButtonsRow(submissionId, true)] });
      await interaction.followUp({
        embeds: [successEmbed(`Marked as **${decision}** by <@${interaction.user.id}>.${dmSent ? "" : " (Could not DM applicant — their DMs are closed.)"}`)],
      });

      await LoggingService.log(
        interaction.client,
        guildId,
        decision === "ACCEPTED" ? "APPLICATION_ACCEPTED" : "APPLICATION_REJECTED",
        `**${application.name}** submission by <@${submission.applicantId}> ${decision.toLowerCase()} by <@${interaction.user.id}>.`,
        { actorId: interaction.user.id, targetId: submissionId }
      );
      return;
    }
    case "info": {
      const modal = new ModalBuilder()
        .setCustomId(`ticketmodal:info:${submissionId}`)
        .setTitle("Request More Information")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("message")
              .setLabel("Message to send to the applicant")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1500)
          )
        );
      await interaction.showModal(modal);
      return;
    }
    case "view": {
      const embed = buildSubmissionEmbed(application, submission);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }
    case "close": {
      if (submission.status === "PENDING") {
        throw new ValidationError("Accept or reject this application before closing the ticket.");
      }
      await interaction.reply({ embeds: [infoEmbed("Closing this ticket in 5 seconds...")] });
      await ApplicationService.close(guildId, submissionId);
      await LoggingService.log(interaction.client, guildId, "APPLICATION_CLOSED", `Ticket for **${application.name}** submission closed by <@${interaction.user.id}>.`, {
        actorId: interaction.user.id,
        targetId: submissionId,
      });
      setTimeout(() => {
        interaction.channel?.delete().catch(() => undefined);
      }, 5000);
      return;
    }
  }
}

/** Handles the "Request More Information" modal submit: ticketmodal:info:<submissionId> */
export async function handleTicketInfoModal(interaction: import("discord.js").ModalSubmitInteraction): Promise<void> {
  const [, , submissionId] = interaction.customId.split(":");
  const guildId = interaction.guildId!;

  const submission = await ApplicationService.getSubmission(guildId, submissionId);
  const application = await ApplicationService.getById(guildId, String(submission.applicationId));
  if (!application) throw new ValidationError("The application this ticket belongs to no longer exists.");

  const member = interaction.member as GuildMember;
  const ok = await PermissionService.isApplicationStaff(member, application.staffRoleIds);
  if (!ok) throw new PermissionError("Only staff assigned to this application can review it.");

  const message = interaction.fields.getTextInputValue("message");
  const dmEmbed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`${application.name} — More Information Needed`)
    .setDescription(message);
  const dmSent = await TicketService.dmApplicant(interaction.client, submission.applicantId, dmEmbed);

  await interaction.reply({
    embeds: [successEmbed(dmSent ? "Message sent to the applicant." : "Could not DM the applicant — their DMs are closed. Message the channel directly instead.")],
  });
}
