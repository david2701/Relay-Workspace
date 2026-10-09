import { ValidationError } from "@relay/core";
import { z } from "zod";

/** Inclusive upper bound for after_seq (avoid float/scientific cursors). */
export const MAX_AFTER_SEQ = Number.MAX_SAFE_INTEGER;

const AfterSeqSchema = z.coerce
  .number()
  .refine((n) => Number.isFinite(n) && Number.isSafeInteger(n), {
    message: `after_seq must be a safe integer between 0 and ${MAX_AFTER_SEQ}`,
  })
  .refine((n) => n >= 0 && n <= MAX_AFTER_SEQ, {
    message: `after_seq must be a safe integer between 0 and ${MAX_AFTER_SEQ}`,
  });

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
  limit?: number;
};

function issueMessage(
  err: z.ZodError,
  fallback: string,
): string {
  const first = err.issues[0];
  return first?.message ?? fallback;
}

/**
 * Shared query validation for event paging (`after_seq`, `limit`).
 * Throws ValidationError (HTTP 400 / MCP tool error) — never ZodError.
 */
export function parseEventPageQuery(input: {
  after_seq?: string | number | undefined;
  limit?: string | number | undefined;
}): EventPageQuery {
  const out: EventPageQuery = {};
  if (input.after_seq !== undefined && input.after_seq !== "") {
    const parsed = AfterSeqSchema.safeParse(input.after_seq);
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
