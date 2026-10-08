/** PROVISIONAL — language, display name, initial, timezone; not final product settings UX. */
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { LocaleCode, MessageKey } from "../i18n/types";
import { SUPPORTED_LOCALES } from "../i18n/types";
import type { RelaySettings } from "../lib/api";

type Props = {
  open: boolean;
  settings: RelaySettings;
  onClose: () => void;
  onChange: (patch: Partial<RelaySettings>) => void;
  onSave: (patch: Partial<RelaySettings>) => Promise<void>;
};

const LANG_LABEL: Record<LocaleCode, MessageKey> = {
  en: "lang.en",
  fr: "lang.fr",
  es: "lang.es",
};

export function SettingsPanel({
  open,
  settings,
  onClose,
  onChange,
  onSave,
}: Props) {
  const { locale, setLocale, t } = useI18n();
  const [draft, setDraft] = useState(settings);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

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

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-label={t("settings.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t("settings.title")}</h3>
        <label className="settings-field">
          <span>{t("settings.language")}</span>
          <select
            aria-label={t("settings.language")}
            value={locale}
            onChange={(e) => {
              const next = e.target.value as LocaleCode;
              setLocale(next);
            }}
          >
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>
                {t(LANG_LABEL[code])}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span>{t("settings.name")}</span>
          <input
            aria-label={t("settings.name")}
            value={draft.user_display_name}
            onChange={(e) => {
              const v = e.target.value;
              setDraft((d) => ({ ...d, user_display_name: v }));
              onChange({ user_display_name: v });
            }}
          />
        </label>
        <label className="settings-field">
          <span>{t("settings.initial")}</span>
          <input
            aria-label={t("settings.initial")}
            maxLength={4}
            value={draft.user_initial}
            onChange={(e) => {
              const v = e.target.value.slice(0, 4);
              setDraft((d) => ({ ...d, user_initial: v }));
              onChange({ user_initial: v });
            }}
          />
        </label>
        <label className="settings-field">
          <span>{t("settings.timezone")}</span>
          <input
            aria-label={t("settings.timezone")}
            value={draft.timezone}
            onChange={(e) => {
              const v = e.target.value;
              setDraft((d) => ({ ...d, timezone: v }));
              onChange({ timezone: v });
            }}
            placeholder="Europe/Paris"
          />
        </label>
        <div className="settings-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("settings.close")}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void onSave(draft).then(() => {
                setSavedFlash(true);
                window.setTimeout(() => setSavedFlash(false), 1500);
              });
            }}
          >
            {savedFlash ? t("settings.saved") : t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
