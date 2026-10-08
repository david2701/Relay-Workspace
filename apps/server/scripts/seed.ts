import { resolve } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";

/**
 * Deterministic reset-and-seed. Always wipes work_items/notes/links first.
 * Target DB: RELAY_DB or ../../data/relay.db from apps/server.
 */
const resolvedDb =
  process.env.RELAY_DB ?? resolve(process.cwd(), "../../data/relay.db");

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

export function seedDatabase(dbPath: string = resolvedDb): {
  dbPath: string;
  needsYouId: string;
  blockedId: string;
  inProgressId: string;
} {
  const svc = new RelayService({ dbPath });
  svc.resetData();
  const user = { type: "user" as const, id: USER_ACTOR_ID };
  const grok = { type: "agent" as const, id: "grok-bot" };
  const ds = { type: "agent" as const, id: "dev-senior" };

  const demo = svc.createItem(
    {
      title: "Preparar demo para cliente Acme",
      goal: "Demo grabada de 3 minutos con el loop chat→Relay→hecho",
      priority: "high",
      due_at: hoursFromNow(3),
      reminder_at: hoursFromNow(1),
      reminder_intent: "Revisar el borrador antes de la demo",
    },
    user,
    "ui",
  );
  svc.delegate(demo.id, "grok-bot", user, "ui");
  svc.setStatus(demo.id, { status: "in_progress" }, grok, "mcp");

  const titular = svc.createItem(
    {
      title: "Elegir titular del post de lanzamiento",
      goal: "Post publicado en el blog con titular aprobado",
      due_at: hoursFromNow(18),
      reminder_at: hoursFromNow(4),
      reminder_intent: "Revisar el borrador antes de la demo",
    },
    grok,
    "mcp",
  );
  svc.delegate(titular.id, "grok-bot", user, "ui");
  svc.askUser(
    titular.id,
    "¿Publico la versión A («Relay») o la B («Relevo»)? El post sale mañana a las 9:00.",
    grok,
    "mcp",
  );
  svc.db
    .prepare("UPDATE work_items SET updated_at = ? WHERE id = ?")
    .run(hoursAgo(3), titular.id);

  const migrate = svc.createItem(
    {
      title: "Migrar notas antiguas al store",
      goal: "Todas las notas de /archive indexadas en Relay",
      priority: "medium",
    },
    user,
    "ui",
  );
  svc.delegate(migrate.id, "dev-senior", user, "ui");
  svc.setStatus(
    migrate.id,
    {
      status: "blocked",
      blocked_reason: "falta acceso de lectura a la carpeta /archive",
    },
    ds,
    "mcp",
  );

  const hosting = svc.createItem(
    {
      title: "Revisar contrato de hosting",
      reminder_at: hoursFromNow(18),
      reminder_intent: "Llamar antes de firmar",
    },
    user,
    "ui",
  );
  svc.updateItem(
    hosting.id,
    { assignee_type: "user", assignee_id: USER_ACTOR_ID },
    user,
  );

  svc.createItem({ title: "Comprar dominio relay.dev" }, user, "ui");

  const brief = svc.createNote({
    title: "Brief de lanzamiento",
    body_md:
      "Público: equipos pequeños que usan varias IAs.\nTono: preciso, sereno.\nNombre provisional: Relay.",
  });
  const decision = svc.createNote({
    title: "Nombre del producto: Relay provisional",
    body_md:
      "«Relevo» descartado en ES por colisión con relevos deportivos.\nPendiente de validar con el post de lanzamiento.",
  });
  svc.linkNote(titular.id, brief.id, "context");
  svc.linkNote(titular.id, decision.id, "decision");
  svc.linkNote(demo.id, brief.id, "reference");

  const done = svc.createItem(
    {
      title: "Redactar changelog de la semana",
      goal: "Changelog publicado en el canal interno",
    },
    user,
    "ui",
  );
  svc.delegate(done.id, "redactor", user, "ui");
  svc.complete(done.id, { type: "agent", id: "redactor" }, "mcp");

  const result = {
    dbPath,
    needsYouId: titular.id,
    blockedId: migrate.id,
    inProgressId: demo.id,
  };
  console.info("Seeded Relay demo data (reset-and-seed):");
  console.info(`  db: ${dbPath}`);
  console.info(`  items: ${svc.listItems().length}`);
  console.info(`  notes: ${svc.listNotes().length}`);
  console.info(`  needs_you: ${titular.id}`);
  console.info(`  blocked: ${migrate.id}`);
  console.info(`  in_progress: ${demo.id}`);
  svc.close();
  return result;
}

const isMain =
  process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isMain) {
  seedDatabase();
}
