/**
 * First-run card per ui-spec v0.3 §3 — single card inside the app shell.
 * Empty store: language + name + timezone + start empty/sample.
 * Preloaded (items + onboarding_completed_at null): reload checkbox (PR1).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { LocaleCode, MessageKey } from "../i18n/types";
import { SUPPORTED_LOCALES } from "../i18n/types";
import { api, type RelaySettings } from "../lib/api";
import { graphemeCount, MAX_NAME_GRAPHEMES } from "../lib/grapheme";
import { initialFromName } from "../lib/initial_from_name";

type Props = {
  /** True when the store already has work items (demo-preloaded variant). */
  isPreloaded: boolean;
  onCompleted: (settings: RelaySettings) => void;
};

const LANG_LABEL: Record<LocaleCode, MessageKey> = {
  en: "lang.en",
  fr: "lang.fr",
  es: "lang.es",
};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function isKnownTimeZone(zone: string): boolean {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    if (supported) return supported("timeZone").includes(zone);
    Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
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

function zoneLongName(zone: string, intlLocale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(intlLocale, {
      timeZone: zone,
      timeZoneName: "longGeneric",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

function languageDisplayName(code: LocaleCode, intlLocale: string): string {
  try {
    const dn = new Intl.DisplayNames([intlLocale], { type: "language" });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

export function OnboardingCard({ isPreloaded, onCompleted }: Props) {
  const { locale, setLocale, t, intlLocale } = useI18n();
  const detectedZone = useMemo(() => browserTimeZone(), []);
  const zoneKnown = useMemo(() => isKnownTimeZone(detectedZone), [detectedZone]);
  const [timezone, setTimezone] = useState(zoneKnown ? detectedZone : "UTC");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [tzOpen, setTzOpen] = useState(!zoneKnown);
  const [tzQuery, setTzQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sampleError, setSampleError] = useState(false);
  const [reloadTouched, setReloadTouched] = useState(false);
  const [reloadSample, setReloadSample] = useState(locale !== "en");
  const nameRef = useRef<HTMLInputElement>(null);
  const busyTimer = useRef<number | null>(null);
  const [showBusy, setShowBusy] = useState(false);
  const zones = useMemo(() => listTimeZones(), []);

  useEffect(() => {
    window.setTimeout(() => nameRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!reloadTouched) setReloadSample(locale !== "en");
  }, [locale, reloadTouched]);

  useEffect(() => {
    return () => {
      if (busyTimer.current !== null) window.clearTimeout(busyTimer.current);
    };
  }, []);

  const liveInitial = initialFromName(name, intlLocale) || "·";
  const nameGraphemes = graphemeCount(name, intlLocale);
  const isTooLong = nameGraphemes > MAX_NAME_GRAPHEMES;
  const showCounter = nameGraphemes >= 32;

  const filteredZones = useMemo(() => {
    const q = tzQuery.trim().toLowerCase();
    if (!q) return zones.slice(0, 40);
    return zones.filter((z) => z.toLowerCase().includes(q)).slice(0, 40);
  }, [tzQuery, zones]);

  const zoneNow = new Intl.DateTimeFormat(intlLocale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  const zoneLabel = zoneLongName(timezone, intlLocale);

  function validateName(): string | null {
    const trimmed = name.trim();
    if (!trimmed) return t("onboarding.name.error");
    if (graphemeCount(trimmed, intlLocale) > MAX_NAME_GRAPHEMES) {
      return t("onboarding.name.tooLong");
    }
    return null;
  }

  async function complete(mode: "empty" | "sample" | "preloaded"): Promise<void> {
    const err = validateName();
    if (err) {
      setNameError(err);
      nameRef.current?.focus();
      return;
    }
    const trimmed = name.trim();
    const initial = initialFromName(trimmed, intlLocale);
    setNameError(null);
    setSampleError(false);
    setSubmitting(true);
    busyTimer.current = window.setTimeout(() => setShowBusy(true), 400);
    try {
      await api.updateSettings({
        timezone,
        user_display_name: trimmed,
        user_initial: initial,
      });
      if (mode === "sample" || (mode === "preloaded" && reloadSample)) {
        await api.loadSampleData(locale);
      }
      const { settings } = await api.updateSettings({
        onboarding_completed_at: new Date().toISOString(),
      });
      onCompleted(settings);
    } catch {
      if (mode === "sample" || (mode === "preloaded" && reloadSample)) {
        setSampleError(true);
      }
    } finally {
      if (busyTimer.current !== null) {
        window.clearTimeout(busyTimer.current);
        busyTimer.current = null;
      }
      setShowBusy(false);
      setSubmitting(false);
    }
  }

  const primaryAction = isPreloaded ? "preloaded" : "sample";

  return (
    <div className="onboarding-shell">
      <main className="onboarding-card">
        <h1 id="onboarding-title">{t("onboarding.title")}</h1>
        <p id="onboarding-lede" className="onboarding-lede">
          {t("onboarding.lede")}
        </p>
        <form
          aria-labelledby="onboarding-title"
          aria-describedby="onboarding-lede"
          onSubmit={(e) => {
            e.preventDefault();
            void complete(primaryAction);
          }}
        >
          <fieldset className="onboarding-lang" disabled={submitting}>
            <legend className="onboarding-label">
              {t("onboarding.language.label")}
            </legend>
            <div className="settings-segment" role="radiogroup">
              {SUPPORTED_LOCALES.map((code) => (
                <label
                  key={code}
                  lang={code}
                  className={locale === code ? "on" : ""}
                >
                  <input
                    type="radio"
                    name="onboarding-locale"
                    value={code}
                    checked={locale === code}
                    onChange={() => setLocale(code)}
                  />
                  {t(LANG_LABEL[code])}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="onboarding-name-row">
            <label className="settings-field onboarding-name-field" htmlFor="onboarding-name">
              <span className="onboarding-label">{t("onboarding.name.label")}</span>
              <input
                id="onboarding-name"
                ref={nameRef}
                value={name}
                autoComplete="name"
                aria-invalid={nameError || isTooLong ? true : undefined}
                aria-describedby={[
                  "onboarding-name-hint",
                  showCounter ? "onboarding-name-counter" : null,
                  nameError || isTooLong ? "onboarding-name-error" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
              <span id="onboarding-name-hint" className="settings-hint">
                {t("onboarding.name.hint")}
              </span>
              {showCounter ? (
                <span
                  id="onboarding-name-counter"
                  className={`onboarding-counter mono${isTooLong ? " is-crit" : ""}`}
                >
                  {t("onboarding.name.counter", { count: nameGraphemes })}
                </span>
              ) : null}
              {nameError || isTooLong ? (
                <span id="onboarding-name-error" className="settings-error" role="alert">
                  {nameError ?? t("onboarding.name.tooLong")}
                </span>
              ) : null}
            </label>
            <span
              className="actor-mark actor-user actor-shape-circle onboarding-mark"
              style={{ width: 22, height: 22, fontSize: 11 }}
              data-kind="user"
              data-shape="circle"
              data-monogram={liveInitial}
              aria-hidden="true"
            >
              {liveInitial}
            </span>
          </div>

          <div className="onboarding-tz">
            <span className="onboarding-label">{t("onboarding.timezone.label")}</span>
            {!tzOpen ? (
              <div className="onboarding-tz-line">
                <span>
                  {timezone} · {zoneLabel} · {zoneNow}
                </span>
                <button
                  type="button"
                  className="linkish"
                  disabled={submitting}
                  onClick={() => setTzOpen(true)}
                >
                  {t("onboarding.timezone.change")}
                </button>
              </div>
            ) : (
              <>
                {!zoneKnown && timezone === "UTC" ? (
                  <p className="settings-hint">
                    UTC · {t("onboarding.timezone.unknown")}{" "}
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => setTzOpen(true)}
                    >
                      {t("onboarding.timezone.choose")}
                    </button>
                  </p>
                ) : null}
                <input
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded
                  aria-controls="onboarding-tz-list"
                  placeholder={t("settings.timezone.search")}
                  value={tzQuery || timezone}
                  disabled={submitting}
                  onChange={(e) => setTzQuery(e.target.value)}
                  onFocus={() => setTzQuery("")}
                />
                <ul id="onboarding-tz-list" className="settings-tz-list" role="listbox">
                  {filteredZones.map((z) => (
                    <li key={z}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={z === timezone}
                        className={z === timezone ? "on" : ""}
                        onClick={() => {
                          setTimezone(z);
                          setTzQuery("");
                          setTzOpen(false);
                        }}
                      >
                        {z}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {zoneKnown && !tzOpen ? (
              <p className="settings-hint">{t("onboarding.timezone.detected")}</p>
            ) : null}
          </div>

          {isPreloaded ? (
            <div className="onboarding-start">
              <p className="onboarding-preloaded-note">{t("onboarding.preloaded.note")}</p>
              <label className="onboarding-reload">
                <input
                  type="checkbox"
                  checked={reloadSample}
                  disabled={submitting}
                  onChange={(e) => {
                    setReloadTouched(true);
                    setReloadSample(e.target.checked);
                  }}
                />
                <span>
                  {t("onboarding.preloaded.reload", {
                    language: languageDisplayName(locale, intlLocale),
                  })}
                </span>
              </label>
              <div className="onboarding-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || isTooLong}
                  aria-busy={showBusy || undefined}
                >
                  {showBusy ? t("onboarding.submitting") : t("onboarding.start.go")}
                </button>
              </div>
            </div>
          ) : (
            <fieldset className="onboarding-start" disabled={submitting}>
              <legend className="onboarding-label">
                {t("onboarding.start.legend")}
              </legend>
              <div className="onboarding-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || isTooLong}
                  aria-busy={showBusy || undefined}
                >
                  {showBusy
                    ? t("onboarding.submitting")
                    : t("onboarding.start.sample")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submitting || isTooLong}
                  onClick={() => void complete("empty")}
                >
                  {t("onboarding.start.empty")}
                </button>
              </div>
              <p className="settings-hint">{t("onboarding.start.sampleHint")}</p>
            </fieldset>
          )}

          {sampleError ? (
            <div className="onboarding-error-band" role="alert">
              <span>{t("onboarding.error.sample")}</span>{" "}
              <button
                type="button"
                className="linkish"
                onClick={() => void complete(primaryAction)}
              >
                {t("common.retry")}
              </button>{" "}
              {!isPreloaded ? (
                <button
                  type="button"
                  className="linkish"
                  onClick={() => void complete("empty")}
                >
                  {t("onboarding.start.empty")}
                </button>
              ) : null}
            </div>
          ) : null}

          <p className="onboarding-later">{t("onboarding.later")}</p>
        </form>
      </main>
    </div>
  );
}
