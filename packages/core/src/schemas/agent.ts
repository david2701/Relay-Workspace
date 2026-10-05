import { z } from "zod";
import { AgentIdSchema } from "./ids.js";

export const AgentSchema = z.object({
  id: AgentIdSchema,
  display_name: z.string().min(1).max(80),
  monogram: z.string().min(1).max(2),
});
export type Agent = z.infer<typeof AgentSchema>;

export const DEFAULT_AGENTS: readonly Agent[] = [
  { id: "grok-bot", display_name: "Grok Bot", monogram: "GB" },
  { id: "dev-senior", display_name: "Dev Senior", monogram: "DS" },
  { id: "ux-designer", display_name: "UI/UX Designer", monogram: "UX" },
  { id: "redactor", display_name: "Redactor", monogram: "RD" },
  { id: "qa", display_name: "QA", monogram: "QA" },
] as const;
