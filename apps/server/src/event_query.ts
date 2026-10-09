import { ValidationError } from "@relay/core";

/** Inclusive upper bound for after_seq / before_seq (avoid float/scientific cursors). */
export const MAX_AFTER_SEQ = Number.MAX_SAFE_INTEGER;

export type EventPageQuery = {
  after_seq?: number;
  before_seq?: number;
  limit?: number;
};

function isPresentParam(value: string | number | undefined): boolean {
  return value !== undefined;
}

/**
 * Parse a non-negative safe-integer seq cursor (`after_seq` / `before_seq`).
 * Empty string → 400 (must omit the param to use the default).
 */
function parseSeqCursor(
  field: "after_seq" | "before_seq",
  raw: string | number | undefined,
): number | undefined {
  if (!isPresentParam(raw)) return undefined;
  if (typeof raw === "string" && raw.trim() === "") {
    throw new ValidationError(`${field} must not be empty (omit the parameter for the default)`, {
      field,
    });
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 0 || n > MAX_AFTER_SEQ) {
    throw new ValidationError(
      `${field} must be a safe integer between 0 and ${MAX_AFTER_SEQ}`,
      { field },
    );
  }
  return n;
}

function parseLimit(raw: string | number | undefined): number | undefined {
  if (!isPresentParam(raw)) return undefined;
  if (typeof raw === "string" && raw.trim() === "") {
    throw new ValidationError("limit must not be empty (omit the parameter for the default)", {
      field: "limit",
    });
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 1 || n > 200) {
    throw new ValidationError("limit must be an integer between 1 and 200", {
      field: "limit",
    });
  }
  return n;
}

/**
 * Shared query validation for event / handoff paging (`after_seq`, `before_seq`, `limit`).
 * Throws ValidationError with `field` set — HTTP 400 / MCP tool error.
 *
 * Empty query values (`after_seq=`, `limit=`, `before_seq=`) are **400**, not
 * treated as defaults. Omit the parameter to use the default.
 */
export function parseEventPageQuery(input: {
  after_seq?: string | number | undefined;
  before_seq?: string | number | undefined;
  limit?: string | number | undefined;
}): EventPageQuery {
  const out: EventPageQuery = {};
  const after = parseSeqCursor("after_seq", input.after_seq);
  if (after !== undefined) out.after_seq = after;
  const before = parseSeqCursor("before_seq", input.before_seq);
  if (before !== undefined) out.before_seq = before;
  const limit = parseLimit(input.limit);
  if (limit !== undefined) out.limit = limit;
  return out;
}
