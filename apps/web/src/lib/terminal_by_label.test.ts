import { describe, expect, it } from "vitest";
import { terminalByKeys } from "./terminal_by_label";

describe("terminalByKeys", () => {
  it("uses cancelled copy for cancelled items", () => {
    expect(terminalByKeys({ status: "cancelled" })).toEqual({
      byYou: "item.cancelledByYou",
      byName: "item.cancelledBy",
    });
  });

  it("uses completed copy for done items", () => {
    expect(terminalByKeys({ status: "done" })).toEqual({
      byYou: "item.completedByYou",
      byName: "item.completedBy",
    });
  });
});
