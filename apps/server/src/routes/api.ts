import {
  CreateItemInputSchema,
  CreateNoteInputSchema,
  InboxViewSchema,
  LinkNoteInputSchema,
  NoteRoleSchema,
  type RelayService,
  SearchQuerySchema,
  SetStatusInputSchema,
  UpdateItemInputSchema,
  UpdateNoteInputSchema,
} from "@relay/core";
import { Hono } from "hono";
import { z } from "zod";
import { actorFromRequest, sourceFromRequest } from "../actor.js";
import { handleError } from "../http_errors.js";

const ActorBodySchema = z
  .object({
    actor: z
      .object({
        type: z.enum(["user", "agent", "system"]).optional(),
        id: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const PageLimitSchema = z.coerce.number().int().min(1).max(200);

const NotePatchSchema = UpdateNoteInputSchema.extend({
  if_updated_at: z.string().optional(),
});

function parseSearchFromQuery(query: Record<string, string>) {
  const raw: Record<string, unknown> = { ...query };
  if (typeof raw.limit === "string" && raw.limit.length > 0) {
    raw.limit = Number(raw.limit);
  }
  return SearchQuerySchema.parse(raw);
}

export function createApi(svc: RelayService): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/agents", (c) => c.json({ agents: svc.listAgents() }));

  app.get("/items", (c) => {
    try {
      const limitRaw = c.req.query("limit");
      if (limitRaw !== undefined) {
        const limit = PageLimitSchema.parse(limitRaw);
        const cursor = c.req.query("cursor");
        const page = svc.listItems({
          limit,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        return c.json({
          items: page.items,
          next_cursor: page.meta.next_cursor,
          has_more: page.meta.has_more,
          total_count: page.meta.total_count,
        });
      }
      return c.json({ items: svc.listItems() });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/items/:id", (c) => {
    try {
      return c.json({ item: svc.getItem(c.req.param("id")) });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/items", async (c) => {
    try {
      const raw = await c.req.json();
      const withActor = ActorBodySchema.parse(raw);
      c.set("actorBody", withActor.actor);
      const input = CreateItemInputSchema.parse(raw);
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.createItem(input, actor, source);
      return c.json({ item }, 201);
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.patch("/items/:id", async (c) => {
    try {
      const raw = await c.req.json();
      const withActor = ActorBodySchema.parse(raw);
      c.set("actorBody", withActor.actor);
      const input = UpdateItemInputSchema.parse(raw);
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.updateItem(c.req.param("id"), input, actor);
      return c.json({ item });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/items/:id/status", async (c) => {
    try {
      const raw = await c.req.json();
      const withActor = ActorBodySchema.parse(raw);
      c.set("actorBody", withActor.actor);
      const input = SetStatusInputSchema.parse(raw);
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.setStatus(c.req.param("id"), input, actor, source);
      return c.json({ item });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/items/:id/complete", async (c) => {
    try {
      const raw = (await c.req.json().catch(() => ({}))) as unknown;
      const withActor = ActorBodySchema.parse(raw ?? {});
      c.set("actorBody", withActor.actor);
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.complete(c.req.param("id"), actor, source);
      return c.json({ item });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/items/:id/reopen", async (c) => {
    try {
      const raw = (await c.req.json().catch(() => ({}))) as unknown;
      const withActor = ActorBodySchema.parse(raw ?? {});
      c.set("actorBody", withActor.actor);
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.reopen(c.req.param("id"), actor);
      return c.json({ item });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/items/:id/delegate", async (c) => {
    try {
      const raw = await c.req.json();
      const withActor = ActorBodySchema.parse(raw);
      c.set("actorBody", withActor.actor);
      const body = z.object({ agent_id: z.string().min(1) }).parse(raw);
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.delegate(c.req.param("id"), body.agent_id, actor, source);
      return c.json({ item });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/items/:id/ask-user", async (c) => {
    try {
      const raw = await c.req.json();
      const withActor = ActorBodySchema.parse(raw);
      c.set("actorBody", withActor.actor);
      const body = z.object({ reason: z.string().min(3) }).parse(raw);
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.askUser(c.req.param("id"), body.reason, actor, source);
      return c.json({ item });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/notes", (c) => {
    try {
      const limitRaw = c.req.query("limit");
      if (limitRaw !== undefined) {
        const limit = PageLimitSchema.parse(limitRaw);
        const cursor = c.req.query("cursor");
        const page = svc.listNotes({
          limit,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        return c.json({
          notes: page.items,
          next_cursor: page.meta.next_cursor,
          has_more: page.meta.has_more,
          total_count: page.meta.total_count,
        });
      }
      return c.json({ notes: svc.listNotes() });
    } catch (err) {
      return handleError(c, err);
    }
  });

  /** Orphan-note search for /notes?q= web parity with MCP notes_search (P4). */
  app.get("/notes/search", (c) => {
    try {
      const q = c.req.query("q") ?? "";
      const limitRaw = c.req.query("limit");
      const opts =
        limitRaw !== undefined
          ? { limit: PageLimitSchema.parse(limitRaw) }
          : undefined;
      return c.json(svc.searchOrphanNotes(q, opts));
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/notes/:id", (c) => {
    try {
      const note = svc.getNote(c.req.param("id"));
      return c.json({
        note,
        links: svc.linksForNote(note.id),
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/notes", async (c) => {
    try {
      const input = CreateNoteInputSchema.parse(await c.req.json());
      return c.json({ note: svc.createNote(input) }, 201);
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.patch("/notes/:id", async (c) => {
    try {
      const raw = await c.req.json();
      const parsed = NotePatchSchema.parse(raw);
      const { if_updated_at, ...input } = parsed;
      const note = svc.updateNote(
        c.req.param("id"),
        input,
        if_updated_at !== undefined ? { if_updated_at } : undefined,
      );
      return c.json({ note });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/notes/link", async (c) => {
    try {
      const input = LinkNoteInputSchema.parse(await c.req.json());
      const link = svc.linkNote(input.item_id, input.note_id, input.role);
      return c.json({ link });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/notes/unlink", async (c) => {
    try {
      const input = z
        .object({ item_id: z.string(), note_id: z.string() })
        .parse(await c.req.json());
      svc.unlinkNote(input.item_id, input.note_id);
      return c.json({ ok: true });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.patch("/items/:itemId/notes/:noteId/role", async (c) => {
    try {
      const role = NoteRoleSchema.parse((await c.req.json()).role);
      const link = svc.linkNote(c.req.param("itemId"), c.req.param("noteId"), role);
      return c.json({ link });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/items/:id/context", (c) => {
    try {
      const pack = svc.getContext(c.req.param("id"));
      return c.json({
        context: pack,
        markdown: svc.getContextMarkdown(c.req.param("id")),
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/items/:id/links", (c) => {
    try {
      const itemId = c.req.param("id");
      svc.getItem(itemId);
      const links = svc.linksForItem(itemId);
      const notes = links.map((l) => ({
        ...svc.getNote(l.note_id),
        role: l.role,
      }));
      return c.json({ links, notes });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/inbox", (c) => {
    try {
      const view = InboxViewSchema.parse(c.req.query("view") ?? "attention");
      const limitRaw = c.req.query("limit");
      const cursor = c.req.query("cursor");
      const since = c.req.query("since");
      const opts: {
        limit?: number;
        cursor?: string;
        since?: string;
      } = {};
      if (limitRaw !== undefined) {
        opts.limit = PageLimitSchema.parse(limitRaw);
      }
      if (cursor !== undefined) opts.cursor = cursor;
      if (since !== undefined) opts.since = since;
      return c.json(
        Object.keys(opts).length > 0 ? svc.inboxQuery(view, opts) : svc.inboxQuery(view),
      );
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/search", (c) => {
    try {
      return c.json(svc.search(parseSearchFromQuery(c.req.query())));
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/inbox/recommend", (c) => {
    try {
      const limit = Number(c.req.query("limit") ?? "3");
      return c.json({ recommendations: svc.inboxRecommend(limit) });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/settings", (c) => {
    try {
      return c.json({ settings: svc.getSettings() });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.put("/settings", async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const patch =
        body.settings && typeof body.settings === "object"
          ? (body.settings as Record<string, unknown>)
          : body;
      const settings = svc.updateSettings(patch);
      return c.json({ settings });
    } catch (err) {
      return handleError(c, err);
    }
  });

  return app;
}

declare module "hono" {
  interface ContextVariableMap {
    actorBody:
      | { type?: string | undefined; id?: string | undefined }
      | undefined;
  }
}
