import { Client, Events } from "discord.js";
import { ApplicationSessionModel } from "../models/ApplicationSession";

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client<true>): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[ready] Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} guild(s).`);

  // Expire stale in-progress sessions (e.g. user vanished for weeks) so they
  // don't block a fresh attempt forever. Does NOT delete data — just marks status.
  const staleCutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7); // 7 days
  const { modifiedCount } = await ApplicationSessionModel.updateMany(
    { status: "IN_PROGRESS", lastInteractionAt: { $lt: staleCutoff } },
    { $set: { status: "EXPIRED" } }
  );
  if (modifiedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`[ready] Expired ${modifiedCount} stale application session(s).`);
  }
}
