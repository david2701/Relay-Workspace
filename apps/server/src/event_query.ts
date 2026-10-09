import { ValidationError } from "@relay/core";
import { z } from "zod";

/** Inclusive upper bound for after_seq / before_seq (avoid float/scientific cursors). */
export const MAX_AFTER_SEQ = Number.MAX_SAFE_INTEGER;

function seqCursorSchema(field: "after_seq" | "before_seq") {
  const message = `${field} must be a safe integer between 0 and ${MAX_AFTER_SEQ}`;
  return z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && Number.isSafeInteger(n), { message })
    .refine((n) => n >= 0 && n <= MAX_AFTER_SEQ, { message });
}

const EventLimitSchema = z.coerce
  .number()
  .refine((n) => Number.isFinite(n) && Number.isSafeInteger(n), {
    message: "limit must be an integer between 1 and 200",
  })
  .refine((n) => n >= 1 && n <= 200, {
    message: "limit must be an integer between 1 and 200",
  });

export type EventPageQuery = {
  after_seq?: number;
  before_seq?: number;
  limit?: number;
};

function issueMessage(err: z.ZodError, fallback: string): string {
  const first = err.issues[0];
  return first?.message ?? fallback;
}

/**
 * Shared query validation for event / handoff paging (`after_seq`, `before_seq`, `limit`).
 * Throws ValidationError (HTTP 400 / MCP tool error) — never ZodError.
 */
export function parseEventPageQuery(input: {
  after_seq?: string | number | undefined;
  before_seq?: string | number | undefined;
  limit?: string | number | undefined;
}): EventPageQuery {
  const out: EventPageQuery = {};
  if (input.after_seq !== undefined && input.after_seq !== "") {
    const parsed = seqCursorSchema("after_seq").safeParse(input.after_seq);
    if (!parsed.success) {
      throw new ValidationError(
        issueMessage(
          parsed.error,
          `after_seq must be a safe integer between 0 and ${MAX_AFTER_SEQ}`,
        ),
      );
    }
    out.after_seq = parsed.data;
  }
  if (input.before_seq !== undefined && input.before_seq !== "") {
    const parsed = seqCursorSchema("before_seq").safeParse(input.before_seq);
    if (!parsed.success) {
      throw new ValidationError(
        issueMessage(
          parsed.error,
          `before_seq must be a safe integer between 0 and ${MAX_AFTER_SEQ}`,
        ),
      );
    }
    out.before_seq = parsed.data;
  }
  if (input.limit !== undefined && input.limit !== "") {
    const parsed = EventLimitSchema.safeParse(input.limit);
    if (!parsed.success) {
      throw new ValidationError(
        issueMessage(parsed.error, "limit must be an integer between 1 and 200"),
      );
    }
    out.limit = parsed.data;
  }
  return out;
}
