import { z } from "zod";
import { InboxViewSchema, StatusSchema } from "./enums.js";
import { ItemIdSchema, NoteIdSchema } from "./ids.js";
import { WorkItemSchema } from "./work_item.js";

export const RecommendationSchema = z.object({
  item_id: ItemIdSchema,
  title: z.string().min(1),
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
  total_count: z.number().int().nonnegative().optional(),
  next_cursor: z.string().nullable().optional(),
  has_more: z.boolean().optional(),
  section_counts: z
    .object({
      needs_you: z.number().int().nonnegative(),
      blocked: z.number().int().nonnegative(),
      today: z.number().int().nonnegative(),
    })
    .optional(),
  group_counts: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        count: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  sync_cursor: z.string().nullable().optional(),
  server_time: z.string().datetime({ offset: true }).optional(),
});
export type InboxQueryResult = z.infer<typeof InboxQueryResultSchema>;

export const InboxSyncResultSchema = z.object({
  view: InboxViewSchema,
  mode: z.literal("delta"),
  upserts: z.array(WorkItemSchema),
  removed_ids: z.array(ItemIdSchema),
  counters: z.object({
    needs_you: z.number().int().nonnegative(),
  }),
  section_counts: z
    .object({
      needs_you: z.number().int().nonnegative(),
      blocked: z.number().int().nonnegative(),
      today: z.number().int().nonnegative(),
    })
    .optional(),
  group_counts: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        count: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  total_count: z.number().int().nonnegative(),
  sync_cursor: z.string().nullable(),
  server_time: z.string().datetime({ offset: true }),
});
export type InboxSyncResult = z.infer<typeof InboxSyncResultSchema>;

const StatusListSchema = z.union([
  z.array(StatusSchema),
  z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(StatusSchema)),
]);

export const SearchQuerySchema = z.object({
  q: z.string().optional(),
  status: StatusListSchema.optional(),
  actor: z
    .union([
      z.array(z.string().min(1)),
      z
        .string()
        .transform((s) =>
          s
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        ),
    ])
    .optional(),
  due: z.enum(["overdue", "today", "week", "none", "range"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  view: InboxViewSchema.optional(),
  label: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchMatchFieldSchema = z.enum([
  "title",
  "goal",
  "blocked_reason",
  "needs_you_reason",
  "reminder_intent",
  "note",
]);
export type SearchMatchField = z.infer<typeof SearchMatchFieldSchema>;

export const SearchMatchSchema = z.object({
  field: SearchMatchFieldSchema,
  note_id: NoteIdSchema.optional(),
  snippet: z.string().max(120),
  ranges: z.array(z.tuple([z.number().int(), z.number().int()])),
});
export type SearchMatch = z.infer<typeof SearchMatchSchema>;

export const SearchResultSchema = z.object({
  items: z.array(
    z.object({
      item: WorkItemSchema,
      match: SearchMatchSchema,
    }),
  ),
  total: z.number().int().nonnegative(),
  next_cursor: z.string().optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

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
