import { GuildMember } from "discord.js";
import { CORE_CONFIG } from "../config/core";
import { GuildConfigModel } from "../models/GuildConfig";

/**
 * Central, reusable permission system.
 * - "developer": in CORE_CONFIG.developerUserIds (env-controlled, cross-guild).
 * - "staff": has a role in the guild's configured staffRoleIds (DB) OR the
 *   bootstrap CORE_CONFIG.staffRoleIds, OR has Administrator permission,
 *   OR is a developer.
 *
 * Any additional per-application staff roles (Application.staffRoleIds) are
 * checked separately via isApplicationStaff, and are ADDITIVE to guild staff.
 */
export class PermissionService {
  static isDeveloper(userId: string): boolean {
    return CORE_CONFIG.developerUserIds.includes(userId);
  }

  static async getGuildStaffRoleIds(guildId: string): Promise<string[]> {
    const config = await GuildConfigModel.findOne({ guildId }).lean();
    const dbRoles = config?.staffRoleIds ?? [];
    // Merge with bootstrap roles, de-duplicated.
    return Array.from(new Set([...dbRoles, ...CORE_CONFIG.staffRoleIds]));
  }

  static async isStaff(member: GuildMember): Promise<boolean> {
    if (this.isDeveloper(member.id)) return true;
    if (member.permissions.has("Administrator")) return true;
    const staffRoleIds = await this.getGuildStaffRoleIds(member.guild.id);
    if (staffRoleIds.length === 0) return false;
    return member.roles.cache.some((role) => staffRoleIds.includes(role.id));
  }

  /** Staff for a specific application: guild staff OR one of the application's own staffRoleIds. */
  static async isApplicationStaff(member: GuildMember, applicationStaffRoleIds: string[]): Promise<boolean> {
    if (await this.isStaff(member)) return true;
    if (applicationStaffRoleIds.length === 0) return false;
    return member.roles.cache.some((role) => applicationStaffRoleIds.includes(role.id));
  }

  static async getLogChannelId(guildId: string): Promise<string | undefined> {
    const config = await GuildConfigModel.findOne({ guildId }).lean();
    return config?.logChannelId;
  }

  static async getTicketCategoryId(guildId: string): Promise<string | undefined> {
    const config = await GuildConfigModel.findOne({ guildId }).lean();
    return config?.ticketCategoryId;
  }

  static async setStaffRoles(guildId: string, roleIds: string[]): Promise<void> {
    await GuildConfigModel.updateOne(
      { guildId },
      { $set: { staffRoleIds: roleIds } },
      { upsert: true }
    );
  }

  static async addStaffRole(guildId: string, roleId: string): Promise<void> {
    await GuildConfigModel.updateOne(
      { guildId },
      { $addToSet: { staffRoleIds: roleId } },
      { upsert: true }
    );
  }

  static async removeStaffRole(guildId: string, roleId: string): Promise<void> {
    await GuildConfigModel.updateOne({ guildId }, { $pull: { staffRoleIds: roleId } }, { upsert: true });
  }

  static async setLogChannel(guildId: string, channelId: string | null): Promise<void> {
    await GuildConfigModel.updateOne(
      { guildId },
      { $set: { logChannelId: channelId ?? undefined } },
      { upsert: true }
    );
  }

  static async setTicketCategory(guildId: string, categoryId: string | null): Promise<void> {
    await GuildConfigModel.updateOne(
      { guildId },
      { $set: { ticketCategoryId: categoryId ?? undefined } },
      { upsert: true }
    );
  }
}
