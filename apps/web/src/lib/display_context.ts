import type { LocaleCode } from "../i18n/types";

export type DisplayContext = {
  timezone: string;
  intlLocale: string;
  locale: LocaleCode;
};

const DEFAULT: DisplayContext = {
  timezone: "Europe/Paris",
  intlLocale: "es-ES",
  locale: "es",
};

let ctx: DisplayContext = { ...DEFAULT };

export function getDisplayContext(): DisplayContext {
  return ctx;
}

export function setDisplayContext(patch: Partial<DisplayContext>): void {
  ctx = { ...ctx, ...patch };
}

export function resetDisplayContextForTests(): void {
  ctx = { ...DEFAULT };
}
