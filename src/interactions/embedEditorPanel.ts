import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";
import { IEmbed } from "../models/Embed";
import { buildEmbedFromDoc } from "../utils/discord";

/**
 * Renders the interactive staff-facing editor panel for an embed: a preview
 * plus buttons that open modals for each editable property. All buttons are
 * namespaced `embededit:<action>:<embedId>` and handled in
 * interactions/buttons/embedEditorButtons.ts.
 */
export function embedEditorRows(embedId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`embededit:title:${embedId}`).setLabel("Title/Desc/URL").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embededit:author:${embedId}`).setLabel("Author").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embededit:images:${embedId}`).setLabel("Thumbnail/Image").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embededit:footer:${embedId}`).setLabel("Footer").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`embededit:color:${embedId}`).setLabel("Color").setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`embededit:timestamp:${embedId}`).setLabel("Toggle Timestamp").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embededit:refresh:${embedId}`).setLabel("Refresh Published").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embededit:done:${embedId}`).setLabel("Done").setStyle(ButtonStyle.Success)
  );
  return [row1, row2];
}

export async function openEmbedEditorPanel(interaction: ChatInputCommandInteraction | ButtonInteraction, doc: IEmbed): Promise<void> {
  const rendered = buildEmbedFromDoc(doc);
  const payload = {
    content: `Editing \`${doc.name}\` — use \`/embed field\`, \`/embed button\`, and \`/embed application\` for those; use the buttons below for the rest.`,
    embeds: [rendered],
    components: embedEditorRows(String(doc._id)),
  };
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
}

export function titleModal(embedId: string, doc: IEmbed): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`embedmodal:title:${embedId}`)
    .setTitle("Title / Description / URL")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256).setValue(doc.title ?? "")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("description").setLabel("Description").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000).setValue(doc.description ?? "")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("url").setLabel("Title URL").setStyle(TextInputStyle.Short).setRequired(false).setValue(doc.url ?? "")
      )
    );
}

export function authorModal(embedId: string, doc: IEmbed): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`embedmodal:author:${embedId}`)
    .setTitle("Author")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("Author name").setStyle(TextInputStyle.Short).setRequired(false).setValue(doc.author?.name ?? "")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("iconUrl").setLabel("Author icon URL").setStyle(TextInputStyle.Short).setRequired(false).setValue(doc.author?.iconUrl ?? "")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("url").setLabel("Author URL").setStyle(TextInputStyle.Short).setRequired(false).setValue(doc.author?.url ?? "")
      )
    );
}

export function imagesModal(embedId: string, doc: IEmbed): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`embedmodal:images:${embedId}`)
    .setTitle("Thumbnail / Main Image")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("thumbnail").setLabel("Thumbnail URL").setStyle(TextInputStyle.Short).setRequired(false).setValue(doc.thumbnail ?? "")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("image").setLabel("Main image URL").setStyle(TextInputStyle.Short).setRequired(false).setValue(doc.image ?? "")
      )
    );
}

export function footerModal(embedId: string, doc: IEmbed): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`embedmodal:footer:${embedId}`)
    .setTitle("Footer")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("text").setLabel("Footer text").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2048).setValue(doc.footer?.text ?? "")
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("iconUrl").setLabel("Footer icon URL").setStyle(TextInputStyle.Short).setRequired(false).setValue(doc.footer?.iconUrl ?? "")
      )
    );
}

export function colorModal(embedId: string, doc: IEmbed): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`embedmodal:color:${embedId}`)
    .setTitle("Color")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("Hex color (e.g. #5865F2) or name (blurple)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(typeof doc.color === "number" ? `#${doc.color.toString(16).padStart(6, "0")}` : "")
      )
    );
}
