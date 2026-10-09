import { z } from "zod";
import {
  ActorTypeSchema,
  AssigneeTypeSchema,
  PrioritySchema,
  SourceSchema,
  StatusSchema,
} from "./enums.js";
import { ItemIdSchema } from "./ids.js";

export const WorkItemSchema = z.object({
  id: ItemIdSchema,
  title: z.string().min(1).max(200),
  goal: z.string().max(280).nullable(),
  status: StatusSchema,
  assignee_type: AssigneeTypeSchema,
  assignee_id: z.string().nullable(),
  due_at: z.string().datetime({ offset: true }).nullable(),
  reminder_at: z.string().datetime({ offset: true }).nullable(),
  reminder_intent: z.string().max(80).nullable(),
  priority: PrioritySchema,
  blocked_reason: z.string().nullable(),
  needs_you_reason: z.string().nullable(),
  source: SourceSchema,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  started_at: z.string().datetime({ offset: true }).nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  completed_by_type: ActorTypeSchema.nullable(),
  completed_by_id: z.string().nullable(),
  last_actor_type: ActorTypeSchema,
  last_actor_id: z.string(),
  list_id: z.string().nullable(),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

export const CreateItemInputSchema = z.object({
  title: z.string().min(1).max(200),
  goal: z.string().max(280).optional(),
  status: StatusSchema.optional(),
  assignee_type: AssigneeTypeSchema.optional(),
  assignee_id: z.string().nullable().optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  reminder_at: z.string().datetime({ offset: true }).nullable().optional(),
  reminder_intent: z.string().max(80).nullable().optional(),
  priority: PrioritySchema.optional(),
  blocked_reason: z.string().min(3).optional(),
  needs_you_reason: z.string().min(3).optional(),
});
export type CreateItemInput = z.infer<typeof CreateItemInputSchema>;

export const UpdateItemInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  goal: z.string().max(280).nullable().optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  reminder_at: z.string().datetime({ offset: true }).nullable().optional(),
  reminder_intent: z.string().max(80).nullable().optional(),
  priority: PrioritySchema.optional(),
  assignee_type: AssigneeTypeSchema.optional(),
  assignee_id: z.string().nullable().optional(),
  blocked_reason: z.string().min(3).nullable().optional(),
  needs_you_reason: z.string().min(3).nullable().optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInputSchema>;

export const SetStatusInputSchema = z.object({
  status: StatusSchema,
  blocked_reason: z.string().min(3).optional(),
  needs_you_reason: z.string().min(3).optional(),
});
export type SetStatusInput = z.infer<typeof SetStatusInputSchema>;

/** «Responder» — decision note + answered event (+ optional return to agent). */
export const AnswerItemInputSchema = z.object({
  text: z.string().min(1).max(4000),
  return_to: z.enum(["agent", "none"]).optional(),
});
export type AnswerItemInput = z.infer<typeof AnswerItemInputSchema>;

export const ActorSchema = z.object({
  type: ActorTypeSchema,
  id: z.string().min(1),
});
export type Actor = z.infer<typeof ActorSchema>;
