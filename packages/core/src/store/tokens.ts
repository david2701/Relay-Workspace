import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes as URL-safe base64 (no padding). */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest of a token. Never store the plaintext token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time equality for equal-length hex digests.
 * Returns false when lengths differ (after a dummy compare).
 */
export function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Six-digit decimal code, cryptographically random (000000–999999). */
export function generatePairingCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}
