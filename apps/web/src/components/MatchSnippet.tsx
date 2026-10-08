import { useT } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/types";
import type { SearchMatch } from "../lib/types";

const PREFIX_KEYS: Record<SearchMatch["field"], MessageKey | null> = {
  title: null,
  goal: "match.goal",
  blocked_reason: "match.blockedReason",
  needs_you_reason: "match.reason",
  reminder_intent: "match.intent",
  note: "match.note",
};

type Props = {
  match: SearchMatch;
};

/** Highlighted match line when the hit is not in the title. */
export function MatchSnippet({ match }: Props) {
  const t = useT();
  if (match.field === "title") return null;
  const key = PREFIX_KEYS[match.field];
  const prefix = key ? t(key) : "";
  const snippet = match.snippet;
  const ranges = match.ranges ?? [];
  const parts: { text: string; mark: boolean }[] = [];
  let cursor = 0;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  for (const [start, end] of sorted) {
    if (start > cursor) {
      parts.push({ text: snippet.slice(cursor, start), mark: false });
    }
    parts.push({ text: snippet.slice(start, end), mark: true });
    cursor = end;
  }
  if (cursor < snippet.length) {
    parts.push({ text: snippet.slice(cursor), mark: false });
  }
  if (parts.length === 0) {
    parts.push({ text: snippet, mark: false });
  }

  return (
    <div className="match-snippet" aria-label={`${prefix}${snippet}`}>
      {prefix ? <span className="match-prefix">{prefix}</span> : null}
      <span className="match-body">
        {match.field === "note" ? "«" : null}
        {parts.map((p, i) =>
          p.mark ? (
            <mark key={`${i}-${p.text}`}>{p.text}</mark>
          ) : (
            <span key={`${i}-${p.text}`}>{p.text}</span>
          ),
        )}
        {match.field === "note" ? "»" : null}
      </span>
    </div>
  );
}
