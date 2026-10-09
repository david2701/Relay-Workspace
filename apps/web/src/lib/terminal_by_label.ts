import type { MessageKey } from "../i18n/types";
import type { WorkItem } from "./types";

export type TerminalByKeys = {
  byYou: MessageKey;
  byName: MessageKey;
};

/**
 * Provenance copy for terminal items. Data keeps completed_by_* for both
 * done and cancelled (terminal actor); the label branches on status.
 */
export function terminalByKeys(item: Pick<WorkItem, "status">): TerminalByKeys {
  if (item.status === "cancelled") {
    return {
      byYou: "item.cancelledByYou",
      byName: "item.cancelledBy",
    };
  }
  return {
    byYou: "item.completedByYou",
    byName: "item.completedBy",
  };
}
