import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { PermissionService } from "../services/PermissionService";
import { PermissionError, ValidationError } from "./errors";

/** Ensures the interaction happened in a guild and returns a typed GuildMember. */
export function requireGuildMember(interaction: ChatInputCommandInteraction): GuildMember {
  if (!interaction.guild || !interaction.member) {
    throw new ValidationError("This command can only be used inside a server.");
  }
  return interaction.member as GuildMember;
}

/** Throws PermissionError unless the invoking user is a configured developer. */
export function requireDeveloper(interaction: ChatInputCommandInteraction): void {
  if (!PermissionService.isDeveloper(interaction.user.id)) {
    throw new PermissionError("This command is restricted to bot developers.");
  }
}

/** Throws PermissionError unless the invoking member is staff for this guild. */
export async function requireStaff(interaction: ChatInputCommandInteraction): Promise<GuildMember> {
  const member = requireGuildMember(interaction);
  const isStaff = await PermissionService.isStaff(member);
  if (!isStaff) {
    throw new PermissionError("You need a configured staff role to use this command.");
  }
  return member;
}
