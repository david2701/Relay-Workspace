import type { Source, Status } from "../schemas/enums.js";
import type { Actor, SetStatusInput, WorkItem } from "../schemas/work_item.js";
import { ConflictError, ValidationError } from "./errors.js";
import { nowIso } from "./time.js";

const TERMINAL: ReadonlySet<Status> = new Set(["done", "cancelled"]);

export function isTerminal(status: Status): boolean {
  return TERMINAL.has(status);
}

export function assertReasonForStatus(input: SetStatusInput): void {
  if (input.status === "blocked") {
    const reason = input.blocked_reason?.trim() ?? "";
    if (reason.length < 3) {
      throw new ValidationError("blocked_reason is required (min 3 characters)");
    }
  }
  if (input.status === "needs_you") {
    const reason = input.needs_you_reason?.trim() ?? "";
    if (reason.length < 3) {
      throw new ValidationError("needs_you_reason is required (min 3 characters)");
    }
  }
}

export type ApplyStatusArgs = {
  item: WorkItem;
  input: SetStatusInput;
  actor: Actor;
  source: Source;
  at?: Date;
};

export function applyStatusChange(args: ApplyStatusArgs): WorkItem {
  const { item, input, actor, source } = args;
  const at = args.at ?? new Date();
  const iso = nowIso(at);
  assertReasonForStatus(input);
  const next: WorkItem = {
    ...item,
    status: input.status,
    updated_at: iso,
    last_actor_type: actor.type,
    last_actor_id: actor.id,
    source: item.source === "system" ? source : item.source,
  };
  if (input.status === "blocked") {
    next.blocked_reason = input.blocked_reason?.trim() ?? item.blocked_reason;
  }
  if (input.status === "needs_you") {
    next.needs_you_reason = input.needs_you_reason?.trim() ?? item.needs_you_reason;
  }
  if (input.status === "in_progress" && item.started_at === null) {
    next.started_at = iso;
  }
  if (input.status === "done" || input.status === "cancelled") {
    next.completed_at = iso;
    next.completed_by_type = actor.type;
    next.completed_by_id = actor.id;
  }
  if (!isTerminal(input.status) && isTerminal(item.status)) {
    // reopen path handled by reopenItem
    throw new ValidationError("Use reopen to leave a terminal status");
  }
  return next;
}

export type ReopenArgs = {
  item: WorkItem;
  actor: Actor;
  at?: Date;
};

export function reopenItem(args: ReopenArgs): WorkItem {
  const { item, actor } = args;
  if (!isTerminal(item.status)) {
    throw new ValidationError("Only done or cancelled items can be reopened");
  }
  const at = args.at ?? new Date();
  const iso = nowIso(at);
  const hasAssignee =
    item.assignee_type !== "unassigned" && item.assignee_id !== null;
  return {
    ...item,
    status: hasAssignee ? "assigned" : "inbox",
    completed_at: null,
    completed_by_type: null,
    completed_by_id: null,
    updated_at: iso,
    last_actor_type: actor.type,
    last_actor_id: actor.id,
  };
}

export type CompleteArgs = {
  item: WorkItem;
  actor: Actor;
  source: Source;
  at?: Date;
};

export function completeItem(args: CompleteArgs): WorkItem {
  const payload: ApplyStatusArgs = {
    item: args.item,
    input: { status: "done" },
    actor: args.actor,
    source: args.source,
  };
  if (args.at) payload.at = args.at;
  return applyStatusChange(payload);
}

export type DelegateArgs = {
  item: WorkItem;
  agentId: string;
  actor: Actor;
  source: Source;
  at?: Date;
};

export function delegateItem(args: DelegateArgs): WorkItem {
  const at = args.at ?? new Date();
  const iso = nowIso(at);
  return {
    ...args.item,
    assignee_type: "agent",
    assignee_id: args.agentId,
    status: "assigned",
    updated_at: iso,
    last_actor_type: args.actor.type,
    last_actor_id: args.actor.id,
    source: args.item.source === "system" ? args.source : args.item.source,
  };
}

export type AskUserArgs = {
  item: WorkItem;
  reason: string;
  actor: Actor;
  source: Source;
  at?: Date;
};

/** Sets needs_you without changing assignee (Q2 / B5). */
export function askUser(args: AskUserArgs): WorkItem {
  const reason = args.reason.trim();
  if (reason.length < 3) {
    throw new ValidationError("needs_you_reason is required (min 3 characters)");
  }
  const payload: ApplyStatusArgs = {
    item: args.item,
    input: { status: "needs_you", needs_you_reason: reason },
    actor: args.actor,
    source: args.source,
  };
  if (args.at) payload.at = args.at;
  return applyStatusChange(payload);
}

export type TakeItemArgs = {
  item: WorkItem;
  actor: Actor;
  source: Source;
  userId: string;
  at?: Date;
};

/**
 * «Lo hago yo» — assign to the user and set in_progress.
 * Rejects terminal items (done / cancelled) with ConflictError (409).
 */
export function takeItem(args: TakeItemArgs): WorkItem {
  if (isTerminal(args.item.status)) {
    throw new ConflictError(
      `Cannot take a ${args.item.status} item`,
      {
        item: args.item,
        current_updated_at: args.item.updated_at,
      },
    );
  }
  const at = args.at ?? new Date();
  const iso = nowIso(at);
  return {
    ...args.item,
    assignee_type: "user",
    assignee_id: args.userId,
    status: "in_progress",
    started_at: args.item.started_at ?? iso,
    updated_at: iso,
    last_actor_type: args.actor.type,
    last_actor_id: args.actor.id,
    source: args.item.source === "system" ? args.source : args.item.source,
  };
}

/** Return a needs_you item to its agent assignee (status → assigned). */
export function returnToAgent(
  item: WorkItem,
  actor: Actor,
  source: Source,
  at: Date = new Date(),
): WorkItem {
  if (item.status !== "needs_you") {
    throw new ValidationError("Only needs_you items can be returned to an agent");
  }
  if (item.assignee_type !== "agent" || !item.assignee_id) {
    throw new ValidationError("Item has no agent assignee to return to");
  }
  return applyStatusChange({
    item,
    input: { status: "assigned" },
    actor,
    source,
    at,
  });
}

export function stampActor(
  item: WorkItem,
  actor: Actor,
  at: Date = new Date(),
): WorkItem {
  return {
    ...item,
    updated_at: nowIso(at),
    last_actor_type: actor.type,
    last_actor_id: actor.id,
  };
}
