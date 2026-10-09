import { z } from "zod";
import { ActorTypeSchema } from "./enums.js";
import { ItemIdSchema } from "./ids.js";

/** Event types emitted today, plus reserved future handoff types. */
export const ItemEventTypeSchema = z.enum([
  "created",
  "updated",
  "status_changed",
  "assigned",
  "delegated",
  "note_linked",
  "note_unlinked",
  "reminder_set",
  "answered",
  "taken",
]);
export type ItemEventType = z.infer<typeof ItemEventTypeSchema>;

export const ItemEventSchema = z.object({
  id: z.string().regex(/^evt_[a-z0-9]+$/),
  seq: z.number().int().positive(),
  item_id: ItemIdSchema,
  type: ItemEventTypeSchema,
  actor_kind: ActorTypeSchema,
  actor_id: z.string().min(1),
  payload: z.record(z.unknown()),
  created_at: z.string().datetime({ offset: true }),
});
export type ItemEvent = z.infer<typeof ItemEventSchema>;

export const ChangesPageSchema = z.object({
  events: z.array(ItemEventSchema),
  next_seq: z.number().int().nonnegative(),
  has_more: z.boolean(),
});
export type ChangesPage = z.infer<typeof ChangesPageSchema>;

export const ItemEventsPageSchema = z.object({
  events: z.array(ItemEventSchema),
  next_seq: z.number().int().nonnegative(),
  has_more: z.boolean(),
});
export type ItemEventsPage = z.infer<typeof ItemEventsPageSchema>;
