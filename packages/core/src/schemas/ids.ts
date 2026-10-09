import { z } from "zod";

export const ItemIdSchema = z.string().regex(/^itm_[a-z0-9]+$/);
export const NoteIdSchema = z.string().regex(/^nte_[a-z0-9]+$/);
export const AgentIdSchema = z.string().min(1).max(64);

export type ItemId = z.infer<typeof ItemIdSchema>;
export type NoteId = z.infer<typeof NoteIdSchema>;
export type AgentId = z.infer<typeof AgentIdSchema>;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function createId(prefix: "itm" | "nte" | "evt"): string {
  let body = "";
  for (let i = 0; i < 10; i += 1) {
    body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? "a";
  }
  return `${prefix}_${body}`;
}
