import { resolve } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";

const resolvedDb =
  process.env.RELAY_DB ?? resolve(process.cwd(), "../../data/relay.db");

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

function main(): void {
  const svc = new RelayService({ dbPath: resolvedDb });
  svc.resetData();
  const david = { type: "user" as const, id: USER_ACTOR_ID };
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
    david,
    "ui",
  );
  svc.delegate(demo.id, "grok-bot", david, "ui");
  svc.setStatus(demo.id, { status: "in_progress" }, grok, "mcp");

  const titular = svc.createItem(
    {
      title: "Elegir titular del post de lanzamiento",
      goal: "Post publicado en el blog con titular aprobado por David",
      due_at: hoursFromNow(18),
    },
    grok,
    "mcp",
  );
  svc.delegate(titular.id, "grok-bot", david, "ui");
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
    david,
    "ui",
  );
  svc.delegate(migrate.id, "dev-senior", david, "ui");
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
    david,
    "ui",
  );
  svc.updateItem(
    hosting.id,
    { assignee_type: "user", assignee_id: USER_ACTOR_ID },
    david,
  );

  const domain = svc.createItem(
    { title: "Comprar dominio relay.dev" },
    david,
    "ui",
  );

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
    david,
    "ui",
  );
  svc.delegate(done.id, "redactor", david, "ui");
  svc.complete(done.id, { type: "agent", id: "redactor" }, "mcp");

  console.info("Seeded Relay demo data:");
  console.info(`  db: ${resolvedDb}`);
  console.info(`  items: ${svc.listItems().length}`);
  console.info(`  notes: ${svc.listNotes().length}`);
  console.info(`  needs_you: ${titular.id}`);
  console.info(`  blocked: ${migrate.id}`);
  console.info(`  in_progress: ${demo.id}`);
  console.info(`  inbox: ${domain.id}`);
  svc.close();
}

main();
