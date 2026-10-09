import { describe, expect, it } from "vitest";
import {
  isLoopbackHost,
  resolveAuthBindConfig,
} from "../src/auth_config.js";

describe("auth bind config", () => {
  it("defaults requireToken false on loopback", () => {
    const cfg = resolveAuthBindConfig({
      host: "127.0.0.1",
      port: 7420,
    });
    expect(cfg.requireToken).toBe(false);
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
  });

  it("refuses non-loopback when RELAY_REQUIRE_TOKEN=0", () => {
    expect(() =>
      resolveAuthBindConfig({
        host: "0.0.0.0",
        port: 7420,
        requireTokenEnv: "0",
      }),
    ).toThrow(/non-loopback/);
  });

  it("allows forcing tokens on loopback", () => {
    const cfg = resolveAuthBindConfig({
      host: "127.0.0.1",
      port: 7420,
      requireTokenEnv: "1",
    });
    expect(cfg.requireToken).toBe(true);
  });
});
