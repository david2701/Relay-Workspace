import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { resolveInitialLocale, storeLocale } from "./detect";
import { resolveFormatLocale } from "./format_locale";
import { applyPseudoLocale, isPseudoLocaleEnabled } from "./pseudo_locale";
import { translate } from "./translate";
import type { LocaleCode, MessageKey } from "./types";

export type TFunction = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

type I18nContextValue = {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: TFunction;
  /** BCP-47 tag for Intl formatters (PR5 region-aware). */
  intlLocale: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() =>
    resolveInitialLocale(),
  );
  const [intlLocale, setIntlLocale] = useState<string>(() =>
    resolveFormatLocale(resolveInitialLocale()),
  );

  const setLocale = (next: LocaleCode) => {
    storeLocale(next);
    setLocaleState(next);
    setIntlLocale(resolveFormatLocale(next));
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      const hourCycle = new Intl.DateTimeFormat(intlLocale, {
        hour: "numeric",
      }).resolvedOptions().hourCycle;
      if (hourCycle) {
        document.documentElement.dataset.hourCycle = hourCycle;
      }
    } catch {
      /* ignore */
    }
  }, [locale, intlLocale]);

  const value = useMemo<I18nContextValue>(() => {
    const baseT: TFunction = (key, vars) =>
      translate(locale, key, vars ?? {});
    const t: TFunction = isPseudoLocaleEnabled()
      ? (key, vars) => applyPseudoLocale(baseT(key, vars))
      : baseT;
    return { locale, setLocale, t, intlLocale };
  }, [locale, intlLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}
