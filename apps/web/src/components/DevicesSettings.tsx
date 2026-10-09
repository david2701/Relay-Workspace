/**
 * Settings → Devices: list / rename / revoke + pair-a-phone (QR + 6-digit code).
 * Native phone pairing UI is out of scope; this is the web host side.
 */
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/types";
import {
  api,
  type PairingSessionResponse,
  type RelayDevice,
} from "../lib/api";

function formatCountdown(expiresAt: string, nowMs: number): string {
  const remaining = Math.max(0, Date.parse(expiresAt) - nowMs);
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLATFORM_KEYS: Record<RelayDevice["platform"], MessageKey> = {
  ios: "settings.devices.platform.ios",
  android: "settings.devices.platform.android",
  web: "settings.devices.platform.web",
  other: "settings.devices.platform.other",
};

export function DevicesSettings() {
  const { t } = useI18n();
  const [devices, setDevices] = useState<RelayDevice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingSessionResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadDevices = async (): Promise<void> => {
    try {
      const res = await api.listDevices();
      setDevices(res.devices);
      setLoadError(null);
    } catch {
      setLoadError(t("settings.devices.loadError"));
    }
  };

  useEffect(() => {
    void loadDevices();
  }, []);

  useEffect(() => {
    if (!pairing) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(JSON.stringify(pairing.qr), {
      margin: 1,
      width: 200,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((url: string) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [pairing]);

  useEffect(() => {
    if (!pairing) return;
    const id = setInterval(() => {
      setNowMs(Date.now());
      void loadDevices();
    }, 1000);
    return () => clearInterval(id);
  }, [pairing]);

  useEffect(() => {
    if (!pairing) return;
    if (Date.parse(pairing.expires_at) <= Date.now()) {
      setPairing(null);
    }
  }, [pairing, nowMs]);

  const startPairing = async (): Promise<void> => {
    setBusy(true);
    try {
      const session = await api.startPairing();
      setPairing(session);
    } catch {
      setLoadError(t("settings.devices.pairError"));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string): Promise<void> => {
    setBusy(true);
    try {
      await api.revokeDevice(id);
      await loadDevices();
    } catch {
      setLoadError(t("settings.devices.revokeError"));
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async (id: string): Promise<void> => {
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.renameDevice(id, name);
      setRenamingId(null);
      await loadDevices();
    } catch {
      setLoadError(t("settings.devices.renameError"));
    } finally {
      setBusy(false);
    }
  };

  const active = devices.filter((d) => !d.revoked_at);
  const revoked = devices.filter((d) => d.revoked_at);
  const expired =
    pairing !== null && Date.parse(pairing.expires_at) <= nowMs;

  return (
    <div className="devices-settings" data-testid="devices-settings">
      <p className="settings-hint">{t("settings.devices.intro")}</p>
      {loadError ? <p className="settings-error">{loadError}</p> : null}

      <div className="devices-pair-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          data-testid="pair-phone-btn"
          onClick={() => void startPairing()}
        >
          {t("settings.devices.pairPhone")}
        </button>
      </div>

      {pairing && !expired ? (
        <div className="devices-pairing" data-testid="pairing-panel">
          <p className="settings-hint">{t("settings.devices.pairHint")}</p>
          <div className="devices-pairing-code mono" data-testid="pairing-code">
            {pairing.code}
          </div>
          <p className="devices-countdown" data-testid="pairing-countdown">
            {t("settings.devices.expiresIn", {
              time: formatCountdown(pairing.expires_at, nowMs),
            })}
          </p>
          {qrDataUrl ? (
            <img
              className="devices-qr"
              src={qrDataUrl}
              alt={t("settings.devices.qrAlt")}
              width={200}
              height={200}
              data-testid="pairing-qr"
            />
          ) : null}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPairing(null)}
          >
            {t("settings.devices.cancelPair")}
          </button>
        </div>
      ) : null}

      <h4 className="devices-subhead">{t("settings.devices.active")}</h4>
      {active.length === 0 ? (
        <p className="settings-hint" data-testid="devices-empty">
          {t("settings.devices.empty")}
        </p>
      ) : (
        <ul className="devices-list" data-testid="devices-list">
          {active.map((device) => (
            <li key={device.id} data-device-id={device.id}>
              {renamingId === device.id ? (
                <div className="devices-rename-row">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    aria-label={t("settings.devices.rename")}
                    maxLength={120}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => void saveRename(device.id)}
                  >
                    {t("settings.devices.saveName")}
                  </button>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setRenamingId(null)}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="devices-meta">
                    <strong>{device.name}</strong>
                    <span className="mono">
                      {t(PLATFORM_KEYS[device.platform])}
                    </span>
                  </div>
                  <div className="devices-actions">
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => {
                        setRenamingId(device.id);
                        setRenameValue(device.name);
                      }}
                    >
                      {t("settings.devices.rename")}
                    </button>
                    <button
                      type="button"
                      className="linkish devices-revoke"
                      disabled={busy}
                      onClick={() => void revoke(device.id)}
                    >
                      {t("settings.devices.revoke")}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {revoked.length > 0 ? (
        <>
          <h4 className="devices-subhead">{t("settings.devices.revoked")}</h4>
          <ul className="devices-list devices-list-revoked">
            {revoked.map((device) => (
              <li key={device.id}>
                <div className="devices-meta">
                  <strong>{device.name}</strong>
                  <span className="mono">
                    {t(PLATFORM_KEYS[device.platform])}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
