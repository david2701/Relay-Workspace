import type { Actor, RelayService, Source } from "@relay/core";
import type { Context } from "hono";

export function sourceFromRequest(c: Context): Source {
  const header = c.req.header("x-relay-source");
  if (header === "mcp" || header === "system" || header === "ui") return header;
  if (c.req.path.startsWith("/mcp")) return "mcp";
  return "ui";
}

export function actorFromRequest(
  c: Context,
  svc: RelayService,
  source: Source,
): Actor {
  const headerActor = c.req.header("x-relay-actor");
  const bodyActor = c.get("actorBody");
  const raw: { type?: string | undefined; id?: string | undefined } = {};
  const id = bodyActor?.id ?? headerActor;
  if (id) raw.id = id;
  if (bodyActor?.type) raw.type = bodyActor.type;
  return svc.resolveActor(raw, source);
}
