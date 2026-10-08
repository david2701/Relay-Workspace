import { describe, expect, it } from "vitest";
import {
  EMPTY_FACETS,
  parseUrlState,
  type RelayUrlState,
  serializeUrlState,
} from "./url_state";

describe("url_state round-trip", () => {
  it("serializes canonical order and sorted facets", () => {
    const state: RelayUrlState = {
      view: "all",
      q: "demo",
      facets: {
        status: ["needs_you", "blocked"],
        actor: ["agent-research", "user"],
        due: "week",
        from: null,
        to: null,
        label: null,
      },
      item: "itm_abc",
      note: null,
    };
    const url = serializeUrlState(state);
    expect(url).toBe(
      "/all?q=demo&status=blocked,needs_you&actor=user,agent-research&due=week&item=itm_abc",
    );
    const { state: parsed, dirty } = parseUrlState(
      "/all",
      "?q=demo&status=blocked,needs_you&actor=user,agent-research&due=week&item=itm_abc",
    );
    expect(dirty).toBe(false);
    expect(parsed.facets.status).toEqual(["blocked", "needs_you"]);
    expect(parsed.facets.actor).toEqual(["user", "agent-research"]);
    expect(serializeUrlState(parsed)).toBe(url);
  });

  it("drops unknown status and marks dirty (V12-F7)", () => {
    const { state, dirty } = parseUrlState("/all", "?status=foo");
    expect(dirty).toBe(true);
    expect(state.facets.status).toEqual([]);
    expect(serializeUrlState(state)).toBe("/all");
  });

  it("accepts / as attention and canonicalizes", () => {
    const { state, dirty } = parseUrlState("/", "");
    expect(state.view).toBe("attention");
    expect(dirty).toBe(true);
    expect(serializeUrlState(state)).toBe("/attention");
  });

  it("range due keeps from/to; other due strips them", () => {
    const ranged = serializeUrlState({
      view: "all",
      q: "",
      facets: {
        ...EMPTY_FACETS,
        due: "range",
        from: "2026-10-12",
        to: "2026-10-18",
      },
      item: null,
      note: null,
    });
    expect(ranged).toBe("/all?due=range&from=2026-10-12&to=2026-10-18");

    const { state, dirty } = parseUrlState(
      "/all",
      "?due=today&from=2026-10-12",
    );
    expect(dirty).toBe(true);
    expect(state.facets.from).toBeNull();
    expect(state.facets.due).toBe("today");
  });

  it("filters unknown actors when catalog provided", () => {
    const known = new Set(["agent-research", "agent-code"]);
    const { state, dirty } = parseUrlState(
      "/all",
      "?actor=david,nope,agent-research",
      known,
    );
    expect(dirty).toBe(true);
    expect(state.facets.actor).toEqual(["user", "agent-research"]);
  });

  it("facet combinations AND in URL (status + actor)", () => {
    const url = serializeUrlState({
      view: "all",
      q: "",
      facets: {
        ...EMPTY_FACETS,
        status: ["blocked"],
        actor: ["agent-research"],
      },
      item: null,
      note: null,
    });
    expect(url).toBe("/all?status=blocked&actor=agent-research");
  });
});
