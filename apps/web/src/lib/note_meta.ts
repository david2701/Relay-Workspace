import { formatRelative } from "./format";

/**
 * Note metadata line (§3.3.4 / §6 P2): date only, never authorship.
 * `created_by` / ActorMark deferred to P1 backlog.
 */
export function formatNoteMetaLine(
  updatedAt: string,
  linkCount: number,
  now = new Date(),
): string {
  const datePart = `Actualizada ${formatRelative(updatedAt, now)}`;
  if (linkCount <= 0) return datePart;
  const noun = linkCount === 1 ? "ítem" : "ítems";
  const adj = linkCount === 1 ? "vinculado" : "vinculados";
  return `${datePart} · ${linkCount} ${noun} ${adj}`;
}

/** Reject invented authorship labels in the meta line. */
export function noteMetaHasAuthorship(meta: string): boolean {
  return (
    /\bTú\b/.test(meta) ||
    /\bDS\b/.test(meta) ||
    /\bGB\b/.test(meta) ||
    /\bActorMark\b/i.test(meta) ||
    /Agente/i.test(meta)
  );
}
