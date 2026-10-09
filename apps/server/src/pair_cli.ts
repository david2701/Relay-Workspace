/**
 * Local admin pairing — talks to SQLite via RelayService, never over HTTP.
 * Safe behind proxies: nothing on the wire can trigger this path.
 */
import type { PairingSession, RelayService } from "@relay/core";

export type PairCliResult = PairingSession;

export function startPairingViaCli(
  svc: RelayService,
  publicUrl: string,
): PairCliResult {
  return svc.startPairing({ publicUrl: publicUrl.replace(/\/$/, "") });
}

export function formatPairCliOutput(session: PairCliResult): string {
  const lines = [
    "Relay pairing (local admin CLI)",
    `Code: ${session.code}`,
    `Expires: ${session.expires_at}`,
    `QR payload: ${JSON.stringify(session.qr)}`,
    "",
    "On the phone (or Settings → Devices → Register this browser):",
    "  enter the code, or scan a QR of the payload above.",
    "The code is single-use and expires in 5 minutes.",
  ];
  return lines.join("\n");
}
