import { z } from "zod";

/** Stable internal human actor id (replaces legacy "david"). */
export const USER_ACTOR_ID = "user" as const;

/** Legacy URL / API / MCP alias — rewritten to USER_ACTOR_ID. */
export const USER_ACTOR_LEGACY_ALIASES = ["david"] as const;

export function normalizeUserActorId(id: string): string {
  if (
    (USER_ACTOR_LEGACY_ALIASES as readonly string[]).includes(id) ||
    id === USER_ACTOR_ID
  ) {
    return USER_ACTOR_ID;
  }
  return id;
}

export function isUserActorId(id: string): boolean {
  return normalizeUserActorId(id) === USER_ACTOR_ID;
}

export const SettingsSchema = z.object({
  timezone: z.string().min(1),
  user_display_name: z.string().min(1).max(80),
  user_initial: z.string().min(1).max(4),
});

export type RelaySettings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: RelaySettings = {
  timezone: "UTC",
  user_display_name: "You",
  user_initial: "Y",
};

export const UpdateSettingsSchema = SettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
