import { GuildMember, ModalSubmitInteraction, MessageFlags } from "discord.js";
import { EmbedService } from "../../services/EmbedService";
import { PermissionService } from "../../services/PermissionService";
import { LoggingService } from "../../services/LoggingService";
import { PermissionError } from "../../utils/errors";
import { parseColor, sanitizeText } from "../../utils/validation";
import { embedEditorRows } from "../embedEditorPanel";
import { buildEmbedFromDoc } from "../../utils/discord";
import { IEmbed } from "../../models/Embed";

/** Handles customIds of the form embedmodal:<action>:<embedId> */
export async function handleEmbedEditorModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, action, embedId] = interaction.customId.split(":");
  const guildId = interaction.guildId!;

  const member = interaction.member as GuildMember;
  const isStaff = await PermissionService.isStaff(member);
  if (!isStaff) throw new PermissionError();

  let patch: Partial<IEmbed> = {};

  switch (action) {
    case "title": {
      const title = interaction.fields.getTextInputValue("title");
      const description = interaction.fields.getTextInputValue("description");
      const url = interaction.fields.getTextInputValue("url");
      patch = {
        title: title ? sanitizeText(title, 256) : undefined,
        description: description ? sanitizeText(description, 4000) : undefined,
        url: url || undefined,
      };
      break;
    }
    case "author": {
      const name = interaction.fields.getTextInputValue("name");
      const iconUrl = interaction.fields.getTextInputValue("iconUrl");
      const url = interaction.fields.getTextInputValue("url");
      patch = { author: name ? { name: sanitizeText(name, 256), iconUrl: iconUrl || undefined, url: url || undefined } : undefined };
      break;
    }
    case "images": {
      const thumbnail = interaction.fields.getTextInputValue("thumbnail");
      const image = interaction.fields.getTextInputValue("image");
      patch = { thumbnail: thumbnail || undefined, image: image || undefined };
      break;
    }
    case "footer": {
      const text = interaction.fields.getTextInputValue("text");
      const iconUrl = interaction.fields.getTextInputValue("iconUrl");
      patch = { footer: text ? { text: sanitizeText(text, 2048), iconUrl: iconUrl || undefined } : undefined };
      break;
    }
    case "color": {
      const colorInput = interaction.fields.getTextInputValue("color");
      patch = { color: parseColor(colorInput) ?? undefined };
      break;
    }
  }

  const doc = await EmbedService.update(guildId, embedId, patch);
  await LoggingService.log(interaction.client, guildId, "EMBED_EDITED", `Embed **${doc.name}** updated (${action}).`, {
    actorId: interaction.user.id,
    targetId: embedId,
  });

  const payload = { embeds: [buildEmbedFromDoc(doc)], components: embedEditorRows(embedId) };
  if (interaction.isFromMessage()) {
    await interaction.update(payload);
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
}
