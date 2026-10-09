/**
 * `pnpm relay:pair` — print a one-time pairing code + QR payload.
 * Uses the same DB as the running server; does not call HTTP.
 */
import { RelayService } from "@relay/core";
import { loadEnv } from "../src/env.js";
import { formatPairCliOutput, startPairingViaCli } from "../src/pair_cli.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const svc = new RelayService({ dbPath: env.RELAY_DB });
  try {
    const session = startPairingViaCli(svc, env.auth.publicUrl);
    // Print only the formatted block — never log the token (claim returns that).
    console.log(formatPairCliOutput(session));
  } finally {
    svc.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
