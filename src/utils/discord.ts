import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  time,
} from "discord.js";
import { IEmbed, IEmbedButton, IApplicationOption } from "../models/Embed";
import { chunk } from "./validation";

const BUTTON_STYLE_MAP: Record<IEmbedButton["style"], ButtonStyle> = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
  LINK: ButtonStyle.Link,
};

/** Builds a renderable discord.js EmbedBuilder from a stored IEmbed document, resolving application options. */
export function buildEmbedFromDoc(
  doc: Pick<
    IEmbed,
    "title" | "description" | "url" | "color" | "author" | "thumbnail" | "image" | "footer" | "showTimestamp" | "fields"
  >
): EmbedBuilder {
  const embed = new EmbedBuilder();
  if (doc.title) embed.setTitle(doc.title);
  if (doc.description) embed.setDescription(doc.description);
  if (doc.url) embed.setURL(doc.url);
  if (typeof doc.color === "number") embed.setColor(doc.color);
  if (doc.author?.name) embed.setAuthor({ name: doc.author.name, iconURL: doc.author.iconUrl, url: doc.author.url });
  if (doc.thumbnail) embed.setThumbnail(doc.thumbnail);
  if (doc.image) embed.setImage(doc.image);
  if (doc.footer?.text) embed.setFooter({ text: doc.footer.text, iconURL: doc.footer.iconUrl });
  if (doc.showTimestamp) embed.setTimestamp(new Date());
  if (doc.fields?.length) {
    embed.addFields(doc.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
  }

  // Discord rejects an embed with absolutely nothing set (no title, description,
  // fields, image, thumbnail, or author) — e.g. right after /embed create before
  // any properties have been configured. Guarantee there's always something.
  const hasAnyContent =
    !!doc.title || !!doc.description || !!doc.thumbnail || !!doc.image || !!doc.author?.name || (doc.fields?.length ?? 0) > 0;
  if (!hasAnyContent) {
    embed.setDescription("*This embed hasn't been configured yet — use the buttons below (or `/embed field add`) to add content.*");
  }

  return embed;
}

/**
 * Builds action rows for an embed's custom buttons AND its application options
 * (as buttons or a select menu), distributing across rows and respecting
 * Discord's 5-rows / 5-buttons-per-row / 25-select-options limits.
 *
 * customIdPrefix namespacing:
 *   embedbtn:<embedId>:<buttonId>
 *   app:start:<embedId>:<applicationId>
 *   app:select:<embedId>  (select menu, value = applicationId)
 */
export function buildEmbedComponents(
  embedId: string,
  buttons: IEmbedButton[],
  applicationOptions: IApplicationOption[]
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = Array.from({ length: 5 }, () => new ActionRowBuilder<ButtonBuilder>());
  const selectOptions: StringSelectMenuOptionBuilder[] = [];

  for (const btn of buttons) {
    const row = Math.min(Math.max(btn.row, 0), 4);
    const b = new ButtonBuilder().setLabel(btn.label).setStyle(BUTTON_STYLE_MAP[btn.style]);
    if (btn.emoji) b.setEmoji(btn.emoji);
    if (btn.style === "LINK") {
      if (btn.url) b.setURL(btn.url);
    } else {
      b.setCustomId(`embedbtn:${embedId}:${btn.id}`);
    }
    rows[row].addComponents(b);
  }

  for (const opt of applicationOptions) {
    if (opt.displayAs === "SELECT") {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(opt.label)
        .setValue(String(opt.applicationId));
      if (opt.description) option.setDescription(opt.description);
      if (opt.emoji) option.setEmoji(opt.emoji);
      selectOptions.push(option);
    } else {
      const row = Math.min(Math.max(opt.row, 0), 4);
      const b = new ButtonBuilder()
        .setLabel(opt.label)
        .setStyle(BUTTON_STYLE_MAP[opt.style] as Exclude<ButtonStyle, ButtonStyle.Link>)
        .setCustomId(`app:start:${embedId}:${String(opt.applicationId)}`);
      if (opt.emoji) b.setEmoji(opt.emoji);
      rows[row].addComponents(b);
    }
  }

  const nonEmptyRows = rows.filter((r) => r.components.length > 0);
  const finalRows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [...nonEmptyRows];

  if (selectOptions.length > 0) {
    // A select menu takes its own full row(s); chunk into groups of 25.
    for (const group of chunk(selectOptions, 25)) {
      if (finalRows.length >= 5) break; // Discord hard limit: 5 rows per message
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`app:select:${embedId}`)
        .setPlaceholder("Choose an application...")
        .addOptions(group);
      finalRows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
    }
  }

  return finalRows.slice(0, 5);
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x57f287).setDescription(`✅ ${message}`);
}

export function infoEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x5865f2).setDescription(message);
}

export function humanTimestamp(date: Date): string {
  return time(date, "f");
}

/** Simple paginator: returns pages of items and helper embed/button builders for a list command. */
export function paginate<T>(items: T[], pageSize: number, page: number): { pageItems: T[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(Math.max(page, 0), totalPages - 1);
  const start = clamped * pageSize;
  return { pageItems: items.slice(start, start + pageSize), totalPages, page: clamped };
}

export function paginationRow(customIdPrefix: string, page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:prev:${page}`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:next:${page}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

export function confirmRow(customIdPrefix: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${customIdPrefix}:confirm`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${customIdPrefix}:cancel`).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
}
