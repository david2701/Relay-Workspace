/**
 * Seed a temp DB, invoke every MCP tool (+ error cases), write docs/mcp/examples.json.
 *
 *   RELAY_DB=/tmp/relay-mcp-docs.db pnpm --filter @relay/server exec tsx scripts/capture_mcp_examples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { createMcpTools } from "../src/mcp/tools.js";
import { seedDatabase } from "./seed.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const outPath = join(root, "docs/mcp/examples.json");
const dbPath =
  process.env.RELAY_DB ?? join(tmpdir(), `relay-mcp-docs-${Date.now()}.db`);

function trimDeep(value: unknown, maxStr = 220, maxArr = 3): unknown {
  if (typeof value === "string") {
    return value.length > maxStr ? `${value.slice(0, maxStr)}…` : value;
  }
  if (Array.isArray(value)) {
    const sliced = value.slice(0, maxArr).map((v) => trimDeep(v, maxStr, maxArr));
    if (value.length > maxArr) sliced.push(`…+${value.length - maxArr} more`);
    return sliced;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = trimDeep(v, maxStr, maxArr);
    }
    return out;
  }
  return value;
}

function invoke(
  tools: ReturnType<typeof createMcpTools>,
  name: string,
  args: Record<string, unknown> = {},
  headerActor?: string,
) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  try {
    const result = tool.handler(args, headerActor);
    return { ok: true as const, result };
  } catch (err) {
    const e = err as {
      name?: string;
      code?: string;
      message?: string;
      current_updated_at?: string;
    };
    return {
      ok: false as const,
      error: {
        name: e?.name ?? "Error",
        code: e?.code,
        message: e?.message ?? String(err),
        current_updated_at: e?.current_updated_at,
      },
    };
  }
}

const seed = seedDatabase(dbPath);
const svc = new RelayService({ dbPath });
const tools = createMcpTools(svc);
const toolNames = tools.map((t) => t.name);
const actor = { id: "grok-bot", type: "agent" };

const examples: Record<string, unknown> = {
  generated_at: new Date().toISOString(),
  dbPath,
  seed,
  tool_names: toolNames,
  calls: {} as Record<string, unknown>,
  errors: {} as Record<string, unknown>,
};
const calls = examples.calls as Record<string, unknown>;
const errors = examples.errors as Record<string, unknown>;

const list = invoke(tools, "items_list", { limit: 2 });
calls.items_list = {
  args: { limit: 2 },
  response: trimDeep(list.result, 180, 2),
};

const needsYouId = seed.needsYouId;
const inProgressId = seed.inProgressId;

calls.items_get = {
  args: { id: needsYouId },
  response: trimDeep(invoke(tools, "items_get", { id: needsYouId }).result),
};

const created = invoke(tools, "items_create", {
  title: "MCP docs sample item",
  goal: "Ejemplo real para la documentación MCP",
  priority: "medium",
  actor,
});
calls.items_create = {
  args: {
    title: "MCP docs sample item",
    goal: "Ejemplo real para la documentación MCP",
    priority: "medium",
    actor,
  },
  response: trimDeep(created.result),
};
const sampleId = (created.result as { item: { id: string } }).item.id;

calls.items_update = {
  args: { id: sampleId, title: "MCP docs sample item (updated)", actor },
  response: trimDeep(
    invoke(tools, "items_update", {
      id: sampleId,
      title: "MCP docs sample item (updated)",
      actor,
    }).result,
  ),
};

calls.items_delegate = {
  args: { id: sampleId, agent_id: "grok-bot", actor },
  response: trimDeep(
    invoke(tools, "items_delegate", {
      id: sampleId,
      agent_id: "grok-bot",
      actor,
    }).result,
  ),
};

calls.items_set_status = {
  args: { id: sampleId, status: "in_progress", actor },
  response: trimDeep(
    invoke(tools, "items_set_status", {
      id: sampleId,
      status: "in_progress",
      actor,
    }).result,
  ),
};

const noteCreated = invoke(tools, "notes_create", {
  title: "Nota huérfana de ejemplo",
  body_md: "Texto buscable sobre el lanzamiento de Relay.",
});
calls.notes_create = {
  args: {
    title: "Nota huérfana de ejemplo",
    body_md: "Texto buscable sobre el lanzamiento de Relay.",
  },
  response: trimDeep(noteCreated.result),
};
const orphanNoteId = (noteCreated.result as { note: { id: string } }).note.id;

const notes = invoke(tools, "notes_list", { limit: 2 });
calls.notes_list = {
  args: { limit: 2 },
  response: trimDeep(notes.result, 180, 2),
};

const linkedNoteId =
  (notes.result as { notes: Array<{ id: string }> }).notes[0]?.id ?? orphanNoteId;
calls.notes_get = {
  args: { id: linkedNoteId },
  response: trimDeep(invoke(tools, "notes_get", { id: linkedNoteId }).result),
};

const noteBefore = (
  invoke(tools, "notes_get", { id: orphanNoteId }).result as {
    note: { updated_at: string };
  }
).note;
calls.notes_update = {
  args: {
    id: orphanNoteId,
    body_md: "Texto actualizado sobre el lanzamiento de Relay.",
    if_updated_at: noteBefore.updated_at,
  },
  response: trimDeep(
    invoke(tools, "notes_update", {
      id: orphanNoteId,
      body_md: "Texto actualizado sobre el lanzamiento de Relay.",
      if_updated_at: noteBefore.updated_at,
    }).result,
  ),
};

calls.notes_search = {
  args: { q: "lanzamiento", limit: 5 },
  response: trimDeep(
    invoke(tools, "notes_search", { q: "lanzamiento", limit: 5 }).result,
  ),
};

calls.notes_link = {
  args: { item_id: sampleId, note_id: orphanNoteId, role: "context" },
  response: trimDeep(
    invoke(tools, "notes_link", {
      item_id: sampleId,
      note_id: orphanNoteId,
      role: "context",
    }).result,
  ),
};

calls.context_get = {
  args: { id: needsYouId },
  response: trimDeep(invoke(tools, "context_get", { id: needsYouId }).result, 200, 2),
};

calls.inbox_query = {
  args: { view: "attention", limit: 2 },
  response: trimDeep(
    invoke(tools, "inbox_query", { view: "attention", limit: 2 }).result,
    160,
    2,
  ),
};

calls.search = {
  args: { q: "titular", limit: 5 },
  response: trimDeep(invoke(tools, "search", { q: "titular", limit: 5 }).result),
};

calls.inbox_recommend = {
  args: { limit: 3 },
  response: trimDeep(invoke(tools, "inbox_recommend", { limit: 3 }).result),
};

calls.items_ask_user = {
  args: {
    id: sampleId,
    reason: "¿Sigo con el borrador A o espero tu OK?",
    actor,
  },
  response: trimDeep(
    invoke(tools, "items_ask_user", {
      id: sampleId,
      reason: "¿Sigo con el borrador A o espero tu OK?",
      actor,
    }).result,
  ),
};

calls.items_set_status_return = {
  args: { id: sampleId, status: "assigned", actor },
  response: trimDeep(
    invoke(tools, "items_set_status", {
      id: sampleId,
      status: "assigned",
      actor,
    }).result,
  ),
  note: "In the web UI David clicks «Devolver a Grok Bot»; agents then see assigned again.",
};

calls.items_complete = {
  args: { id: sampleId, actor },
  response: trimDeep(invoke(tools, "items_complete", { id: sampleId, actor }).result),
};

calls.items_reopen = {
  args: { id: sampleId, actor },
  response: trimDeep(invoke(tools, "items_reopen", { id: sampleId, actor }).result),
};

calls.notes_unlink = {
  args: { item_id: sampleId, note_id: orphanNoteId },
  response: trimDeep(
    invoke(tools, "notes_unlink", {
      item_id: sampleId,
      note_id: orphanNoteId,
    }).result,
  ),
};

errors.not_found = invoke(tools, "items_get", { id: "item_does_not_exist" });
errors.validation_blocked_reason = invoke(tools, "items_set_status", {
  id: inProgressId,
  status: "blocked",
  actor,
});
errors.invalid_transition_reopen = invoke(tools, "items_reopen", {
  id: inProgressId,
  actor,
});
errors.missing_actor = invoke(tools, "items_create", { title: "sin actor" });
errors.unknown_agent = invoke(tools, "items_create", {
  title: "bad",
  actor: { id: "nope" },
});
errors.user_via_mcp = invoke(tools, "items_create", {
  title: "bad",
  actor: { id: USER_ACTOR_ID, type: "user" },
});

const freshNote = (
  invoke(tools, "notes_create", {
    title: "Conflict probe",
    body_md: "v1",
  }).result as { note: { id: string; updated_at: string } }
).note;
svc.updateNote(freshNote.id, { body_md: "v2 concurrent" });
errors.conflict_409 = invoke(tools, "notes_update", {
  id: freshNote.id,
  body_md: "stale write",
  if_updated_at: freshNote.updated_at,
});

mkdirSync(join(root, "docs/mcp"), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(examples, null, 2)}\n`);
console.info(`Wrote ${outPath}`);
console.info(`Tools (${toolNames.length}): ${toolNames.join(", ")}`);
svc.close();
