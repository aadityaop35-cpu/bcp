import { ChannelType, Events, Message } from "discord.js";
import { handleApplicationDM } from "../interactions/applicationFlow";

export const name = Events.MessageCreate;

export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.channel.type !== ChannelType.DM) return;

  try {
    await handleApplicationDM(message.client, message);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[messageCreate] Error handling application DM:", error);
    await message.channel
      .send("Something went wrong processing your answer. Please try again, or type `cancel` to restart.")
      .catch(() => undefined);
  }
}
