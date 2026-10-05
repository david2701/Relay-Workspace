import { z } from "zod";

export const StatusSchema = z.enum([
  "inbox",
  "assigned",
  "in_progress",
  "blocked",
  "needs_you",
  "done",
  "cancelled",
]);
export type Status = z.infer<typeof StatusSchema>;

export const AssigneeTypeSchema = z.enum(["user", "agent", "unassigned"]);
export type AssigneeType = z.infer<typeof AssigneeTypeSchema>;

export const ActorTypeSchema = z.enum(["user", "agent", "system"]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const SourceSchema = z.enum(["ui", "mcp", "system"]);
export type Source = z.infer<typeof SourceSchema>;

export const PrioritySchema = z.enum(["none", "low", "medium", "high"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const NoteRoleSchema = z.enum(["context", "reference", "decision"]);
export type NoteRole = z.infer<typeof NoteRoleSchema>;

export const InboxViewSchema = z.enum([
  "attention",
  "agent_wip",
  "upcoming",
  "done",
  "all",
]);
export type InboxView = z.infer<typeof InboxViewSchema>;

export const USER_ACTOR_ID = "david" as const;
export const USER_DISPLAY_NAME = "David" as const;
