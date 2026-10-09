import { describe, expect, it } from "vitest";
import { formatCountdown } from "./format_countdown";

describe("formatCountdown", () => {
  it("shows at most 5:00 for a fresh 5-minute expiry (never 5:01)", () => {
    const now = Date.parse("2026-10-09T12:00:00.000Z");
    const expires = new Date(now + 5 * 60 * 1000).toISOString();
    expect(formatCountdown(expires, now)).toBe("5:00");
    // Sub-second remainder must floor, not ceil.
    expect(formatCountdown(expires, now - 500)).toBe("5:00");
  });

  it("floors partial seconds", () => {
    const now = Date.parse("2026-10-09T12:00:00.000Z");
    const expires = new Date(now + 61_500).toISOString();
    expect(formatCountdown(expires, now)).toBe("1:01");
  });
});
