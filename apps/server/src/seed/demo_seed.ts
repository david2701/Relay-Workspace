import { resolve } from "node:path";
import {
  AGENTS_BY_LOCALE,
  type AgentLocale,
  addZoneDays,
  dateOnlyZoneIso,
  fromZoneWall,
  RelayService,
  startOfZoneDay,
  toZoneParts,
  USER_ACTOR_ID,
} from "@relay/core";

/**
 * Deterministic reset-and-seed. Always wipes work_items/notes/links first.
 * Locale follows RELAY_SEED_LOCALE / --locale= (en|fr|es), default en.
 * Agents use Producto role names for that locale. No client/person names.
 * Target DB: RELAY_DB or ../../data/relay.db from apps/server.
 *
 * CLI seed (`seedDatabase`) marks onboarding complete so existing e2e/dev
 * flows skip the card. `seedDemoDatabase` (pnpm demo) leaves
 * onboarding_completed_at null (PR1 / AC3-D1).
 */
/** Default DB when seeding from apps/server (cwd or RELAY_DB). */
export const defaultSeedDbPath =
  process.env.RELAY_DB ?? resolve(process.cwd(), "../../data/relay.db");

/** Dedicated demo store — never the user's `data/relay.db` (AC3-D4). */
export const defaultDemoDbPath =
  process.env.RELAY_DEMO_DB ??
  resolve(process.cwd(), "../../data/relay-demo.db");

const DEMO_TIMEZONE = "Europe/Paris";

function hoursAgo(h: number, now: Date = new Date()): string {
  return new Date(now.getTime() - h * 3600_000).toISOString();
}

function hoursFromNow(h: number, now: Date = new Date()): string {
  return new Date(now.getTime() + h * 3600_000).toISOString();
}

/** Due later today in `timeZone`, or 23:59 today if 18:00 has passed (AC3-D3). */
function dueLaterToday(now: Date, timeZone: string): string {
  const p = toZoneParts(now, timeZone);
  const atEighteen = fromZoneWall(
    { y: p.y, m: p.m, d: p.d, hh: 18, mm: 0 },
    timeZone,
  );
  if (atEighteen.getTime() > now.getTime()) {
    return atEighteen.toISOString();
  }
  return dateOnlyZoneIso(p.y, p.m, p.d, timeZone);
}

/** Date-only due (23:59) tomorrow in `timeZone` (AC3-D3). */
function dueTomorrowDateOnly(now: Date, timeZone: string): string {
  const tomorrow = addZoneDays(startOfZoneDay(now, timeZone), 1, timeZone);
  const p = toZoneParts(tomorrow, timeZone);
  return dateOnlyZoneIso(p.y, p.m, p.d, timeZone);
}

function parseLocale(raw: string | undefined): AgentLocale {
  const v = (raw ?? "en").trim().toLowerCase();
  if (v === "fr" || v === "es" || v === "en") return v;
  return "en";
}

type SeedCopy = {
  demoTitle: string;
  demoGoal: string;
  demoReminder: string;
  headlineTitle: string;
  headlineGoal: string;
  headlineReminder: string;
  headlineAsk: string;
  migrateTitle: string;
  migrateGoal: string;
  migrateBlocked: string;
  hostingTitle: string;
  hostingReminder: string;
  domainTitle: string;
  briefTitle: string;
  briefBody: string;
  decisionTitle: string;
  decisionBody: string;
  contextTitle: string;
  contextBody: string;
  doneTitle: string;
  doneGoal: string;
  cancelledTitle: string;
};

const COPY: Record<AgentLocale, SeedCopy> = {
  en: {
    demoTitle: "Prepare the product demo recording",
    demoGoal: "Three-minute demo of the chat → Relay → done loop",
    demoReminder: "Review the draft before recording",
    headlineTitle: "Choose the launch post headline",
    headlineGoal: "Blog post published with an approved headline",
    headlineReminder: "Review the draft before publishing",
    headlineAsk:
      "Publish version A («Relay») or B («Relevo»)? The post goes out tomorrow at 09:00.",
    migrateTitle: "Migrate archived notes into the store",
    migrateGoal: "Every note under /archive indexed in Relay",
    migrateBlocked: "missing read access to the /archive folder",
    hostingTitle: "Review the hosting agreement",
    hostingReminder: "Call before signing",
    domainTitle: "Buy the product domain",
    briefTitle: "Launch brief",
    briefBody:
      "Audience: small teams that already use several AI agents.\nTone: precise, calm.\nWorking name: Relay.",
    decisionTitle: "Product name: Relay (working title)",
    decisionBody:
      "«Relevo» ruled out in Spanish (sports collision).\nStill to validate with the launch post.",
    contextTitle: "Demo talking points",
    contextBody:
      "Show needs-you, blocked, and today in Attention.\nKeep the clip under three minutes.",
    doneTitle: "Draft this week's changelog",
    doneGoal: "Changelog published on the internal channel",
    cancelledTitle: "Reserve a backup product domain",
  },
  fr: {
    demoTitle: "Préparer l’enregistrement de la démo produit",
    demoGoal: "Démo de trois minutes de la boucle chat → Relay → terminé",
    demoReminder: "Relire le brouillon avant l’enregistrement",
    headlineTitle: "Choisir le titre du billet de lancement",
    headlineGoal: "Billet publié avec un titre approuvé",
    headlineReminder: "Relire le brouillon avant publication",
    headlineAsk:
      "Publier la version A («Relay») ou B («Relevo») ? Le billet part demain à 09:00.",
    migrateTitle: "Migrer les notes archivées vers le store",
    migrateGoal: "Chaque note sous /archive indexée dans Relay",
    migrateBlocked: "accès lecture manquant sur le dossier /archive",
    hostingTitle: "Relire le contrat d’hébergement",
    hostingReminder: "Appeler avant de signer",
    domainTitle: "Acheter le domaine du produit",
    briefTitle: "Brief de lancement",
    briefBody:
      "Public : petites équipes qui utilisent déjà plusieurs agents IA.\nTon : précis, calme.\nNom de travail : Relay.",
    decisionTitle: "Nom du produit : Relay (titre de travail)",
    decisionBody:
      "«Relevo» écarté en espagnol (collision sportive).\nÀ valider encore avec le billet de lancement.",
    contextTitle: "Points de la démo",
    contextBody:
      "Montrer needs-you, blocked et aujourd’hui dans À traiter.\nGarder le clip sous trois minutes.",
    doneTitle: "Rédiger le changelog de la semaine",
    doneGoal: "Changelog publié sur le canal interne",
    cancelledTitle: "Réserver un domaine produit de secours",
  },
  es: {
    demoTitle: "Preparar la grabación de la demo del producto",
    demoGoal: "Demo de tres minutos del bucle chat → Relay → hecho",
    demoReminder: "Revisar el borrador antes de grabar",
    headlineTitle: "Elegir el titular del post de lanzamiento",
    headlineGoal: "Post publicado con un titular aprobado",
    headlineReminder: "Revisar el borrador antes de publicar",
    headlineAsk:
      "¿Publico la versión A («Relay») o la B («Relevo»)? El post sale mañana a las 09:00.",
    migrateTitle: "Migrar notas archivadas al almacén",
    migrateGoal: "Cada nota bajo /archive indexada en Relay",
    migrateBlocked: "falta acceso de lectura a la carpeta /archive",
    hostingTitle: "Revisar el acuerdo de hosting",
    hostingReminder: "Llamar antes de firmar",
    domainTitle: "Comprar el dominio del producto",
    briefTitle: "Brief de lanzamiento",
    briefBody:
      "Audiencia: equipos pequeños que ya usan varios agentes de IA.\nTono: preciso, calmado.\nNombre de trabajo: Relay.",
    decisionTitle: "Nombre del producto: Relay (título de trabajo)",
    decisionBody:
      "«Relevo» descartado en español (colisión deportiva).\nSigue por validar con el post de lanzamiento.",
    contextTitle: "Puntos de la demo",
    contextBody:
      "Mostrar te-necesita, atascado y hoy en Atención.\nMantener el clip bajo tres minutos.",
    doneTitle: "Redactar el changelog de esta semana",
    doneGoal: "Changelog publicado en el canal interno",
    cancelledTitle: "Reservar un dominio de producto de respaldo",
  },
};

export function applyAgentLocale(svc: RelayService, locale: AgentLocale): void {
  const upsert = svc.db.prepare(
    `INSERT INTO agents (id, display_name, monogram) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, monogram = excluded.monogram`,
  );
  for (const agent of AGENTS_BY_LOCALE[locale]) {
    upsert.run(agent.id, agent.display_name, agent.monogram);
  }
}

export type SeedIntoOptions = {
  /** When true (CLI default), set a demo profile and mark onboarding done. */
  applyDemoProfile?: boolean;
  /** Wall-clock instant for relative due dates (AC3-D3 tests). */
  now?: Date;
};

/**
 * Wipe work items/notes and load locale sample data into an open service.
 * Agent display names/monograms follow `locale`; ids stay stable.
 * Open items get due dates relative to `now` in the store timezone (AC3-D3).
 */
export function seedIntoService(
  svc: RelayService,
  locale: AgentLocale,
  opts: SeedIntoOptions = {},
): {
  needsYouId: string;
  blockedId: string;
  inProgressId: string;
  locale: AgentLocale;
} {
  const copy = COPY[locale];
  const now = opts.now ?? new Date();
  svc.resetData();
  applyAgentLocale(svc, locale);
  if (opts.applyDemoProfile) {
    svc.updateSettings({
      timezone: DEMO_TIMEZONE,
      user_display_name: "Alex",
      user_initial: "A",
      onboarding_completed_at: now.toISOString(),
    });
  }
  const timeZone = svc.getSettings().timezone;
  const todayDue = dueLaterToday(now, timeZone);
  const tomorrowDue = dueTomorrowDateOnly(now, timeZone);
  const user = { type: "user" as const, id: USER_ACTOR_ID };
  const code = { type: "agent" as const, id: "agent-code" };
  const research = { type: "agent" as const, id: "agent-research" };
  const writing = { type: "agent" as const, id: "agent-writing" };

  const demo = svc.createItem(
    {
      title: copy.demoTitle,
      goal: copy.demoGoal,
      priority: "high",
      due_at: todayDue,
      reminder_at: hoursFromNow(1, now),
      reminder_intent: copy.demoReminder,
    },
    user,
    "ui",
  );
  svc.delegate(demo.id, "agent-code", user, "ui");
  svc.setStatus(demo.id, { status: "in_progress" }, code, "mcp");

  const titular = svc.createItem(
    {
      title: copy.headlineTitle,
      goal: copy.headlineGoal,
      due_at: tomorrowDue,
      reminder_at: hoursFromNow(4, now),
      reminder_intent: copy.headlineReminder,
    },
    code,
    "mcp",
  );
  svc.delegate(titular.id, "agent-code", user, "ui");
  svc.askUser(titular.id, copy.headlineAsk, code, "mcp");
  svc.db
    .prepare("UPDATE work_items SET updated_at = ? WHERE id = ?")
    .run(hoursAgo(3, now), titular.id);

  const migrate = svc.createItem(
    {
      title: copy.migrateTitle,
      goal: copy.migrateGoal,
      priority: "medium",
    },
    user,
    "ui",
  );
  svc.delegate(migrate.id, "agent-research", user, "ui");
  svc.setStatus(
    migrate.id,
    {
      status: "blocked",
      blocked_reason: copy.migrateBlocked,
    },
    research,
    "mcp",
  );

  const hosting = svc.createItem(
    {
      title: copy.hostingTitle,
      due_at: tomorrowDue,
      reminder_at: hoursFromNow(18, now),
      reminder_intent: copy.hostingReminder,
    },
    user,
    "ui",
  );
  svc.updateItem(
    hosting.id,
    { assignee_type: "user", assignee_id: USER_ACTOR_ID },
    user,
  );

  svc.createItem({ title: copy.domainTitle }, user, "ui");

  const brief = svc.createNote({
    title: copy.briefTitle,
    body_md: copy.briefBody,
  });
  const decision = svc.createNote({
    title: copy.decisionTitle,
    body_md: copy.decisionBody,
  });
  const contextNote = svc.createNote({
    title: copy.contextTitle,
    body_md: copy.contextBody,
  });
  svc.linkNote(titular.id, brief.id, "context");
  svc.linkNote(titular.id, decision.id, "decision");
  svc.linkNote(demo.id, brief.id, "reference");
  svc.linkNote(demo.id, contextNote.id, "context");

  const done = svc.createItem(
    {
      title: copy.doneTitle,
      goal: copy.doneGoal,
    },
    user,
    "ui",
  );
  svc.delegate(done.id, "agent-writing", user, "ui");
  svc.complete(done.id, writing, "mcp");

  // AC3-D2: all seven statuses — cancelled after a short assigned life.
  const cancelled = svc.createItem({ title: copy.cancelledTitle }, user, "ui");
  svc.delegate(cancelled.id, "agent-data", user, "ui");
  svc.setStatus(cancelled.id, { status: "cancelled" }, user, "ui");

  return {
    needsYouId: titular.id,
    blockedId: migrate.id,
    inProgressId: demo.id,
    locale,
  };
}

export function seedDatabase(
  dbPath: string = defaultSeedDbPath,
  locale: AgentLocale = parseLocale(
    process.env.RELAY_SEED_LOCALE ??
      process.argv.find((a) => a.startsWith("--locale="))?.slice("--locale=".length),
  ),
): {
  dbPath: string;
  needsYouId: string;
  blockedId: string;
  inProgressId: string;
  locale: AgentLocale;
} {
  const svc = new RelayService({ dbPath });
  const seeded = seedIntoService(svc, locale, { applyDemoProfile: true });
  const result = {
    dbPath,
    needsYouId: seeded.needsYouId,
    blockedId: seeded.blockedId,
    inProgressId: seeded.inProgressId,
    locale: seeded.locale,
  };
  console.info(`Seeded Relay demo data (reset-and-seed, ${locale.toUpperCase()}):`);
  console.info(`  db: ${dbPath}`);
  console.info(`  items: ${svc.listItems().length}`);
  console.info(`  notes: ${svc.listNotes().length}`);
  console.info(`  needs_you: ${seeded.needsYouId}`);
  console.info(`  blocked: ${seeded.blockedId}`);
  console.info(`  in_progress: ${seeded.inProgressId}`);
  svc.close();
  return result;
}

export type DemoSeedResult = {
  dbPath: string;
  needsYouId: string;
  blockedId: string;
  inProgressId: string;
  locale: AgentLocale;
  workItemCount: number;
  noteCount: number;
  onboardingCompletedAt: string | null;
};

/**
 * Demo store seed (AC3-D1 / PR1): English sample data, onboarding incomplete.
 * Does not mark onboarding_completed_at (unlike CLI `seedDatabase`).
 */
export function seedDemoDatabase(
  dbPath: string = defaultDemoDbPath,
  now: Date = new Date(),
): DemoSeedResult {
  const svc = new RelayService({ dbPath });
  svc.updateSettings({ timezone: DEMO_TIMEZONE });
  const seeded = seedIntoService(svc, "en", { applyDemoProfile: false, now });
  svc.prepareOnboardingProfile();
  const settings = svc.getSettings();
  const result: DemoSeedResult = {
    dbPath,
    needsYouId: seeded.needsYouId,
    blockedId: seeded.blockedId,
    inProgressId: seeded.inProgressId,
    locale: seeded.locale,
    workItemCount: svc.countWorkItems(),
    noteCount: svc.listNotes().length,
    onboardingCompletedAt: settings.onboarding_completed_at,
  };
  console.info("Seeded Relay demo store (EN, onboarding open):");
  console.info(`  db: ${dbPath}`);
  console.info(`  items: ${result.workItemCount}`);
  console.info(`  notes: ${result.noteCount}`);
  console.info(`  onboarding_completed_at: ${result.onboardingCompletedAt}`);
  svc.close();
  return result;
}

/**
 * Restart demo data only (AC3-D4): wipe items/notes in the demo store,
 * reload EN samples, preserve name / locale prefs / timezone / onboarding.
 */
export function resetDemoDatabase(
  dbPath: string = defaultDemoDbPath,
  now: Date = new Date(),
): DemoSeedResult {
  const svc = new RelayService({ dbPath });
  if (!svc.getSettings().timezone) {
    svc.updateSettings({ timezone: DEMO_TIMEZONE });
  }
  const before = svc.getSettings();
  const seeded = seedIntoService(svc, "en", { applyDemoProfile: false, now });
  const after = svc.getSettings();
  if (
    after.user_display_name !== before.user_display_name ||
    after.user_initial !== before.user_initial ||
    after.onboarding_completed_at !== before.onboarding_completed_at ||
    after.timezone !== before.timezone
  ) {
    throw new Error("demo reset must preserve profile settings");
  }
  const result: DemoSeedResult = {
    dbPath,
    needsYouId: seeded.needsYouId,
    blockedId: seeded.blockedId,
    inProgressId: seeded.inProgressId,
    locale: seeded.locale,
    workItemCount: svc.countWorkItems(),
    noteCount: svc.listNotes().length,
    onboardingCompletedAt: after.onboarding_completed_at,
  };
  console.info("Reset Relay demo store (items/notes only):");
  console.info(`  db: ${dbPath}`);
  console.info(`  items: ${result.workItemCount}`);
  svc.close();
  return result;
}
