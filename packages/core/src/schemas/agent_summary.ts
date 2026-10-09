import { z } from "zod";
import { AgentSchema } from "./agent.js";
import { ItemEventSchema } from "./item_event.js";
import { WorkItemSchema } from "./work_item.js";

/** Counts of items currently assigned to the agent, by status. */
export const AgentCountsSchema = z.object({
  needs_you: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  assigned: z.number().int().nonnegative(),
  /** `done` items assigned to the agent with `completed_at` in the last 7 days. */
  done: z.number().int().nonnegative(),
});
export type AgentCounts = z.infer<typeof AgentCountsSchema>;

export const AgentSummarySchema = AgentSchema.extend({
  last_seen_at: z.string().datetime({ offset: true }).nullable(),
  /** True when `last_seen_at` is within {@link AGENT_ACTIVE_MINUTES}. */
  active: z.boolean(),
  counts: AgentCountsSchema,
});
export type AgentSummary = z.infer<typeof AgentSummarySchema>;

/** Handoff event with the related item title for Team / agent-profile UIs. */
export const AgentHandoffSchema = ItemEventSchema.extend({
  item_title: z.string(),
});
export type AgentHandoff = z.infer<typeof AgentHandoffSchema>;

export const AgentHandoffsPageSchema = z.object({
  handoffs: z.array(AgentHandoffSchema),
  /** Oldest `seq` in this page (use as `before_seq` to load older). */
  next_seq: z.number().int().nonnegative(),
  has_more: z.boolean(),
});
export type AgentHandoffsPage = z.infer<typeof AgentHandoffsPageSchema>;

export const AgentProfileSchema = AgentSummarySchema.extend({
  current_items: z.array(WorkItemSchema),
  handoffs: AgentHandoffsPageSchema,
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
