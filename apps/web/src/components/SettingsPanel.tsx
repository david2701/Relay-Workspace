/**
 * Settings dialog per ui-spec v0.3 §2 — profile, language, timezone, theme, about.
 * Autosave on change; no Save button. PROVISIONAL shell until onboarding lands.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { formatLocaleDisplayName } from "../i18n/format_locale";
import { useI18n } from "../i18n/I18nProvider";
import type { LocaleCode, MessageKey } from "../i18n/types";
import { SUPPORTED_LOCALES } from "../i18n/types";
import type { RelaySettings } from "../lib/api";
import { initialFromName } from "../lib/initial_from_name";
import { ThemeSwitch } from "./ThemeSwitch";

type Theme = "light" | "dark" | "system";
type Section = "profile" | "language" | "timezone" | "theme" | "about";

type Props = {
  open: boolean;
  settings: RelaySettings;
  theme: Theme;
  version: string;
  onClose: () => void;
  onPatch: (patch: Partial<RelaySettings>) => Promise<void>;
  onThemeChange: (theme: Theme) => void;
  initialSection?: Section;
};

const LANG_LABEL: Record<LocaleCode, MessageKey> = {
  en: "lang.en",
  fr: "lang.fr",
  es: "lang.es",
};

const SECTION_KEYS: Record<Section, MessageKey> = {
  profile: "settings.section.profile",
  language: "settings.section.language",
  timezone: "settings.section.timezone",
  theme: "settings.section.theme",
  about: "settings.section.about",
};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function listTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    if (supported) return supported("timeZone");
  } catch {
    /* ignore */
  }
  return [
    "UTC",
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Asia/Tokyo",
  ];
}

export function SettingsPanel({
  open,
  settings,
  theme,
  version,
  onClose,
  onPatch,
  onThemeChange,
  initialSection = "profile",
}: Props) {
  const { locale, setLocale, t, intlLocale } = useI18n();
  const [section, setSection] = useState<Section>(initialSection);
  const [name, setName] = useState(settings.user_display_name);
  const [initial, setInitial] = useState(settings.user_initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const [tzQuery, setTzQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [announce, setAnnounce] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const zones = useMemo(() => listTimeZones(), []);
  const browserZone = useMemo(() => browserTimeZone(), []);

  useEffect(() => {
    if (!open) return;
    setSection(initialSection);
    setName(settings.user_display_name);
    setInitial(settings.user_initial);
    setNameError(null);
    setTzQuery("");
    setStatus("idle");
    window.setTimeout(() => nameRef.current?.focus(), 0);
  }, [open, initialSection, settings.user_display_name, settings.user_initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  async function persist(patch: Partial<RelaySettings>): Promise<boolean> {
    setStatus("saving");
    try {
      await onPatch(patch);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1000);
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }

  async function commitName(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("settings.profile.nameError"));
      return;
    }
    if (trimmed.length > 40) {
      setNameError(t("settings.profile.nameTooLong"));
      return;
    }
    setNameError(null);
    const nextInitial =
      initial.trim() || initialFromName(trimmed, intlLocale) || "·";
    setInitial(nextInitial);
    await persist({
      user_display_name: trimmed,
      user_initial: nextInitial.slice(0, 4),
    });
  }

  async function commitInitial(): Promise<void> {
    const trimmed = initial.trim();
    if (!trimmed) return;
    const upper = trimmed.slice(0, 4);
    setInitial(upper);
    await persist({ user_initial: upper });
  }

  const filteredZones = useMemo(() => {
    const q = tzQuery.trim().toLowerCase();
    if (!q) return zones.slice(0, 40);
    return zones.filter((z) => z.toLowerCase().includes(q)).slice(0, 40);
  }, [tzQuery, zones]);

  const formatLocaleName = formatLocaleDisplayName(intlLocale, locale);
  const nowInZone = new Intl.DateTimeFormat(intlLocale, {
    timeZone: settings.timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <h2 id="settings-title">{t("settings.title")}</h2>
          <span className="settings-status mono" aria-live="polite">
            {status === "saving"
              ? t("settings.saving")
              : status === "saved"
                ? t("settings.saved")
                : status === "error"
                  ? t("settings.error")
                  : ""}
          </span>
          <button
            type="button"
            className="settings-close"
            aria-label={t("settings.close")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-index" aria-label={t("settings.title")}>
            {(Object.keys(SECTION_KEYS) as Section[]).map((id) => (
              <a
                key={id}
                href={`#settings-${id}`}
                className={section === id ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  setSection(id);
                }}
              >
                {t(SECTION_KEYS[id])}
              </a>
            ))}
          </nav>
          <div className="settings-main">
            <section
              id="settings-profile"
              aria-labelledby="settings-profile-h"
              hidden={section !== "profile"}
            >
              <h3 id="settings-profile-h">{t("settings.section.profile")}</h3>
              <label className="settings-field">
                <span>{t("settings.profile.name")}</span>
                <input
                  ref={nameRef}
                  value={name}
                  maxLength={40}
                  aria-invalid={nameError ? true : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                    if (!initial.trim() && e.target.value.trim()) {
                      setInitial(initialFromName(e.target.value, intlLocale));
                    }
                  }}
                  onBlur={() => void commitName()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitName();
                    }
                  }}
                />
                {nameError ? (
                  <span className="settings-error" role="alert">
                    {nameError || t("settings.profile.nameError")}
                  </span>
                ) : null}
              </label>
              <label className="settings-field settings-initial-row">
                <span>{t("settings.profile.initial")}</span>
                <div className="settings-initial-wrap">
                  <input
                    className="settings-initial-input"
                    value={initial}
                    maxLength={4}
                    onChange={(e) => setInitial(e.target.value)}
                    onBlur={() => void commitInitial()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitInitial();
                      }
                    }}
                  />
                  <span
                    className="actor-mark"
                    data-kind="user"
                    data-shape="circle"
                    data-monogram={initial || "·"}
                    aria-hidden="true"
                  >
                    {initial || "·"}
                  </span>
                </div>
                <span className="settings-hint">
                  {t("settings.profile.initialHint")}
                </span>
              </label>
            </section>

            <section
              id="settings-language"
              aria-labelledby="settings-language-h"
              hidden={section !== "language"}
            >
              <h3 id="settings-language-h">{t("settings.section.language")}</h3>
              <fieldset className="settings-lang">
                <legend>{t("settings.language.label")}</legend>
                <div className="settings-segment" role="radiogroup">
                  {SUPPORTED_LOCALES.map((code) => (
                    <label key={code} lang={code} className={locale === code ? "on" : ""}>
                      <input
                        type="radio"
                        name="settings-locale"
                        value={code}
                        checked={locale === code}
                        onChange={() => {
                          setLocale(code);
                          setAnnounce(
                            t("settings.language.announce", {
                              language: t(LANG_LABEL[code]),
                            }),
                          );
                        }}
                      />
                      {t(LANG_LABEL[code])}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="settings-hint">
                {t("settings.language.formatLocale", {
                  localeName: formatLocaleName,
                })}
              </p>
              <p className="settings-hint">{t("settings.language.noTranslate")}</p>
              <span className="sr-only" aria-live="polite">
                {announce}
              </span>
            </section>

            <section
              id="settings-timezone"
              aria-labelledby="settings-timezone-h"
              hidden={section !== "timezone"}
            >
              <h3 id="settings-timezone-h">{t("settings.section.timezone")}</h3>
              <label className="settings-field">
                <span>{t("settings.timezone")}</span>
                <input
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={tzQuery.length > 0}
                  aria-controls="settings-tz-list"
                  placeholder={t("settings.timezone.search")}
                  value={tzQuery || settings.timezone}
                  onChange={(e) => setTzQuery(e.target.value)}
                  onFocus={() => setTzQuery("")}
                />
              </label>
              <ul id="settings-tz-list" className="settings-tz-list" role="listbox">
                {filteredZones.map((z) => (
                  <li key={z}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={z === settings.timezone}
                      className={z === settings.timezone ? "on" : ""}
                      onClick={() => {
                        setTzQuery("");
                        void persist({ timezone: z });
                      }}
                    >
                      {z}
                    </button>
                  </li>
                ))}
                {filteredZones.length === 0 ? (
                  <li className="settings-hint">{t("settings.timezone.noResults")}</li>
                ) : null}
              </ul>
              <p className="settings-hint">
                {t("settings.timezone.now", { time: nowInZone })}
              </p>
              <p className="settings-hint">{t("settings.timezone.dateOnlyNote")}</p>
              {browserZone !== settings.timezone ? (
                <div className="settings-tz-diff">
                  <p>
                    {t("settings.timezone.browserDiffers", {
                      browserZone,
                      zone: settings.timezone,
                    })}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void persist({ timezone: browserZone })}
                  >
                    {t("settings.timezone.useBrowser", {
                      browserZone,
                    })}
                  </button>
                </div>
              ) : null}
            </section>

            <section
              id="settings-theme"
              aria-labelledby="settings-theme-h"
              hidden={section !== "theme"}
            >
              <h3 id="settings-theme-h">{t("settings.section.theme")}</h3>
              <ThemeSwitch theme={theme} onChange={onThemeChange} />
            </section>

            <section
              id="settings-about"
              aria-labelledby="settings-about-h"
              hidden={section !== "about"}
            >
              <h3 id="settings-about-h">{t("settings.section.about")}</h3>
              <p className="mono settings-version">
                {version
                  ? t("settings.about.version", { version })
                  : t("settings.about.unknown")}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
