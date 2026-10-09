import { describe, expect, it } from "vitest";
import {
  isLoopbackHost,
  isLoopbackPublicUrl,
  resolveAuthBindConfig,
} from "../src/auth_config.js";

describe("auth bind config", () => {
  it("defaults requireToken false on loopback", () => {
    const cfg = resolveAuthBindConfig({
      host: "127.0.0.1",
      port: 7420,
    });
    expect(cfg.requireToken).toBe(false);
    expect(cfg.requireTokenExplicit).toBe(false);
    expect(cfg.authModeNotice).toMatch(/open \(loopback/i);
    expect(isLoopbackHost("localhost")).toBe(true);
  });

  it("defaults requireToken true on 0.0.0.0", () => {
    const cfg = resolveAuthBindConfig({
      host: "0.0.0.0",
      port: 7420,
      publicUrlEnv: "http://192.168.1.10:7420",
    });
    expect(cfg.requireToken).toBe(true);
    expect(cfg.publicUrl).toBe("http://192.168.1.10:7420");
    expect(cfg.authModeNotice).toMatch(/non-loopback RELAY_HOST/i);
  });

  it("refuses non-loopback host when RELAY_REQUIRE_TOKEN=0", () => {
    expect(() =>
      resolveAuthBindConfig({
        host: "0.0.0.0",
        port: 7420,
        requireTokenEnv: "0",
      }),
    ).toThrow(/non-loopback RELAY_HOST/);
  });

  it("refuses non-loopback PUBLIC_URL when RELAY_REQUIRE_TOKEN=0", () => {
    expect(() =>
      resolveAuthBindConfig({
        host: "127.0.0.1",
        port: 7420,
        requireTokenEnv: "0",
        publicUrlEnv: "http://192.168.1.10:7420",
      }),
    ).toThrow(/non-loopback RELAY_PUBLIC_URL/);
  });

  it("loopback bind + non-loopback PUBLIC_URL enforces tokens as REQUIRE_TOKEN=1", () => {
    const cfg = resolveAuthBindConfig({
      host: "127.0.0.1",
      port: 7420,
      publicUrlEnv: "https://host.tailnet-name.ts.net",
    });
    expect(cfg.requireToken).toBe(true);
    expect(cfg.requireTokenExplicit).toBe(true);
    expect(cfg.publicUrl).toBe("https://host.tailnet-name.ts.net");
    expect(cfg.authModeNotice).toMatch(/RELAY_PUBLIC_URL/i);
    expect(isLoopbackPublicUrl(cfg.publicUrl)).toBe(false);
  });

  it("loopback PUBLIC_URL on loopback bind stays open", () => {
    const cfg = resolveAuthBindConfig({
      host: "127.0.0.1",
      port: 7420,
      publicUrlEnv: "http://127.0.0.1:7420",
    });
    expect(cfg.requireToken).toBe(false);
    expect(cfg.requireTokenExplicit).toBe(false);
  });

  it("allows forcing tokens on loopback and marks explicit", () => {
    const cfg = resolveAuthBindConfig({
      host: "127.0.0.1",
      port: 7420,
      requireTokenEnv: "1",
    });
    expect(cfg.requireToken).toBe(true);
    expect(cfg.requireTokenExplicit).toBe(true);
    expect(cfg.authModeNotice).toMatch(/RELAY_REQUIRE_TOKEN=1/);
  });

  it("non-loopback default requireToken is not explicit", () => {
    const cfg = resolveAuthBindConfig({
      host: "0.0.0.0",
      port: 7420,
    });
    expect(cfg.requireToken).toBe(true);
    expect(cfg.requireTokenExplicit).toBe(false);
  });
});
