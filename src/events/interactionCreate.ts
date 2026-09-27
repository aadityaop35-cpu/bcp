import { Events, Interaction } from "discord.js";
import { ExtendedClient } from "../index";
import { handleInteractionError } from "../utils/errors";
import { handleEmbedEditorButton } from "../interactions/buttons/embedEditorButtons";
import { handleEmbedEditorModal } from "../interactions/modals/embedEditorModals";
import { handleTicketButton, handleTicketInfoModal } from "../interactions/buttons/ticketButtons";
import { handleApplicationSelect, handleApplicationStartButton } from "../interactions/buttons/applicationStartButton";
import { handleDatabasePurgeButton } from "../interactions/buttons/databasePurgeButton";

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
  const client = interaction.client as ExtendedClient;

  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      await command.autocomplete(interaction);
      return;
    }

    if (interaction.isButton()) {
      const [namespace] = interaction.customId.split(":");
      switch (namespace) {
        case "embededit":
          return void (await handleEmbedEditorButton(interaction));
        case "ticket":
          return void (await handleTicketButton(interaction));
        case "app":
          return void (await handleApplicationStartButton(interaction));
        case "dbpurge":
          return void (await handleDatabasePurgeButton(interaction));
        default:
          return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      const [namespace] = interaction.customId.split(":");
      if (namespace === "app") {
        return void (await handleApplicationSelect(interaction));
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const [namespace] = interaction.customId.split(":");
      switch (namespace) {
        case "embedmodal":
          return void (await handleEmbedEditorModal(interaction));
        case "ticketmodal":
          return void (await handleTicketInfoModal(interaction));
        default:
          return;
      }
    }
  } catch (error) {
    if (interaction.isRepliable()) {
      await handleInteractionError(interaction, error);
    } else {
      // eslint-disable-next-line no-console
      console.error("[interactionCreate] Unhandled error on non-repliable interaction:", error);
    }
  }
}
