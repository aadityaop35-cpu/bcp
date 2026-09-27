import { ChannelType, ChatInputCommandInteraction, SlashCommandBuilder, MessageFlags } from "discord.js";
import { requireStaff } from "../../utils/permissions";
import { PermissionService } from "../../services/PermissionService";
import { LoggingService } from "../../services/LoggingService";
import { successEmbed } from "../../utils/discord";

export const data = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("Configure this server's staff roles, tickets, and logging")
  .addSubcommandGroup((g) =>
    g
      .setName("staff")
      .setDescription("Manage staff roles")
      .addSubcommand((sc) => sc.setName("add").setDescription("Add a staff role").addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((sc) => sc.setName("remove").setDescription("Remove a staff role").addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((sc) => sc.setName("list").setDescription("List configured staff roles"))
  )
  .addSubcommandGroup((g) =>
    g
      .setName("tickets")
      .setDescription("Ticket defaults")
      .addSubcommand((sc) =>
        sc
          .setName("category")
          .setDescription("Set the default category new application tickets are created under")
          .addChannelOption((o) => o.setName("category").setDescription("Category").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      )
  )
  .addSubcommandGroup((g) =>
    g
      .setName("logs")
      .setDescription("Logging configuration")
      .addSubcommand((sc) =>
        sc
          .setName("set")
          .setDescription("Set the log channel")
          .addChannelOption((o) => o.setName("channel").setDescription("Log channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
      )
      .addSubcommand((sc) => sc.setName("disable").setDescription("Stop mirroring logs to a channel"))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await requireStaff(interaction);
  const guildId = interaction.guildId!;
  const group = interaction.options.getSubcommandGroup(true);
  const sub = interaction.options.getSubcommand();

  if (group === "staff") {
    if (sub === "add") {
      const role = interaction.options.getRole("role", true);
      await PermissionService.addStaffRole(guildId, role.id);
      await LoggingService.log(interaction.client, guildId, "CONFIG_CHANGED", `Staff role <@&${role.id}> added.`, { actorId: interaction.user.id });
      await interaction.reply({ embeds: [successEmbed(`Added <@&${role.id}> as staff.`)], flags: MessageFlags.Ephemeral });
    } else if (sub === "remove") {
      const role = interaction.options.getRole("role", true);
      await PermissionService.removeStaffRole(guildId, role.id);
      await LoggingService.log(interaction.client, guildId, "CONFIG_CHANGED", `Staff role <@&${role.id}> removed.`, { actorId: interaction.user.id });
      await interaction.reply({ embeds: [successEmbed(`Removed <@&${role.id}> from staff.`)], flags: MessageFlags.Ephemeral });
    } else if (sub === "list") {
      const roleIds = await PermissionService.getGuildStaffRoleIds(guildId);
      await interaction.reply({ content: roleIds.length ? roleIds.map((r) => `<@&${r}>`).join(", ") : "No staff roles configured.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (group === "tickets") {
    if (sub === "category") {
      const category = interaction.options.getChannel("category", true);
      await PermissionService.setTicketCategory(guildId, category.id);
      await LoggingService.log(interaction.client, guildId, "CONFIG_CHANGED", `Default ticket category set to <#${category.id}>.`, { actorId: interaction.user.id });
      await interaction.reply({ embeds: [successEmbed(`Default ticket category set to <#${category.id}>.`)], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (group === "logs") {
    if (sub === "set") {
      const channel = interaction.options.getChannel("channel", true);
      await PermissionService.setLogChannel(guildId, channel.id);
      await interaction.reply({ embeds: [successEmbed(`Log channel set to <#${channel.id}>.`)], flags: MessageFlags.Ephemeral });
      await LoggingService.log(interaction.client, guildId, "CONFIG_CHANGED", `Log channel set to <#${channel.id}>.`, { actorId: interaction.user.id });
    } else if (sub === "disable") {
      await PermissionService.setLogChannel(guildId, null);
      await interaction.reply({ embeds: [successEmbed("Log channel mirroring disabled.")], flags: MessageFlags.Ephemeral });
    }
    return;
  }
}
