import { ConflictError, DomainError, NotFoundError, ValidationError } from "@relay/core";
import type { Context } from "hono";
import { ZodError } from "zod";

function zodMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "Invalid request";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

export function handleError(c: Context, err: unknown): Response {
  if (err instanceof ValidationError) {
    return c.json({ error: err.code, message: err.message }, 400);
  }
  if (err instanceof ZodError) {
    return c.json({ error: "validation_error", message: zodMessage(err) }, 400);
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: err.code, message: err.message }, 404);
  }
  if (err instanceof ConflictError) {
    const body: {
      error: {
        code: string;
        message: string;
        current_updated_at?: string;
        item?: unknown;
      };
    } = {
      error: {
        code: "conflict",
        message: err.message,
      },
    };
    if (err.current_updated_at !== undefined) {
      body.error.current_updated_at = err.current_updated_at;
    }
    if (err.item !== undefined) {
      body.error.item = err.item;
    }
    return c.json(body, 409);
  }
  if (err instanceof DomainError) {
    return c.json({ error: err.code, message: err.message }, 400);
  }
  console.error(err);
  return c.json({ error: "internal_error", message: "Unexpected error" }, 500);
}
