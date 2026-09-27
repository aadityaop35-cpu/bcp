import { ButtonInteraction, MessageFlags } from "discord.js";
import { EmbedService } from "../../services/EmbedService";
import { requireStaff } from "../../utils/permissions";
import { PermissionError } from "../../utils/errors";
import { PermissionService } from "../../services/PermissionService";
import {
  authorModal,
  colorModal,
  embedEditorRows,
  footerModal,
  imagesModal,
  titleModal,
} from "../embedEditorPanel";
import { buildEmbedFromDoc, successEmbed } from "../../utils/discord";
import { GuildMember } from "discord.js";

/** Handles customIds of the form embededit:<action>:<embedId> */
export async function handleEmbedEditorButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, embedId] = interaction.customId.split(":");
  const guildId = interaction.guildId!;

  const member = interaction.member as GuildMember;
  const isStaff = await PermissionService.isStaff(member);
  if (!isStaff) throw new PermissionError();

  const doc = await EmbedService.getByIdOrName(guildId, embedId);

  switch (action) {
    case "title":
      await interaction.showModal(titleModal(embedId, doc));
      return;
    case "author":
      await interaction.showModal(authorModal(embedId, doc));
      return;
    case "images":
      await interaction.showModal(imagesModal(embedId, doc));
      return;
    case "footer":
      await interaction.showModal(footerModal(embedId, doc));
      return;
    case "color":
      await interaction.showModal(colorModal(embedId, doc));
      return;
    case "timestamp": {
      const updated = await EmbedService.update(guildId, embedId, { showTimestamp: !doc.showTimestamp });
      await interaction.update({ embeds: [buildEmbedFromDoc(updated)], components: embedEditorRows(embedId) });
      return;
    }
    case "refresh": {
      await interaction.deferUpdate();
      const result = await EmbedService.refreshPublished(interaction.client, guildId, embedId);
      await interaction.followUp({ embeds: [successEmbed(`Refreshed ${result.updated} message(s), ${result.failed} failed.`)], flags: MessageFlags.Ephemeral });
      return;
    }
    case "done":
      await interaction.update({ content: "Editor closed.", components: [] });
      return;
  }
}
