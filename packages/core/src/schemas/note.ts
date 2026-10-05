import { z } from "zod";
import { type NoteRole, NoteRoleSchema } from "./enums.js";
import { ItemIdSchema, NoteIdSchema } from "./ids.js";

export type { NoteRole };

export const NoteSchema = z.object({
  id: NoteIdSchema,
  title: z.string().min(1).max(200),
  body_md: z.string().max(100_000),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type Note = z.infer<typeof NoteSchema>;

export const ItemNoteLinkSchema = z.object({
  item_id: ItemIdSchema,
  note_id: NoteIdSchema,
  role: NoteRoleSchema,
});
export type ItemNoteLink = z.infer<typeof ItemNoteLinkSchema>;

export const CreateNoteInputSchema = z.object({
  title: z.string().min(1).max(200),
  body_md: z.string().max(100_000).optional(),
});
export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

export const UpdateNoteInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body_md: z.string().max(100_000).optional(),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteInputSchema>;

export const LinkNoteInputSchema = z.object({
  item_id: ItemIdSchema,
  note_id: NoteIdSchema,
  role: NoteRoleSchema.default("context"),
});
export type LinkNoteInput = z.infer<typeof LinkNoteInputSchema>;
