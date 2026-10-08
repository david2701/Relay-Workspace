import type { TFunction } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/types";
import type { Status } from "./types";

export function statusLabel(t: TFunction, status: Status): string {
  return t(`status.${status}` as MessageKey);
}

export function statusVerb(t: TFunction, status: Status): string {
  return t(`statusVerb.${status}` as MessageKey);
}

export function dueFacetLabel(t: TFunction, due: string): string {
  const key = `facet.due.${due}` as MessageKey;
  return t(key);
}
