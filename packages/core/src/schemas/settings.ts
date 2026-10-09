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

const MAX_NAME_GRAPHEMES = 40;

/** Count extended grapheme clusters (PR4 / V03-O12). */
export function graphemeCount(text: string, locale = "en"): number {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity: string },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Segmenter) {
    const seg = new Segmenter(locale, { granularity: "grapheme" });
    return [...seg.segment(text)].length;
  }
  return [...text].length;
}

/** Stored settings — name may be empty until the user sets it (PR4). */
export const SettingsSchema = z.object({
  timezone: z.string().min(1),
  user_display_name: z.string(),
  user_initial: z.string().max(4),
  onboarding_completed_at: z.string().nullable(),
});

export type RelaySettings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: RelaySettings = {
  timezone: "UTC",
  user_display_name: "",
  user_initial: "",
  onboarding_completed_at: null,
};

const trimmedName = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1)
      .refine((s) => graphemeCount(s) <= MAX_NAME_GRAPHEMES, {
        message: `Display name must be at most ${MAX_NAME_GRAPHEMES} graphemes`,
      }),
  );

const trimmedInitial = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(4));

/** PATCH/PUT body — name/initial required non-empty when provided (PR4). */
export const UpdateSettingsSchema = z.object({
  timezone: z.string().min(1).optional(),
  user_display_name: trimmedName.optional(),
  user_initial: trimmedInitial.optional(),
  onboarding_completed_at: z
    .union([
      z
        .string()
        .min(1)
        .refine((s) => !Number.isNaN(Date.parse(s)), {
          message: "Invalid ISO timestamp",
        }),
      z.null(),
    ])
    .optional(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

/** First grapheme of `name`, uppercased for the actor monogram (PR4). */
export function initialFromName(name: string, locale = "en"): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity: string },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Segmenter) {
    const seg = new Segmenter(locale, { granularity: "grapheme" });
    const first = [...seg.segment(trimmed)][0]?.segment ?? "";
    return first.toLocaleUpperCase(locale);
  }
  return trimmed.charAt(0).toLocaleUpperCase(locale);
}

export { MAX_NAME_GRAPHEMES };
