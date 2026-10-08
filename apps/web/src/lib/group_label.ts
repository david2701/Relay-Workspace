import type { MessageKey } from "../i18n/types";

/** Stable server group codes → locale keys. */
const GROUP_MESSAGE_KEYS: Record<string, MessageKey> = {
  overdue: "group.overdue",
  today: "group.today",
  tomorrow: "group.tomorrow",
  week: "group.week",
  later: "group.later",
  none: "group.none",
  yesterday: "group.yesterday",
  this_week: "group.week",
};

export function groupMessageKey(code: string): MessageKey | null {
  return GROUP_MESSAGE_KEYS[code] ?? null;
}

/**
 * Resolve a server group code (and optional ISO date for weekday buckets)
 * into a localized header. Never use server `label` prose.
 */
export function formatGroupLabel(
  key: string,
  opts: {
    t: (k: MessageKey, vars?: Record<string, string | number>) => string;
    intlLocale: string;
    date?: string | undefined;
    timeZone?: string | undefined;
  },
): string {
  if (key.startsWith("dow-") && opts.date) {
    try {
      return new Intl.DateTimeFormat(opts.intlLocale, {
        weekday: "short",
        ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
      }).format(new Date(opts.date));
    } catch {
      /* fall through */
    }
  }
  const mk = groupMessageKey(key);
  if (mk) return opts.t(mk);
  // Unknown code — show key rather than English fallback prose.
  return key;
}
