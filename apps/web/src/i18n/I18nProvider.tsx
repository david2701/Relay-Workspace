import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { resolveInitialLocale, storeLocale } from "./detect";
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
  /** BCP-47 tag for Intl formatters */
  intlLocale: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function intlTag(locale: LocaleCode): string {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-US";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() =>
    resolveInitialLocale(),
  );

  const setLocale = (next: LocaleCode) => {
    storeLocale(next);
    setLocaleState(next);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t: TFunction = (key, vars) => translate(locale, key, vars ?? {});
    return { locale, setLocale, t, intlLocale: intlTag(locale) };
  }, [locale]);

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
