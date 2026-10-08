import { z } from "zod";
import { AgentIdSchema } from "./ids.js";

export const AgentSchema = z.object({
  id: AgentIdSchema,
  display_name: z.string().min(1).max(80),
  monogram: z.string().min(1).max(2),
});
export type Agent = z.infer<typeof AgentSchema>;

export type AgentLocale = "en" | "fr" | "es";

/**
 * Role-named demo agents (brief §3.6.1 / Producto).
 * Stable ids; display names + monograms follow the chosen seed locale.
 */
export const AGENTS_BY_LOCALE: Record<AgentLocale, readonly Agent[]> = {
  en: [
    { id: "agent-code", display_name: "Code agent", monogram: "CO" },
    { id: "agent-research", display_name: "Research agent", monogram: "RS" },
    { id: "agent-writing", display_name: "Writing agent", monogram: "WR" },
    { id: "agent-data", display_name: "Data agent", monogram: "DA" },
  ],
  es: [
    { id: "agent-code", display_name: "Agente de código", monogram: "CO" },
    {
      id: "agent-research",
      display_name: "Agente de investigación",
      monogram: "IN",
    },
    { id: "agent-writing", display_name: "Agente de redacción", monogram: "RD" },
    { id: "agent-data", display_name: "Agente de datos", monogram: "DA" },
  ],
  fr: [
    { id: "agent-code", display_name: "Agent de code", monogram: "CO" },
    { id: "agent-research", display_name: "Agent de recherche", monogram: "RE" },
    { id: "agent-writing", display_name: "Agent de rédaction", monogram: "RD" },
    { id: "agent-data", display_name: "Agent de données", monogram: "DO" },
  ],
} as const;

/** Default catalog (EN) used when opening a fresh DB. */
export const DEFAULT_AGENTS: readonly Agent[] = AGENTS_BY_LOCALE.en;
