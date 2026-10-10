import { describe, expect, it } from "vitest";
import { loadPushConfig, parsePushRedactEnv } from "../src/push/config.js";

/**
 * RELAY_PUSH_REDACT stays on unless the value is exactly `0` or `false`
 * (case-insensitive). Empty, typos, `no`, `off`, etc. keep redaction on.
 */
const REDACT_TABLE: Array<{
  raw: string | undefined;
  redact: boolean;
  note: string;
}> = [
  { raw: undefined, redact: true, note: "unset → default on" },
  { raw: "", redact: true, note: "empty → on" },
  { raw: "1", redact: true, note: "explicit 1 → on" },
  { raw: "true", redact: true, note: "true → on" },
  { raw: "TRUE", redact: true, note: "TRUE → on" },
  { raw: "yes", redact: true, note: "yes → on" },
  { raw: "on", redact: true, note: "on → on" },
  { raw: "no", redact: true, note: "no is not an off switch → on" },
  { raw: "NO", redact: true, note: "NO → on" },
  { raw: "off", redact: true, note: "off is not an off switch → on" },
  { raw: "OFF", redact: true, note: "OFF → on" },
  { raw: "typo", redact: true, note: "typo → on" },
  { raw: "falsey", redact: true, note: "falsey ≠ false → on" },
  { raw: "00", redact: true, note: "00 ≠ 0 → on" },
  { raw: " 0", redact: true, note: "leading space ≠ exact 0 → on" },
  { raw: "0 ", redact: true, note: "trailing space ≠ exact 0 → on" },
  { raw: "0", redact: false, note: "exact 0 → titles allowed" },
  { raw: "false", redact: false, note: "exact false → titles allowed" },
  { raw: "FALSE", redact: false, note: "FALSE → titles allowed" },
  { raw: "False", redact: false, note: "False → titles allowed" },
];

describe("parsePushRedactEnv", () => {
  it.each(REDACT_TABLE)("$note (raw=$raw)", ({ raw, redact }) => {
    expect(parsePushRedactEnv(raw)).toBe(redact);
  });

  it("loadPushConfig applies the same rule", () => {
    expect(loadPushConfig({}).redact).toBe(true);
    expect(loadPushConfig({ RELAY_PUSH_REDACT: "no" }).redact).toBe(true);
    expect(loadPushConfig({ RELAY_PUSH_REDACT: "off" }).redact).toBe(true);
    expect(loadPushConfig({ RELAY_PUSH_REDACT: "0" }).redact).toBe(false);
    expect(loadPushConfig({ RELAY_PUSH_REDACT: "false" }).redact).toBe(false);
  });
});
