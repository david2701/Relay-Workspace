import type { ActorType, Agent, AssigneeType, WorkItem } from "./types";
import { USER_ACTOR_ID } from "./url_state";
import { getUserProfile } from "./user_profile";

export type ActorMarkModel = {
  kind: "user" | "agent" | "unassigned" | "system";
  name: string;
  monogram: string;
};

/** Shape always follows actor identity: human=circle, agent=rounded square (2 letters). */
export function markForUser(): ActorMarkModel {
  const u = getUserProfile();
  return { kind: "user", name: u.displayName, monogram: u.initial };
}

export function markForAgent(
  agents: readonly Agent[],
  agentId: string | null | undefined,
  agentFallback: string,
): ActorMarkModel {
  if (!agentId) {
    return { kind: "agent", name: agentFallback, monogram: "??" };
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
  labels?: { agentFallback: string; unassigned: string; system: string },
): ActorMarkModel {
  const agentFallback = labels?.agentFallback ?? "Agent";
  const unassigned = labels?.unassigned ?? "Unassigned";
  const system = labels?.system ?? "System";
  if (actorType === "user") return markForUser();
  if (actorType === "agent") return markForAgent(agents, actorId, agentFallback);
  if (actorType === "system") {
    return { kind: "system", name: system, monogram: "·" };
  }
  return { kind: "unassigned", name: unassigned, monogram: "" };
}

/** List-row witness: needs_you shows user; otherwise the assignee. */
export function markForWitness(
  item: WorkItem,
  agents: readonly Agent[],
  labels?: { agentFallback: string; unassigned: string; system: string },
): ActorMarkModel {
  if (item.status === "needs_you") return markForUser();
  return markForActor(item.assignee_type, item.assignee_id, agents, labels);
}

export function markForOwner(
  item: WorkItem,
  agents: readonly Agent[],
  labels?: { agentFallback: string; unassigned: string; system: string },
): ActorMarkModel {
  return markForActor(item.assignee_type, item.assignee_id, agents, labels);
}

export function markForCompleter(
  item: WorkItem,
  agents: readonly Agent[],
  labels?: { agentFallback: string; unassigned: string; system: string },
): ActorMarkModel | null {
  if (!item.completed_by_type) return null;
  const id =
    item.completed_by_type === "user" ? USER_ACTOR_ID : item.completed_by_id;
  return markForActor(item.completed_by_type, id, agents, labels);
}

export function assertMarkConsistent(mark: ActorMarkModel): void {
  const expected = getUserProfile().initial;
  if (mark.kind === "user" && mark.monogram !== expected) {
    throw new Error(
      `ActorMark inconsistency: human shape with monogram "${mark.monogram}"`,
    );
  }
  if (mark.kind === "agent" && mark.monogram === expected) {
    throw new Error("ActorMark inconsistency: agent shape with user monogram");
  }
}
