import { createPrivateKey, createSign, sign } from "node:crypto";

/** APNs JWTs are reused for ~50 minutes (Apple allows up to 60). */
export const APNS_JWT_TTL_MS = 50 * 60 * 1000;
/** Refresh Google OAuth tokens a minute before expiry. */
export const FCM_TOKEN_SKEW_MS = 60 * 1000;

export function encodeBase64Url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

export function decodeBase64UrlJson<T>(segment: string): T {
  const json = Buffer.from(segment, "base64url").toString("utf8");
  return JSON.parse(json) as T;
}

/**
 * Sign a compact JWT with ES256 (P-256 + SHA-256, IEEE-P1363 signature).
 * Used for APNs .p8 keys. Node `crypto` only — no JWT libraries.
 */
export function signEs256Jwt(opts: {
  privateKeyPem: string;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}): string {
  const header = encodeBase64Url(JSON.stringify(opts.header));
  const payload = encodeBase64Url(JSON.stringify(opts.payload));
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(opts.privateKeyPem);
  const signature = sign("sha256", Buffer.from(signingInput, "utf8"), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

/**
 * Sign a compact JWT with RS256 (RSA PKCS#1 v1.5 + SHA-256).
 * Used for Google service-account OAuth assertions.
 */
export function signRs256Jwt(opts: {
  privateKeyPem: string;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}): string {
  const header = encodeBase64Url(
    JSON.stringify({ ...opts.header, alg: "RS256" }),
  );
  const payload = encodeBase64Url(JSON.stringify(opts.payload));
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(opts.privateKeyPem);
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(key);
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

export type CachedToken = {
  value: string;
  /** Epoch ms when the cached token should be treated as expired. */
  expiresAtMs: number;
};

export function isCachedTokenFresh(
  cached: CachedToken | null,
  nowMs: number,
): cached is CachedToken {
  return cached !== null && cached.expiresAtMs > nowMs;
}
