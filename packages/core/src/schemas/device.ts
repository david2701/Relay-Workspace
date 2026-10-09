import { z } from "zod";

export const DeviceIdSchema = z.string().regex(/^dev_[a-z0-9]+$/);
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const DevicePlatformSchema = z.enum([
  "web",
  "ios",
  "android",
  "other",
]);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const PushPlatformSchema = z.enum(["apns", "fcm"]);
export type PushPlatform = z.infer<typeof PushPlatformSchema>;

export const PushEnvironmentSchema = z.enum(["sandbox", "production"]);
export type PushEnvironment = z.infer<typeof PushEnvironmentSchema>;

/** Max length for a push provider token (APNs hex / FCM registration). */
export const PUSH_TOKEN_MAX_LENGTH = 4096;
/** Max APNs topic / bundle id length. */
export const PUSH_TOPIC_MAX_LENGTH = 256;

export const RegisterPushInputSchema = z.object({
  platform: PushPlatformSchema,
  token: z.string().min(8).max(PUSH_TOKEN_MAX_LENGTH),
  environment: PushEnvironmentSchema,
  topic: z.string().min(1).max(PUSH_TOPIC_MAX_LENGTH).optional(),
  muted: z.boolean().optional(),
});
export type RegisterPushInput = z.infer<typeof RegisterPushInputSchema>;

export const DeviceSchema = z.object({
  id: DeviceIdSchema,
  name: z.string().min(1).max(120),
  platform: DevicePlatformSchema,
  created_at: z.string().datetime({ offset: true }),
  last_seen_at: z.string().datetime({ offset: true }),
  revoked_at: z.string().datetime({ offset: true }).nullable(),
  push_platform: PushPlatformSchema.nullable().optional(),
  push_environment: PushEnvironmentSchema.nullable().optional(),
  push_topic: z.string().nullable().optional(),
  push_muted: z.boolean().optional(),
  /** True when a push token is registered — never the token itself. */
  has_push_token: z.boolean().optional(),
});
export type Device = z.infer<typeof DeviceSchema>;

/** Public device row — never includes auth token, token_hash, or push token. */
export type DevicePublic = Device;

/** Internal row used by the push dispatcher (includes plaintext push token). */
export type DevicePushTarget = {
  device_id: string;
  platform: PushPlatform;
  token: string;
  environment: PushEnvironment;
  topic: string | null;
  muted: boolean;
};

export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
export const PAIRING_MAX_ATTEMPTS = 5;
export const STREAM_TICKET_TTL_MS = 120 * 1000;
export const PUSH_TITLE_MAX_LENGTH = 80;
