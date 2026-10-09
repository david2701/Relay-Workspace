/**
 * Calm empty-state when the browser is not paired under token auth.
 * Same form as Settings → Devices bootstrap (CLI + code).
 */
import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { api } from "../lib/api";
import { writeDeviceToken } from "../lib/device_token";
import { markBrowserPaired } from "../lib/pairing_gate";

type Props = {
  /** Called after the browser token is stored and the gate is cleared. */
  onPaired: () => void;
  /** Optional compact layout for Settings panel. */
  compact?: boolean;
};

export function PairingRequired({ onPaired, compact = false }: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [name, setName] = useState("This browser");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const register = async (): Promise<void> => {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setHint(t("pairing.codeInvalid"));
      return;
    }
    setBusy(true);
    setHint(null);
    try {
      const claimed = await api.claimPairing({
        code: trimmed,
        device_name: name.trim() || "This browser",
        platform: "web",
      });
      writeDeviceToken(claimed.token);
      markBrowserPaired();
      onPaired();
    } catch {
      setHint(t("pairing.registerFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={compact ? "pairing-required is-compact" : "pairing-required empty"}
      data-testid="pairing-required"
    >
      <p data-testid="pairing-required-title">{t("pairing.title")}</p>
      <p className="settings-hint">{t("pairing.intro")}</p>
      <pre className="devices-cli-cmd mono" data-testid="pairing-cli-cmd">
        pnpm relay:pair
      </pre>
      <label className="settings-field">
        <span>{t("pairing.code")}</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          data-testid="pairing-code-input"
        />
      </label>
      <label className="settings-field">
        <span>{t("pairing.name")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          data-testid="pairing-name-input"
        />
      </label>
      {hint ? (
        <p className="settings-hint" data-testid="pairing-hint">
          {hint}
        </p>
      ) : null}
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        data-testid="pairing-register-btn"
        onClick={() => void register()}
      >
        {t("pairing.register")}
      </button>
    </div>
  );
}
