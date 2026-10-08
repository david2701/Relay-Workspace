import { useMemo } from "react";
import { useT } from "../i18n/I18nProvider";

export function useActorLabels() {
  const t = useT();
  return useMemo(
    () => ({
      agentFallback: t("item.agentFallback"),
      unassigned: t("actor.unassigned"),
      system: t("actor.system"),
    }),
    [t],
  );
}
