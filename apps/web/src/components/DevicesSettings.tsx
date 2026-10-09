/**
 * Settings → Devices: list / rename / revoke + pair-a-phone (QR + 6-digit code).
 * Under token auth without a browser token, shows the calm PairingRequired form
 * (no red errors — 401 is expected).
 */
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { usePairingGate } from "../hooks/usePairingGate";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/types";
import { ApiError, api, type PairingSessionResponse, type RelayDevice } from "../lib/api";
import { readDeviceToken } from "../lib/device_token";
import { formatCountdown } from "../lib/format_countdown";
import {
  getPairingGate,
  markBrowserUnpaired,
} from "../lib/pairing_gate";
import { PairingRequired } from "./PairingRequired";

const PLATFORM_KEYS: Record<RelayDevice["platform"], MessageKey> = {
  ios: "settings.devices.platform.ios",
  android: "settings.devices.platform.android",
  web: "settings.devices.platform.web",
  other: "settings.devices.platform.other",
};

type Props = {
  onPaired?: () => void;
};

export function DevicesSettings({ onPaired }: Props) {
  const { t } = useI18n();
  const gate = usePairingGate();
  const [devices, setDevices] = useState<RelayDevice[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingSessionResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [hasBrowserToken, setHasBrowserToken] = useState(
    () => readDeviceToken() !== null,
  );

  const loadDevices = async (): Promise<void> => {
    if (getPairingGate().needsPairing) {
      setDevices([]);
      setHint(null);
      return;
    }
    try {
      const res = await api.listDevices();
      setDevices(res.devices);
      setHint(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setDevices([]);
        setHint(null);
        return;
      }
      setHint(t("settings.devices.loadError"));
    }
  };

  useEffect(() => {
    void loadDevices();
  }, [gate.needsPairing]);

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
      setHint(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setHint(null);
        return;
      }
      setHint(t("settings.devices.pairError"));
    } finally {
      setBusy(false);
    }
  };

  const clearBrowserToken = (): void => {
    markBrowserUnpaired();
    setHasBrowserToken(false);
  };

  const revoke = async (id: string): Promise<void> => {
    setBusy(true);
    try {
      await api.revokeDevice(id);
      await loadDevices();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setHint(t("settings.devices.revokeError"));
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
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setHint(t("settings.devices.renameError"));
    } finally {
      setBusy(false);
    }
  };

  const active = devices.filter((d) => !d.revoked_at);
  const revoked = devices.filter((d) => d.revoked_at);
  const expired =
    pairing !== null && Date.parse(pairing.expires_at) <= nowMs;

  if (gate.needsPairing) {
    return (
      <div className="devices-settings" data-testid="devices-settings">
        <p className="settings-hint">{t("settings.devices.intro")}</p>
        <PairingRequired
          compact
          onPaired={() => {
            setHasBrowserToken(true);
            void loadDevices();
            onPaired?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="devices-settings" data-testid="devices-settings">
      <p className="settings-hint">{t("settings.devices.intro")}</p>
      {hint ? <p className="settings-hint">{hint}</p> : null}

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
        {hasBrowserToken && gate.requireToken ? (
          <button
            type="button"
            className="linkish"
            data-testid="clear-browser-token"
            onClick={clearBrowserToken}
          >
            {t("settings.devices.clearBrowserToken")}
          </button>
        ) : null}
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
