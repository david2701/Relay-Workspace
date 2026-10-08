import { z } from "zod";

export const PageParamsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});
export type PageParams = z.infer<typeof PageParamsSchema>;

export const PageMetaSchema = z.object({
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  total_count: z.number().int().nonnegative(),
});
export type PageMeta = z.infer<typeof PageMetaSchema>;
