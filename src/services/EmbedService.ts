import { Client, TextChannel } from "discord.js";
import { EmbedModel, IEmbed, IEmbedButton, IApplicationOption } from "../models/Embed";
import { ApplicationModel } from "../models/Application";
import { NotFoundError, ValidationError, isDiscordAPIError } from "../utils/errors";
import { buildEmbedComponents, buildEmbedFromDoc } from "../utils/discord";
import { LIMITS } from "../config/core";

export class EmbedService {
  static async create(guildId: string, name: string, createdBy: string): Promise<IEmbed> {
    const existing = await EmbedModel.findOne({ guildId, name }).lean();
    if (existing) throw new ValidationError(`An embed named "${name}" already exists in this server.`);
    return EmbedModel.create({ guildId, name, fields: [], buttons: [], applicationOptions: [], publishedMessages: [], createdBy });
  }

  static async getByIdOrName(guildId: string, idOrName: string): Promise<IEmbed> {
    const byId = idOrName.match(/^[a-f0-9]{24}$/i) ? await EmbedModel.findOne({ _id: idOrName, guildId }) : null;
    const doc = byId ?? (await EmbedModel.findOne({ guildId, name: idOrName }));
    if (!doc) throw new NotFoundError(`Embed "${idOrName}"`);
    return doc;
  }

  static async list(guildId: string): Promise<IEmbed[]> {
    return EmbedModel.find({ guildId }).sort({ updatedAt: -1 }).lean() as unknown as IEmbed[];
  }

  static async delete(guildId: string, idOrName: string): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    await EmbedModel.deleteOne({ _id: doc._id, guildId });
    return doc;
  }

  static async update(guildId: string, idOrName: string, patch: Partial<IEmbed>): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    Object.assign(doc, patch);
    await doc.save();
    return doc;
  }

  static async addField(guildId: string, idOrName: string, name: string, value: string, inline: boolean): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    if (doc.fields.length >= LIMITS.MAX_EMBED_FIELDS) {
      throw new ValidationError(`Embeds can have at most ${LIMITS.MAX_EMBED_FIELDS} fields.`);
    }
    doc.fields.push({ name, value, inline });
    await doc.save();
    return doc;
  }

  static async removeField(guildId: string, idOrName: string, index: number): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    if (index < 0 || index >= doc.fields.length) throw new ValidationError("Invalid field index.");
    doc.fields.splice(index, 1);
    await doc.save();
    return doc;
  }

  static async addButton(guildId: string, idOrName: string, button: Omit<IEmbedButton, "id">): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    const totalComponents = doc.buttons.length + doc.applicationOptions.length;
    if (totalComponents >= LIMITS.MAX_BUTTONS_PER_ROW * LIMITS.MAX_ACTION_ROWS) {
      throw new ValidationError("This embed already has the maximum number of components.");
    }
    const id = `b${doc.buttons.length + 1}_${Date.now().toString(36)}`;
    doc.buttons.push({ ...button, id });
    await doc.save();
    return doc;
  }

  static async removeButton(guildId: string, idOrName: string, buttonId: string): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    const before = doc.buttons.length;
    doc.buttons = doc.buttons.filter((b) => b.id !== buttonId);
    if (doc.buttons.length === before) throw new NotFoundError(`Button "${buttonId}"`);
    await doc.save();
    return doc;
  }

  static async addApplicationOption(
    guildId: string,
    idOrName: string,
    option: Omit<IApplicationOption, "applicationId"> & { applicationId: string }
  ): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    const app = await ApplicationModel.findOne({ _id: option.applicationId, guildId });
    if (!app) throw new NotFoundError("Application");
    const totalComponents = doc.buttons.length + doc.applicationOptions.length;
    if (totalComponents >= LIMITS.MAX_BUTTONS_PER_ROW * LIMITS.MAX_ACTION_ROWS) {
      throw new ValidationError("This embed already has the maximum number of components.");
    }
    doc.applicationOptions.push({ ...option, applicationId: app._id } as IApplicationOption);
    await doc.save();
    return doc;
  }

  static async removeApplicationOption(guildId: string, idOrName: string, applicationId: string): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    const before = doc.applicationOptions.length;
    doc.applicationOptions = doc.applicationOptions.filter((o) => String(o.applicationId) !== applicationId);
    if (doc.applicationOptions.length === before) throw new NotFoundError("Application option on this embed");
    await doc.save();
    return doc;
  }

  /** Sends the embed to a channel and records the published message for later refresh. */
  static async publish(client: Client, guildId: string, idOrName: string, channelId: string): Promise<IEmbed> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new ValidationError("That channel doesn't exist or isn't a text channel I can send messages in.");
    }
    const rendered = buildEmbedFromDoc(doc);
    const components = buildEmbedComponents(String(doc._id), doc.buttons, doc.applicationOptions);
    const message = await (channel as TextChannel).send({ embeds: [rendered], components });
    doc.publishedMessages.push({ channelId, messageId: message.id, publishedAt: new Date() });
    await doc.save();
    return doc;
  }

  /** Re-renders and edits every live published message for this embed (best-effort per message). */
  static async refreshPublished(client: Client, guildId: string, idOrName: string): Promise<{ updated: number; failed: number }> {
    const doc = await this.getByIdOrName(guildId, idOrName);
    const rendered = buildEmbedFromDoc(doc);
    const components = buildEmbedComponents(String(doc._id), doc.buttons, doc.applicationOptions);

    let updated = 0;
    let failed = 0;
    const stillValid: typeof doc.publishedMessages = [];

    for (const pub of doc.publishedMessages) {
      try {
        const channel = await client.channels.fetch(pub.channelId).catch(() => null);
        if (!channel || !channel.isTextBased() || !("messages" in channel)) {
          failed++;
          continue; // channel gone — drop this published-message record
        }
        const message = await (channel as TextChannel).messages.fetch(pub.messageId).catch((err) => {
          if (isDiscordAPIError(err, 10008) /* Unknown Message */) return null;
          throw err;
        });
        if (!message) {
          failed++;
          continue; // message deleted — drop this record
        }
        await message.edit({ embeds: [rendered], components });
        updated++;
        stillValid.push(pub);
      } catch {
        failed++;
        stillValid.push(pub); // transient error — keep the record, don't drop it
      }
    }

    doc.publishedMessages = stillValid;
    await doc.save();
    return { updated, failed };
  }

  /** Refreshes every published embed in the guild that references the given application (called after an application edit). */
  static async refreshEmbedsReferencingApplication(client: Client, guildId: string, applicationId: string): Promise<void> {
    const embeds = await EmbedModel.find({
      guildId,
      "applicationOptions.applicationId": applicationId,
    });
    for (const embed of embeds) {
      await this.refreshPublished(client, guildId, String(embed._id)).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[EmbedService] Failed to refresh embed ${embed._id}:`, err);
      });
    }
  }
}
