import { z } from "zod";
import { AgentIdSchema } from "./ids.js";

export const AgentSchema = z.object({
  id: AgentIdSchema,
  display_name: z.string().min(1).max(80),
  monogram: z.string().min(1).max(2),
});
export type Agent = z.infer<typeof AgentSchema>;

/** Role-named demo agents (EN). Stable ids; names/monograms follow brief §3.6.1. */
export const DEFAULT_AGENTS: readonly Agent[] = [
  { id: "agent-code", display_name: "Code agent", monogram: "CO" },
  { id: "agent-research", display_name: "Research agent", monogram: "RS" },
  { id: "agent-writing", display_name: "Writing agent", monogram: "WR" },
  { id: "agent-data", display_name: "Data agent", monogram: "DA" },
] as const;
