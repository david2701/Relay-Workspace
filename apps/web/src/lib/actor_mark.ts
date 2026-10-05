import type { ActorType, Agent, AssigneeType, WorkItem } from "./types";

export type ActorMarkModel = {
  kind: "user" | "agent" | "unassigned" | "system";
  name: string;
  monogram: string;
};

const DAVID: ActorMarkModel = {
  kind: "user",
  name: "David",
  monogram: "D",
};

const UNASSIGNED: ActorMarkModel = {
  kind: "unassigned",
  name: "Sin asignar",
  monogram: "",
};

/** Shape always follows actor identity: human=circle (D), agent=rounded square (2 letters). */
export function markForUser(): ActorMarkModel {
  return DAVID;
}

export function markForAgent(
  agents: readonly Agent[],
  agentId: string | null | undefined,
): ActorMarkModel {
  if (!agentId) {
    return { kind: "agent", name: "Agente", monogram: "??" };
  }
  const agent = agents.find((a) => a.id === agentId);
  return {
    kind: "agent",
    name: agent?.display_name ?? agentId,
    monogram: agent?.monogram ?? "??",
  };
}

export function markForActor(
  actorType: ActorType | AssigneeType,
  actorId: string | null | undefined,
  agents: readonly Agent[],
): ActorMarkModel {
  if (actorType === "user") return markForUser();
  if (actorType === "agent") return markForAgent(agents, actorId);
  if (actorType === "system") {
    return { kind: "system", name: "Sistema", monogram: "·" };
  }
  return UNASSIGNED;
}

/** List-row witness: needs_you shows David; otherwise the assignee. */
export function markForWitness(
  item: WorkItem,
  agents: readonly Agent[],
): ActorMarkModel {
  if (item.status === "needs_you") return markForUser();
  return markForActor(item.assignee_type, item.assignee_id, agents);
}

/** Owner / dueño mark (SuggestedStrip, Traspaso): follows assignee, never mixes shape+monogram. */
export function markForOwner(
  item: WorkItem,
  agents: readonly Agent[],
): ActorMarkModel {
  return markForActor(item.assignee_type, item.assignee_id, agents);
}

/** Completer mark for Hechos / detail terminal banner. */
export function markForCompleter(
  item: WorkItem,
  agents: readonly Agent[],
): ActorMarkModel | null {
  if (!item.completed_by_type) return null;
  return markForActor(item.completed_by_type, item.completed_by_id, agents);
}

/** Runtime guard used by ActorMark and tests. */
export function assertMarkConsistent(mark: ActorMarkModel): void {
  if (mark.kind === "user" && mark.monogram !== "D") {
    throw new Error(
      `ActorMark inconsistency: human shape with monogram "${mark.monogram}"`,
    );
  }
  if (mark.kind === "agent" && mark.monogram === "D") {
    throw new Error("ActorMark inconsistency: agent shape with David monogram");
  }
  if (mark.kind === "agent" && mark.monogram.length === 1 && mark.monogram !== "?") {
    // agents use 2-letter monograms; allow ?? fallback
  }
}
