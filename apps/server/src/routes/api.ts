import {
  AnswerItemInputSchema,
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
import type { AuthOptions } from "../auth.js";
import { parseEventPageQuery } from "../event_query.js";
import { handleError } from "../http_errors.js";
import type { SseHub } from "../sse_hub.js";
import { createStreamHandler } from "../stream_route.js";
import { createDeviceRoutes } from "./devices.js";

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

/** Optimistic concurrency stamp — ISO datetime with offset (same as WorkItem.updated_at). */
const IfUpdatedAtSchema = z.string().datetime({ offset: true });

const NotePatchSchema = UpdateNoteInputSchema.extend({
  if_updated_at: IfUpdatedAtSchema.optional(),
});

const ItemPatchSchema = UpdateItemInputSchema.extend({
  if_updated_at: IfUpdatedAtSchema.optional(),
});

const StatusBodySchema = SetStatusInputSchema.extend({
  if_updated_at: IfUpdatedAtSchema.optional(),
});

const AnswerBodySchema = AnswerItemInputSchema.extend({
  if_updated_at: IfUpdatedAtSchema.optional(),
});

const TakeBodySchema = z.object({
  if_updated_at: IfUpdatedAtSchema.optional(),
});

function parseSearchFromQuery(query: Record<string, string>) {
  const raw: Record<string, unknown> = { ...query };
  if (typeof raw.limit === "string" && raw.limit.length > 0) {
    raw.limit = Number(raw.limit);
  }
  return SearchQuerySchema.parse(raw);
}

export type CreateApiOptions = {
  /** Realtime SSE hub; when omitted, GET /api/stream returns 503. */
  streamHub?: SseHub;
  /** LAN auth options (defaults: no token required — loopback). */
  auth?: AuthOptions;
};

export function createApi(svc: RelayService, opts: CreateApiOptions = {}): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      require_token: opts.auth?.requireToken ?? false,
      require_token_explicit: opts.auth?.requireTokenExplicit ?? false,
    }),
  );

  const streamAuth =
    opts.auth !== undefined
      ? { svc, auth: opts.auth }
      : undefined;

  if (opts.streamHub) {
    app.get("/stream", createStreamHandler(opts.streamHub, streamAuth));
  } else {
    app.get("/stream", (c) =>
      c.json(
        {
          error: "service_unavailable",
          message: "SSE stream hub not configured",
        },
        503,
      ),
    );
  }

  if (opts.auth) {
    app.route("/", createDeviceRoutes(svc, opts.auth));
  }

  app.get("/agents", (c) => c.json({ agents: svc.listAgentSummaries() }));

  app.get("/agents/:id", (c) => {
    try {
      const page = parseEventPageQuery({
        after_seq: c.req.query("after_seq"),
        before_seq: c.req.query("before_seq"),
        limit: c.req.query("limit"),
      });
      const currentRaw = c.req.query("current_items_limit");
      const profileOpts: {
        after_seq?: number;
        before_seq?: number;
        limit?: number;
        current_items_limit?: number;
      } = {};
      if (page.after_seq !== undefined) profileOpts.after_seq = page.after_seq;
      if (page.before_seq !== undefined) profileOpts.before_seq = page.before_seq;
      if (page.limit !== undefined) profileOpts.limit = page.limit;
      if (currentRaw !== undefined) {
        // Reuse the same limit bounds as event paging (1…200).
        const currentPage = parseEventPageQuery({ limit: currentRaw });
        if (currentPage.limit !== undefined) {
          profileOpts.current_items_limit = currentPage.limit;
        }
      }
      return c.json({
        agent: svc.getAgentProfile(
          c.req.param("id"),
          Object.keys(profileOpts).length > 0 ? profileOpts : undefined,
        ),
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

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
      const parsed = ItemPatchSchema.parse(raw);
      const { if_updated_at, ...input } = parsed;
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.updateItem(
        c.req.param("id"),
        input,
        actor,
        if_updated_at !== undefined ? { if_updated_at } : undefined,
      );
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
      const parsed = StatusBodySchema.parse(raw);
      const { if_updated_at, ...input } = parsed;
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const item = svc.setStatus(
        c.req.param("id"),
        input,
        actor,
        source,
        if_updated_at !== undefined ? { if_updated_at } : undefined,
      );
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

  app.post("/items/:id/answer", async (c) => {
    try {
      const raw = await c.req.json();
      const withActor = ActorBodySchema.parse(raw);
      c.set("actorBody", withActor.actor);
      const parsed = AnswerBodySchema.parse(raw);
      const { if_updated_at, ...input } = parsed;
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const result = svc.answer(
        c.req.param("id"),
        input,
        actor,
        source,
        if_updated_at !== undefined ? { if_updated_at } : undefined,
      );
      return c.json(result);
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/items/:id/take", async (c) => {
    try {
      const raw = (await c.req.json().catch(() => ({}))) as unknown;
      const withActor = ActorBodySchema.parse(raw ?? {});
      c.set("actorBody", withActor.actor);
      const parsed = TakeBodySchema.parse(raw ?? {});
      const source = sourceFromRequest(c);
      const actor = actorFromRequest(c, svc, source);
      const result = svc.take(
        c.req.param("id"),
        actor,
        source,
        parsed.if_updated_at !== undefined
          ? { if_updated_at: parsed.if_updated_at }
          : undefined,
      );
      return c.json(result);
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
      return c.json(svc.getContextWithEvents(c.req.param("id")));
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/items/:id/events", (c) => {
    try {
      const opts = parseEventPageQuery({
        after_seq: c.req.query("after_seq"),
        before_seq: c.req.query("before_seq"),
        limit: c.req.query("limit"),
      });
      // before_seq reserved for SSE resume; paging still uses after_seq.
      return c.json(svc.listEventsForItem(c.req.param("id"), opts));
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/changes", (c) => {
    try {
      const opts = parseEventPageQuery({
        after_seq: c.req.query("after_seq"),
        before_seq: c.req.query("before_seq"),
        limit: c.req.query("limit"),
      });
      return c.json(svc.listChanges(opts));
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
      const cursor = c.req.query("cursor");
      const since = c.req.query("since");
      const page = parseEventPageQuery({
        after_seq: c.req.query("after_seq"),
        before_seq: c.req.query("before_seq"),
        limit: c.req.query("limit"),
      });
      const opts: {
        limit?: number;
        cursor?: string;
        since?: string;
        after_seq?: number;
      } = {};
      if (page.limit !== undefined) opts.limit = page.limit;
      if (cursor !== undefined) opts.cursor = cursor;
      if (page.after_seq !== undefined) opts.after_seq = page.after_seq;
      else if (since !== undefined) opts.since = since;
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
      return c.json({
        settings: svc.getSettings(),
        work_item_count: svc.countWorkItems(),
      });
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
      return c.json({
        settings,
        work_item_count: svc.countWorkItems(),
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.patch("/settings", async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const patch =
        body.settings && typeof body.settings === "object"
          ? (body.settings as Record<string, unknown>)
          : body;
      const settings = svc.updateSettings(patch);
      return c.json({
        settings,
        work_item_count: svc.countWorkItems(),
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  const SeedBodySchema = z.object({
    locale: z.enum(["en", "fr", "es"]).default("en"),
  });

  /** Load sample data in a locale; preserves profile + onboarding_completed_at. */
  app.post("/seed", async (c) => {
    try {
      const body = SeedBodySchema.parse((await c.req.json().catch(() => ({}))) ?? {});
      const { seedIntoService } = await import("../seed/demo_seed.js");
      const seeded = seedIntoService(svc, body.locale, {
        applyDemoProfile: false,
      });
      return c.json({
        ok: true,
        locale: seeded.locale,
        work_item_count: svc.countWorkItems(),
        settings: svc.getSettings(),
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  const PrepareOnboardingSchema = z.object({
    variant: z.enum(["empty", "preloaded"]),
    locale: z.enum(["en", "fr", "es"]).default("en"),
  });

  /**
   * E2E / local helper: empty store or EN-preloaded demo with
   * onboarding_completed_at null and an empty profile (PR1 / AC3-O1).
   */
  app.post("/store/prepare-onboarding", async (c) => {
    try {
      const body = PrepareOnboardingSchema.parse(await c.req.json());
      if (body.variant === "empty") {
        svc.resetData();
      } else {
        const { seedIntoService } = await import("../seed/demo_seed.js");
        seedIntoService(svc, body.locale, { applyDemoProfile: false });
      }
      svc.prepareOnboardingProfile();
      return c.json({
        ok: true,
        variant: body.variant,
        work_item_count: svc.countWorkItems(),
        settings: svc.getSettings(),
      });
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
