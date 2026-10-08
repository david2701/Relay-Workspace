import { resolve } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";

/**
 * Deterministic large seed: 10_000 work items + 2_000 notes.
 * Uses bulk SQL for speed; titles are realistic Spanish (no garbage suffixes).
 * Target DB: RELAY_DB or ../../data/relay.db from apps/server.
 */

const ITEM_COUNT = 10_000;
const NOTE_COUNT = 2_000;
const SEED = 0x52454c59; // "RELY"

const resolvedDb =
  process.env.RELAY_DB ?? resolve(process.cwd(), "../../data/relay.db");

const AGENTS = [
  "grok-bot",
  "dev-senior",
  "redactor",
  "ux-designer",
  "qa",
] as const;

const VERBS = [
  "Revisar",
  "Preparar",
  "Redactar",
  "Actualizar",
  "Migrar",
  "Definir",
  "Validar",
  "Publicar",
  "Coordinar",
  "Auditar",
  "Documentar",
  "Priorizar",
  "Cerrar",
  "Negociar",
  "Diseñar",
  "Probar",
  "Integrar",
  "Planificar",
  "Refinar",
  "Entregar",
] as const;

const NOUNS = [
  "el contrato de hosting",
  "la demo para Acme",
  "el post de lanzamiento",
  "las notas del archivo",
  "el changelog semanal",
  "la API de contexto",
  "el flujo de atención",
  "la guía de onboarding",
  "el informe de QA",
  "la propuesta comercial",
  "el calendario editorial",
  "la migración de datos",
  "el panel de agentes",
  "la revisión de accesibilidad",
  "el plan de incidentes",
  "la lista de pendientes",
  "el brief creativo",
  "la integración MCP",
  "el resumen ejecutivo",
  "la checklist de despliegue",
  "el tablero de prioridades",
  "la nota de decisión",
  "el recordatorio de firma",
  "la reunión con el cliente",
  "el borrador del titular",
  "la matriz de riesgos",
  "el protocolo de handoff",
  "la plantilla de contexto",
  "el inventario de dominios",
  "la política de retención",
] as const;

const NOTE_TOPICS = [
  "Brief de producto",
  "Criterios de aceptación",
  "Notas de la reunión",
  "Decisión pendiente",
  "Contexto técnico",
  "Referencia del cliente",
  "Borrador de copy",
  "Lista de riesgos",
  "Preguntas abiertas",
  "Resumen de avances",
  "Enlaces útiles",
  "Historial de cambios",
  "Acuerdos con el equipo",
  "Hipótesis de diseño",
  "Plan de pruebas",
  "Observaciones de QA",
  "Material de demo",
  "Glosario interno",
  "Dependencias externas",
  "Siguientes pasos",
] as const;

const GOALS = [
  "Dejar el entregable listo para revisión de David",
  "Tener una versión publicable antes del mediodía",
  "Cerrar el bloqueo y continuar el flujo con el agente",
  "Documentar la decisión y avisar al resto del equipo",
  "Mantener el contexto completo para el siguiente handoff",
] as const;

const BLOCKED_REASONS = [
  "falta acceso de lectura a la carpeta compartida",
  "el entorno de staging no responde",
  "esperamos la clave API del proveedor",
  "depende de una decisión legal externa",
  "el archivo fuente aún no está indexado",
] as const;

const NEEDS_YOU_REASONS = [
  "¿Apruebo la versión A o la B para publicar mañana?",
  "Necesito tu OK antes de escribir al cliente.",
  "¿Mantengo el plazo del viernes o lo movemos?",
  "Elige el titular definitivo entre las dos opciones.",
  "¿Delegamos esto a otro agente o lo cierras tú?",
] as const;

const REMINDER_INTENTS = [
  "Revisar el borrador antes de la demo",
  "Llamar antes de firmar",
  "Confirmar disponibilidad del cliente",
  "Preparar capturas para el post",
  "Comprobar el estado del despliegue",
] as const;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  const index = Math.floor(rng() * list.length);
  return list[index] ?? list[0]!;
}

function pad(num: number, width: number): string {
  return String(num).padStart(width, "0");
}

function isoFromOffsetHours(baseMs: number, hours: number): string {
  return new Date(baseMs + hours * 3600_000).toISOString();
}

type StatusPlan = {
  status:
    | "inbox"
    | "assigned"
    | "in_progress"
    | "blocked"
    | "needs_you"
    | "done"
    | "cancelled";
  weight: number;
};

/**
 * Exact status counts (weights sum to ITEM_COUNT = 10_000):
 *   inbox 2200 · assigned 2000 · in_progress 2000 · blocked 120 ·
 *   needs_you 80 · done 2600 · cancelled 1000
 * Todo (`view=all`) is non-terminal only → 6400 rows (excludes done+cancelled).
 * Atención is intentionally modest (~80 Te necesita / ~120 Atascado) plus
 * schedule-driven «Para hoy»; not a 700+/2k stress of those sections.
 */
const STATUS_PLAN: readonly StatusPlan[] = [
  { status: "inbox", weight: 2200 },
  { status: "assigned", weight: 2000 },
  { status: "in_progress", weight: 2000 },
  { status: "blocked", weight: 120 },
  { status: "needs_you", weight: 80 },
  { status: "done", weight: 2600 },
  { status: "cancelled", weight: 1000 },
];

function statusForIndex(index: number): StatusPlan["status"] {
  let cursor = 0;
  for (const plan of STATUS_PLAN) {
    cursor += plan.weight;
    if (index < cursor) return plan.status;
  }
  return "inbox";
}

export function seedLargeDatabase(dbPath: string = resolvedDb): {
  dbPath: string;
  items: number;
  notes: number;
} {
  const svc = new RelayService({ dbPath });
  svc.resetData();
  const rng = mulberry32(SEED);
  // Anchor in the recent past so live mutations (Date.now()) sort as newest.
  const baseMs = Date.now() - 60_000;
  const insertItem = svc.db.prepare(
    `INSERT INTO work_items (
      id, title, goal, status, assignee_type, assignee_id,
      due_at, reminder_at, reminder_intent, priority,
      blocked_reason, needs_you_reason, source,
      created_at, updated_at, started_at, completed_at,
      completed_by_type, completed_by_id, last_actor_type, last_actor_id, list_id
    ) VALUES (
      @id, @title, @goal, @status, @assignee_type, @assignee_id,
      @due_at, @reminder_at, @reminder_intent, @priority,
      @blocked_reason, @needs_you_reason, @source,
      @created_at, @updated_at, @started_at, @completed_at,
      @completed_by_type, @completed_by_id, @last_actor_type, @last_actor_id, @list_id
    )`,
  );
  const insertNote = svc.db.prepare(
    `INSERT INTO notes (id, title, body_md, created_at, updated_at)
     VALUES (@id, @title, @body_md, @created_at, @updated_at)`,
  );
  const insertLink = svc.db.prepare(
    `INSERT INTO item_note_links (item_id, note_id, role)
     VALUES (@item_id, @note_id, @role)`,
  );
  svc.db.exec("BEGIN");
  try {
    for (let i = 0; i < ITEM_COUNT; i += 1) {
      const status = statusForIndex(i);
      const agentId = pick(rng, AGENTS);
      const title = `${pick(rng, VERBS)} ${pick(rng, NOUNS)}`;
      const createdHours = -Math.floor(rng() * 24 * 21);
      // Keep updated_at ≤ baseMs so live mutations (Date.now()) sort as newest.
      const updatedHours = Math.min(
        0,
        createdHours + Math.floor(rng() * 48),
      );
      const created_at = isoFromOffsetHours(baseMs, createdHours);
      const updated_at = isoFromOffsetHours(baseMs, updatedHours);
      const priority = pick(rng, ["none", "low", "medium", "high"] as const);
      const source = rng() < 0.55 ? "mcp" : "ui";
      let assignee_type: "user" | "agent" | "unassigned" = "unassigned";
      let assignee_id: string | null = null;
      let due_at: string | null = null;
      let reminder_at: string | null = null;
      let reminder_intent: string | null = null;
      let blocked_reason: string | null = null;
      let needs_you_reason: string | null = null;
      let started_at: string | null = null;
      let completed_at: string | null = null;
      let completed_by_type: string | null = null;
      let completed_by_id: string | null = null;
      let last_actor_type = "user";
      let last_actor_id = USER_ACTOR_ID;
      if (status === "inbox") {
        assignee_type = "unassigned";
        if (rng() < 0.35) {
          due_at = isoFromOffsetHours(baseMs, Math.floor(rng() * 72) - 12);
        }
        if (rng() < 0.25) {
          reminder_at = isoFromOffsetHours(baseMs, Math.floor(rng() * 48) - 6);
          reminder_intent = pick(rng, REMINDER_INTENTS);
        }
      } else if (status === "assigned" || status === "in_progress") {
        assignee_type = "agent";
        assignee_id = agentId;
        last_actor_type = "agent";
        last_actor_id = agentId;
        started_at =
          status === "in_progress"
            ? isoFromOffsetHours(baseMs, updatedHours - 2)
            : null;
        if (rng() < 0.5) {
          due_at = isoFromOffsetHours(baseMs, Math.floor(rng() * 96) - 24);
        }
        if (rng() < 0.35) {
          reminder_at = isoFromOffsetHours(baseMs, Math.floor(rng() * 72) - 12);
          reminder_intent = pick(rng, REMINDER_INTENTS);
        }
      } else if (status === "blocked") {
        assignee_type = "agent";
        assignee_id = agentId;
        blocked_reason = pick(rng, BLOCKED_REASONS);
        last_actor_type = "agent";
        last_actor_id = agentId;
        started_at = isoFromOffsetHours(baseMs, updatedHours - 5);
      } else if (status === "needs_you") {
        assignee_type = "agent";
        assignee_id = agentId;
        needs_you_reason = pick(rng, NEEDS_YOU_REASONS);
        last_actor_type = "agent";
        last_actor_id = agentId;
        if (rng() < 0.4) {
          due_at = isoFromOffsetHours(baseMs, Math.floor(rng() * 36));
        }
      } else if (status === "done" || status === "cancelled") {
        const completerIsAgent = rng() < 0.7;
        completed_by_type = completerIsAgent ? "agent" : "user";
        completed_by_id = completerIsAgent ? agentId : USER_ACTOR_ID;
        completed_at = isoFromOffsetHours(baseMs, updatedHours);
        last_actor_type = completed_by_type;
        last_actor_id = completed_by_id;
        assignee_type = completerIsAgent ? "agent" : "user";
        assignee_id = completed_by_id;
        started_at = isoFromOffsetHours(baseMs, updatedHours - 8);
      }
      // Sprinkle schedule onto a slice of non-terminal items for Atención/Próximos.
      if (
        (status === "inbox" || status === "assigned" || status === "in_progress") &&
        i % 17 === 0
      ) {
        due_at = isoFromOffsetHours(baseMs, Math.floor(rng() * 20) - 2);
      }
      if (
        (status === "inbox" || status === "assigned") &&
        i % 23 === 0
      ) {
        reminder_at = isoFromOffsetHours(baseMs, Math.floor(rng() * 18));
        reminder_intent = pick(rng, REMINDER_INTENTS);
      }
      insertItem.run({
        id: `itm_lg${pad(i + 1, 7)}`,
        title,
        goal: rng() < 0.7 ? pick(rng, GOALS) : null,
        status,
        assignee_type,
        assignee_id,
        due_at,
        reminder_at,
        reminder_intent,
        priority,
        blocked_reason,
        needs_you_reason,
        source,
        created_at,
        updated_at,
        started_at,
        completed_at,
        completed_by_type,
        completed_by_id,
        last_actor_type,
        last_actor_id,
        list_id: null,
      });
    }
    for (let n = 0; n < NOTE_COUNT; n += 1) {
      const createdHours = -Math.floor(rng() * 24 * 30);
      const created_at = isoFromOffsetHours(baseMs, createdHours);
      const updated_at = isoFromOffsetHours(
        baseMs,
        createdHours + Math.floor(rng() * 72),
      );
      const topic = pick(rng, NOTE_TOPICS);
      insertNote.run({
        id: `nte_lg${pad(n + 1, 7)}`,
        title: topic,
        body_md: `${topic}.\n\nPuntos clave:\n- Contexto para el handoff\n- Decisión pendiente de David\n- Enlace con el ítem relacionado\n`,
        created_at,
        updated_at,
      });
      if (n < ITEM_COUNT) {
        insertLink.run({
          item_id: `itm_lg${pad((n % ITEM_COUNT) + 1, 7)}`,
          note_id: `nte_lg${pad(n + 1, 7)}`,
          role: pick(rng, ["context", "reference", "decision"] as const),
        });
      }
    }
    svc.db.exec("COMMIT");
  } catch (err) {
    svc.db.exec("ROLLBACK");
    svc.close();
    throw err;
  }
  const items = svc.listItems().length;
  const notes = svc.listNotes().length;
  console.info("Seeded Relay LARGE dataset (reset-and-seed):");
  console.info(`  db: ${dbPath}`);
  console.info(`  items: ${items}`);
  console.info(`  notes: ${notes}`);
  svc.close();
  return { dbPath, items, notes };
}

const isMain =
  process.argv[1]?.endsWith("seed_large.ts") ||
  process.argv[1]?.endsWith("seed_large.js");
if (isMain) {
  seedLargeDatabase();
}
