import { z } from "zod";
import { InboxViewSchema } from "./enums.js";
import { ItemIdSchema } from "./ids.js";
import { WorkItemSchema } from "./work_item.js";

export const RecommendationSchema = z.object({
  item_id: ItemIdSchema,
  reason: z.string().min(1),
  score: z.number(),
  kind: z.enum([
    "needs_you_waiting",
    "blocked",
    "due_soon",
    "overdue",
    "reminder_soon",
    "stale_wip",
  ]),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const AttentionSectionSchema = z.object({
  key: z.enum(["needs_you", "blocked", "today"]),
  items: z.array(WorkItemSchema),
});
export type AttentionSection = z.infer<typeof AttentionSectionSchema>;

export const InboxQueryResultSchema = z.object({
  view: InboxViewSchema,
  items: z.array(WorkItemSchema),
  sections: z.array(AttentionSectionSchema).optional(),
  groups: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        items: z.array(WorkItemSchema),
      }),
    )
    .optional(),
  counters: z.object({
    needs_you: z.number().int().nonnegative(),
  }),
});
export type InboxQueryResult = z.infer<typeof InboxQueryResultSchema>;

export const ContextPackSchema = z.object({
  item_id: ItemIdSchema,
  title: z.string(),
  goal: z.string().nullable(),
  status: z.string(),
  blocked_reason: z.string().nullable(),
  needs_you_reason: z.string().nullable(),
  assignee_type: z.string(),
  assignee_id: z.string().nullable(),
  assignee_display_name: z.string().nullable(),
  due_at: z.string().nullable(),
  reminder_at: z.string().nullable(),
  reminder_intent: z.string().nullable(),
  notes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      role: z.string(),
      body_preview: z.string(),
      body_md: z.string(),
    }),
  ),
});
export type ContextPack = z.infer<typeof ContextPackSchema>;
