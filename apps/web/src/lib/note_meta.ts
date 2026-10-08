import type { TFunction } from "../i18n/I18nProvider";
import { formatRelative } from "./format";

/**
 * Note metadata line (§3.3.4 / §6 P2): date only, never authorship.
 * `created_by` / ActorMark deferred to P1 backlog.
 */
export function formatNoteMetaLine(
  t: TFunction,
  updatedAt: string,
  linkCount: number,
  now = new Date(),
): string {
  const datePart = t("note.meta.updated", {
    relative: formatRelative(updatedAt, now),
  });
  if (linkCount <= 0) return datePart;
  return `${datePart} · ${t("note.meta.linked", { n: linkCount })}`;
}

/** Reject invented authorship labels in the meta line. */
export function noteMetaHasAuthorship(meta: string): boolean {
  return (
    /\bTú\b/.test(meta) ||
    /\bYou\b/i.test(meta) ||
    /\bDS\b/.test(meta) ||
    /\bGB\b/.test(meta) ||
    /\bActorMark\b/i.test(meta) ||
    /Agente/i.test(meta) ||
    /\bAgent\b/i.test(meta)
  );
}
