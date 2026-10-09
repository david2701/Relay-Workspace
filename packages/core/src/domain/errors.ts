export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super("not_found", `${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends DomainError {
  /** Offending field name when known (`after_seq`, `text`, `Idempotency-Key`, …). */
  readonly field?: string;

  constructor(message: string, opts?: { field?: string }) {
    super("validation_error", message);
    this.name = "ValidationError";
    if (opts?.field !== undefined) {
      this.field = opts.field;
    }
  }
}

export class ConflictError extends DomainError {
  readonly current_updated_at?: string;
  /** Present on item optimistic-concurrency / take conflicts. */
  readonly item?: unknown;

  constructor(
    message: string,
    opts?: { current_updated_at?: string; item?: unknown },
  ) {
    super("conflict", message);
    this.name = "ConflictError";
    if (opts?.current_updated_at !== undefined) {
      this.current_updated_at = opts.current_updated_at;
    }
    if (opts?.item !== undefined) {
      this.item = opts.item;
    }
  }
}
