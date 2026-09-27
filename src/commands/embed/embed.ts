import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { EmbedModel } from "../../models/Embed";
import { ApplicationModel } from "../../models/Application";
import { requireStaff } from "../../utils/permissions";
import { EmbedService } from "../../services/EmbedService";
import { ApplicationService } from "../../services/ApplicationService";
import { LoggingService } from "../../services/LoggingService";
import { buildEmbedComponents, buildEmbedFromDoc, paginate, paginationRow, successEmbed } from "../../utils/discord";
import { parseColor, sanitizeText } from "../../utils/validation";
import { ValidationError } from "../../utils/errors";
import { openEmbedEditorPanel } from "../../interactions/embedEditorPanel";

export const data = new SlashCommandBuilder()
  .setName("embed")
  .setDescription("Create and manage reusable embeds")
  .addSubcommand((sc) => sc.setName("create").setDescription("Create a new embed").addStringOption((o) => o.setName("name").setDescription("Unique name for this embed").setRequired(true)))
  .addSubcommand((sc) => sc.setName("edit").setDescription("Open the interactive editor for an embed").addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand((sc) => sc.setName("delete").setDescription("Delete an embed").addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand((sc) => sc.setName("view").setDescription("Preview an embed").addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand((sc) =>
    sc
      .setName("send")
      .setDescription("Publish an embed to a channel")
      .addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true))
      .addChannelOption((o) => o.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
  )
  .addSubcommand((sc) => sc.setName("list").setDescription("List embeds in this server").addIntegerOption((o) => o.setName("page").setDescription("Page number").setMinValue(1)))
  .addSubcommand((sc) => sc.setName("refresh").setDescription("Re-render an embed's published messages").addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true)))
  .addSubcommandGroup((g) =>
    g
      .setName("field")
      .setDescription("Manage embed fields")
      .addSubcommand((sc) =>
        sc
          .setName("add")
          .setDescription("Add a field")
          .addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("name").setDescription("Field name").setRequired(true))
          .addStringOption((o) => o.setName("value").setDescription("Field value").setRequired(true))
          .addBooleanOption((o) => o.setName("inline").setDescription("Display inline"))
      )
      .addSubcommand((sc) =>
        sc
          .setName("remove")
          .setDescription("Remove a field by index")
          .addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true))
          .addIntegerOption((o) => o.setName("index").setDescription("Field index (see /embed view)").setRequired(true).setMinValue(0))
      )
  )
  .addSubcommandGroup((g) =>
    g
      .setName("button")
      .setDescription("Manage embed buttons")
      .addSubcommand((sc) =>
        sc
          .setName("add")
          .setDescription("Add a button")
          .addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("label").setDescription("Button label").setRequired(true))
          .addStringOption((o) =>
            o
              .setName("style")
              .setDescription("Button style")
              .setRequired(true)
              .addChoices(
                { name: "Primary", value: "PRIMARY" },
                { name: "Secondary", value: "SECONDARY" },
                { name: "Success", value: "SUCCESS" },
                { name: "Danger", value: "DANGER" },
                { name: "Link", value: "LINK" }
              )
          )
          .addIntegerOption((o) => o.setName("row").setDescription("Row (0-4)").setRequired(true).setMinValue(0).setMaxValue(4))
          .addStringOption((o) => o.setName("url").setDescription("URL (required for Link style)"))
          .addStringOption((o) => o.setName("emoji").setDescription("Emoji"))
      )
      .addSubcommand((sc) =>
        sc
          .setName("remove")
          .setDescription("Remove a button")
          .addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("button_id").setDescription("Button ID (see /embed view)").setRequired(true))
      )
  )
  .addSubcommandGroup((g) =>
    g
      .setName("application")
      .setDescription("Attach/detach applications on this embed")
      .addSubcommand((sc) =>
        sc
          .setName("add")
          .setDescription("Attach an application to this embed")
          .addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("label").setDescription("Button/option label").setRequired(true))
          .addStringOption((o) =>
            o
              .setName("display_as")
              .setDescription("Show as a button or a select-menu option")
              .setRequired(true)
              .addChoices({ name: "Button", value: "BUTTON" }, { name: "Select Menu", value: "SELECT" })
          )
          .addIntegerOption((o) => o.setName("row").setDescription("Row (0-4), ignored for select menu").setMinValue(0).setMaxValue(4))
          .addStringOption((o) => o.setName("emoji").setDescription("Emoji"))
          .addStringOption((o) => o.setName("description").setDescription("Short description (select menu only, max 100 chars)"))
          .addStringOption((o) =>
            o
              .setName("style")
              .setDescription("Button style (button display only)")
              .addChoices(
                { name: "Primary", value: "PRIMARY" },
                { name: "Secondary", value: "SECONDARY" },
                { name: "Success", value: "SUCCESS" },
                { name: "Danger", value: "DANGER" }
              )
          )
      )
      .addSubcommand((sc) =>
        sc
          .setName("remove")
          .setDescription("Detach an application from this embed")
          .addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true))
          .addStringOption((o) => o.setName("application").setDescription("Application name or ID").setRequired(true).setAutocomplete(true))
      )
      .addSubcommand((sc) =>
        sc
          .setName("list")
          .setDescription("List applications attached to this embed")
          .addStringOption((o) => o.setName("embed").setDescription("Embed name or ID").setRequired(true).setAutocomplete(true))
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await requireStaff(interaction);
  const guildId = interaction.guildId!;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (!group) {
    switch (sub) {
      case "create": {
        const name = sanitizeText(interaction.options.getString("name", true), 64);
        const doc = await EmbedService.create(guildId, name, member.id);
        await LoggingService.log(interaction.client, guildId, "EMBED_CREATED", `Embed **${name}** created.`, { actorId: member.id, targetId: String(doc._id) });
        await interaction.reply({ embeds: [successEmbed(`Created embed \`${name}\`. Use \`/embed edit ${name}\` to configure it.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      case "edit": {
        const idOrName = interaction.options.getString("embed", true);
        const doc = await EmbedService.getByIdOrName(guildId, idOrName);
        await openEmbedEditorPanel(interaction, doc);
        return;
      }
      case "delete": {
        const idOrName = interaction.options.getString("embed", true);
        const doc = await EmbedService.delete(guildId, idOrName);
        await LoggingService.log(interaction.client, guildId, "EMBED_DELETED", `Embed **${doc.name}** deleted.`, { actorId: member.id, targetId: String(doc._id) });
        await interaction.reply({ embeds: [successEmbed(`Deleted embed \`${doc.name}\`.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      case "view": {
        const idOrName = interaction.options.getString("embed", true);
        const doc = await EmbedService.getByIdOrName(guildId, idOrName);
        const rendered = buildEmbedFromDoc(doc);
        const components = buildEmbedComponents(String(doc._id), doc.buttons, doc.applicationOptions);
        const meta = [
          `**ID:** \`${String(doc._id)}\``,
          `**Fields:** ${doc.fields.map((f, i) => `[${i}] ${f.name}`).join(", ") || "none"}`,
          `**Buttons:** ${doc.buttons.map((b) => `\`${b.id}\` (${b.label})`).join(", ") || "none"}`,
          `**Published in:** ${doc.publishedMessages.length} message(s)`,
        ].join("\n");
        await interaction.reply({ content: meta, embeds: [rendered], components, flags: MessageFlags.Ephemeral });
        return;
      }
      case "send": {
        const idOrName = interaction.options.getString("embed", true);
        const channel = interaction.options.getChannel("channel", true);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await EmbedService.publish(interaction.client, guildId, idOrName, channel.id);
        await interaction.editReply({ embeds: [successEmbed(`Published to <#${channel.id}>.`)] });
        return;
      }
      case "refresh": {
        const idOrName = interaction.options.getString("embed", true);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await EmbedService.refreshPublished(interaction.client, guildId, idOrName);
        await interaction.editReply({ embeds: [successEmbed(`Refreshed ${result.updated} message(s), ${result.failed} could not be updated.`)] });
        return;
      }
      case "list": {
        const embeds = await EmbedService.list(guildId);
        const page = (interaction.options.getInteger("page") ?? 1) - 1;
        const { pageItems, totalPages, page: clampedPage } = paginate(embeds, 10, page);
        const lines = pageItems.map((e) => `\`${String(e._id)}\` — **${e.name}** (${e.publishedMessages.length} published)`);
        await interaction.reply({
          content: lines.join("\n") || "No embeds yet. Create one with `/embed create`.",
          components: totalPages > 1 ? [paginationRow("embedlist", clampedPage, totalPages)] : [],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }
    return;
  }

  if (group === "field") {
    const idOrName = interaction.options.getString("embed", true);
    if (sub === "add") {
      const name = sanitizeText(interaction.options.getString("name", true), 256);
      const value = sanitizeText(interaction.options.getString("value", true), 1024);
      const inline = interaction.options.getBoolean("inline") ?? false;
      await EmbedService.addField(guildId, idOrName, name, value, inline);
      await interaction.reply({ embeds: [successEmbed("Field added.")], flags: MessageFlags.Ephemeral });
    } else if (sub === "remove") {
      const index = interaction.options.getInteger("index", true);
      await EmbedService.removeField(guildId, idOrName, index);
      await interaction.reply({ embeds: [successEmbed("Field removed.")], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (group === "button") {
    const idOrName = interaction.options.getString("embed", true);
    if (sub === "add") {
      const style = interaction.options.getString("style", true) as "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER" | "LINK";
      const url = interaction.options.getString("url") ?? undefined;
      if (style === "LINK" && !url) throw new ValidationError("Link-style buttons require a URL.");
      await EmbedService.addButton(guildId, idOrName, {
        label: sanitizeText(interaction.options.getString("label", true), 80),
        style,
        url,
        emoji: interaction.options.getString("emoji") ?? undefined,
        row: interaction.options.getInteger("row", true),
      });
      await interaction.reply({ embeds: [successEmbed("Button added.")], flags: MessageFlags.Ephemeral });
    } else if (sub === "remove") {
      const buttonId = interaction.options.getString("button_id", true);
      await EmbedService.removeButton(guildId, idOrName, buttonId);
      await interaction.reply({ embeds: [successEmbed("Button removed.")], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (group === "application") {
    const idOrName = interaction.options.getString("embed", true);
    if (sub === "add") {
      const applicationIdOrName = interaction.options.getString("application", true);
      const app = await ApplicationService.getByIdOrName(guildId, applicationIdOrName);
      const displayAs = interaction.options.getString("display_as", true) as "BUTTON" | "SELECT";
      const doc = await EmbedService.addApplicationOption(guildId, idOrName, {
        applicationId: String(app._id),
        label: sanitizeText(interaction.options.getString("label", true), 80),
        description: interaction.options.getString("description") ?? undefined,
        emoji: interaction.options.getString("emoji") ?? undefined,
        style: (interaction.options.getString("style") as "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER") ?? "PRIMARY",
        displayAs,
        row: interaction.options.getInteger("row") ?? 0,
      });
      await EmbedService.refreshPublished(interaction.client, guildId, idOrName).catch(() => undefined);
      await interaction.reply({ embeds: [successEmbed(`Attached **${app.name}** to \`${doc.name}\`.`)], flags: MessageFlags.Ephemeral });
    } else if (sub === "remove") {
      const applicationIdOrName = interaction.options.getString("application", true);
      const app = await ApplicationService.getByIdOrName(guildId, applicationIdOrName);
      await EmbedService.removeApplicationOption(guildId, idOrName, String(app._id));
      await EmbedService.refreshPublished(interaction.client, guildId, idOrName).catch(() => undefined);
      await interaction.reply({ embeds: [successEmbed(`Detached **${app.name}**.`)], flags: MessageFlags.Ephemeral });
    } else if (sub === "list") {
      const doc = await EmbedService.getByIdOrName(guildId, idOrName);
      const lines = doc.applicationOptions.map((o) => `\`${String(o.applicationId)}\` — ${o.label} (${o.displayAs})`);
      await interaction.reply({ content: lines.join("\n") || "No applications attached.", flags: MessageFlags.Ephemeral });
    }
    return;
  }
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const guildId = interaction.guildId!;
  const query = focused.value.toString();

  if (focused.name === "embed") {
    const docs = await EmbedModel.find({ guildId, name: { $regex: query, $options: "i" } })
      .limit(25)
      .select("name")
      .lean();
    await interaction.respond(docs.map((d) => ({ name: d.name, value: d.name })));
    return;
  }

  if (focused.name === "application") {
    const docs = await ApplicationModel.find({ guildId, name: { $regex: query, $options: "i" } })
      .limit(25)
      .select("name")
      .lean();
    await interaction.respond(docs.map((d) => ({ name: d.name, value: d.name })));
    return;
  }

  await interaction.respond([]);
}
