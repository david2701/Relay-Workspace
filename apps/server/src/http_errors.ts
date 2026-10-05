import { DomainError, NotFoundError, ValidationError } from "@relay/core";
import type { Context } from "hono";

export function handleError(c: Context, err: unknown): Response {
  if (err instanceof ValidationError) {
    return c.json({ error: err.code, message: err.message }, 400);
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: err.code, message: err.message }, 404);
  }
  if (err instanceof DomainError) {
    return c.json({ error: err.code, message: err.message }, 400);
  }
  console.error(err);
  return c.json({ error: "internal_error", message: "Unexpected error" }, 500);
}
