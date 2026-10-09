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

export const DeviceSchema = z.object({
  id: DeviceIdSchema,
  name: z.string().min(1).max(120),
  platform: DevicePlatformSchema,
  created_at: z.string().datetime({ offset: true }),
  last_seen_at: z.string().datetime({ offset: true }),
  revoked_at: z.string().datetime({ offset: true }).nullable(),
});
export type Device = z.infer<typeof DeviceSchema>;

/** Public device row — never includes token or token_hash. */
export type DevicePublic = Device;

export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
export const PAIRING_MAX_ATTEMPTS = 5;
export const STREAM_TICKET_TTL_MS = 120 * 1000;
