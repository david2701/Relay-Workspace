/**
 * Settings dialog per ui-spec v0.3 §2 — profile, language, timezone, theme, about.
 * Autosave on change; no Save button.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { formatLocaleDisplayName } from "../i18n/format_locale";
import { useI18n } from "../i18n/I18nProvider";
import { translate } from "../i18n/translate";
import type { LocaleCode, MessageKey } from "../i18n/types";
import { SUPPORTED_LOCALES } from "../i18n/types";
import type { RelaySettings } from "../lib/api";
import { graphemeCount, MAX_NAME_GRAPHEMES } from "../lib/grapheme";
import { initialFromName } from "../lib/initial_from_name";
import {
  browserTimeZone,
  listTimeZones,
  sameTimeZone,
} from "../lib/time_zones";
import { ThemeSwitch } from "./ThemeSwitch";

type Theme = "light" | "dark" | "system";
export type SettingsSection =
  | "profile"
  | "language"
  | "timezone"
  | "theme"
  | "about";

type Props = {
  open: boolean;
  settings: RelaySettings;
  theme: Theme;
  version: string;
  offline?: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<RelaySettings>) => Promise<void>;
  onThemeChange: (theme: Theme) => void;
  initialSection?: SettingsSection;
};

const LANG_LABEL: Record<LocaleCode, MessageKey> = {
  en: "lang.en",
  fr: "lang.fr",
  es: "lang.es",
};

const SECTION_KEYS: Record<SettingsSection, MessageKey> = {
  profile: "settings.section.profile",
  language: "settings.section.language",
  timezone: "settings.section.timezone",
  theme: "settings.section.theme",
  about: "settings.section.about",
};

const SECTIONS = Object.keys(SECTION_KEYS) as SettingsSection[];

export function SettingsPanel({
  open,
  settings,
  theme,
  version,
  offline = false,
  onClose,
  onPatch,
  onThemeChange,
  initialSection = "profile",
}: Props) {
  const { locale, setLocale, t, intlLocale } = useI18n();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [name, setName] = useState(settings.user_display_name);
  const [initial, setInitial] = useState(settings.user_initial);
  const [initialTouched, setInitialTouched] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [tzQuery, setTzQuery] = useState("");
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "offline"
  >("idle");
  const [announce, setAnnounce] = useState("");
  const [pendingPatch, setPendingPatch] = useState<Partial<RelaySettings> | null>(
    null,
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const langRadioRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const zones = useMemo(() => listTimeZones(), []);
  const browserZone = useMemo(() => browserTimeZone(), []);

  useEffect(() => {
    if (!open) return;
    setSection(initialSection);
    setName(settings.user_display_name);
    setInitial(settings.user_initial);
    setInitialTouched(false);
    setNameError(null);
    setTzQuery("");
    setStatus("idle");
    setPendingPatch(null);
    window.setTimeout(() => {
      if (initialSection === "language") {
        langRadioRef.current?.focus();
      } else if (initialSection === "profile") {
        nameRef.current?.focus();
      } else {
        panelRef.current
          ?.querySelector<HTMLElement>(`#settings-${initialSection}`)
          ?.querySelector<HTMLElement>("input,button,select,[href]")
          ?.focus();
      }
    }, 0);
  }, [
    open,
    initialSection,
    settings.user_display_name,
    settings.user_initial,
  ]);

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

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  async function persist(patch: Partial<RelaySettings>): Promise<boolean> {
    if (offline) {
      setPendingPatch(patch);
      setStatus("offline");
      return false;
    }
    setStatus("saving");
    try {
      await onPatch(patch);
      setStatus("saved");
      setPendingPatch(null);
      window.setTimeout(() => setStatus("idle"), 1000);
      return true;
    } catch {
      setStatus("error");
      setPendingPatch(patch);
      return false;
    }
  }

  async function commitName(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("settings.profile.nameError"));
      return;
    }
    if (graphemeCount(trimmed, intlLocale) > MAX_NAME_GRAPHEMES) {
      setNameError(t("settings.profile.nameTooLong"));
      return;
    }
    setNameError(null);
    const nextInitial =
      initialTouched && initial.trim()
        ? initial.trim().slice(0, 4)
        : initialFromName(trimmed, intlLocale) || "·";
    setInitial(nextInitial);
    setName(trimmed);
    await persist({
      user_display_name: trimmed,
      user_initial: nextInitial,
    });
  }

  function scheduleNameSave(): void {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void commitName();
    }, 600);
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
  const nameGraphemes = graphemeCount(name, intlLocale);
  const isTooLong = nameGraphemes > MAX_NAME_GRAPHEMES;
  const showCounter = nameGraphemes >= 32;

  if (!open) return null;

  const statusText =
    status === "saving"
      ? t("settings.saving")
      : status === "saved"
        ? t("settings.saved")
        : status === "error"
          ? t("settings.error")
          : status === "offline"
            ? t("settings.offlinePending")
            : "";

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        ref={panelRef}
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <h2 id="settings-title">{t("settings.title")}</h2>
          <span className="settings-status mono" aria-live="polite">
            {statusText}
            {status === "error" && pendingPatch ? (
              <>
                {" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    if (pendingPatch) void persist(pendingPatch);
                  }}
                >
                  {t("common.retry")}
                </button>
              </>
            ) : null}
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
            {SECTIONS.map((id) => (
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
                  aria-invalid={nameError || isTooLong ? true : undefined}
                  aria-describedby={
                    showCounter || nameError || isTooLong
                      ? "settings-name-meta"
                      : undefined
                  }
                  onChange={(e) => {
                    const next = e.target.value;
                    setName(next);
                    setNameError(null);
                    if (!initialTouched) {
                      setInitial(
                        next.trim()
                          ? initialFromName(next, intlLocale)
                          : "",
                      );
                    }
                    scheduleNameSave();
                  }}
                  onBlur={() => {
                    if (debounceRef.current !== null) {
                      window.clearTimeout(debounceRef.current);
                      debounceRef.current = null;
                    }
                    void commitName();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (debounceRef.current !== null) {
                        window.clearTimeout(debounceRef.current);
                        debounceRef.current = null;
                      }
                      void commitName();
                    }
                  }}
                />
                <span id="settings-name-meta">
                  {showCounter ? (
                    <span
                      className={`onboarding-counter mono${isTooLong ? " is-crit" : ""}`}
                    >
                      {t("settings.profile.nameCounter", {
                        count: nameGraphemes,
                      })}
                    </span>
                  ) : null}
                  {nameError || isTooLong ? (
                    <span className="settings-error" role="alert">
                      {nameError ?? t("settings.profile.nameTooLong")}
                    </span>
                  ) : null}
                </span>
              </label>
              <label className="settings-field settings-initial-row">
                <span>{t("settings.profile.initial")}</span>
                <div className="settings-initial-wrap">
                  <input
                    className="settings-initial-input"
                    value={initial}
                    maxLength={4}
                    onChange={(e) => {
                      setInitialTouched(true);
                      setInitial(e.target.value);
                    }}
                    onBlur={() => void commitInitial()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitInitial();
                      }
                    }}
                  />
                  <span
                    className="actor-mark actor-user actor-shape-circle"
                    style={{ width: 22, height: 22, fontSize: 11 }}
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
                    <label
                      key={code}
                      lang={code}
                      className={locale === code ? "on" : ""}
                    >
                      <input
                        ref={locale === code ? langRadioRef : undefined}
                        type="radio"
                        name="settings-locale"
                        value={code}
                        checked={locale === code}
                        onChange={() => {
                          setLocale(code);
                          let language: string = code;
                          try {
                            language =
                              new Intl.DisplayNames([code], {
                                type: "language",
                              }).of(code) ?? code;
                          } catch {
                            /* keep code */
                          }
                          setAnnounce(
                            translate(code, "settings.language.announce", {
                              language,
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
                <span>{t("settings.section.timezone")}</span>
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
                  <li className="settings-hint">
                    {t("settings.timezone.noResults")}
                  </li>
                ) : null}
              </ul>
              <p className="settings-hint">
                {t("settings.timezone.now", { time: nowInZone })}
              </p>
              <p className="settings-hint">{t("settings.timezone.dateOnlyNote")}</p>
              {!sameTimeZone(browserZone, settings.timezone) ? (
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

export function parseSettingsSection(
  raw: string | null | undefined,
): SettingsSection | null {
  if (!raw) return null;
  if ((SECTIONS as string[]).includes(raw)) return raw as SettingsSection;
  return null;
}
