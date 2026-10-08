import { resolve } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";

/**
 * Deterministic reset-and-seed. Always wipes work_items/notes/links first.
 * Demo copy is English (brief PR1 / AC3-D1). Agents use role names (AC3-D2).
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
  svc.updateSettings({
    timezone: "Europe/Paris",
    user_display_name: "Alex",
    user_initial: "A",
  });
  const user = { type: "user" as const, id: USER_ACTOR_ID };
  const code = { type: "agent" as const, id: "agent-code" };
  const research = { type: "agent" as const, id: "agent-research" };
  const writing = { type: "agent" as const, id: "agent-writing" };

  const demo = svc.createItem(
    {
      title: "Prepare the product demo recording Grok Bot",
      goal: "Three-minute demo of the chat → Relay → done loop",
      priority: "high",
      due_at: hoursFromNow(3),
      reminder_at: hoursFromNow(1),
      reminder_intent: "Review the draft before recording",
    },
    user,
    "ui",
  );
  svc.delegate(demo.id, "agent-code", user, "ui");
  svc.setStatus(demo.id, { status: "in_progress" }, code, "mcp");

  const titular = svc.createItem(
    {
      title: "Choose the launch post headline",
      goal: "Blog post published with an approved headline",
      due_at: hoursFromNow(18),
      reminder_at: hoursFromNow(4),
      reminder_intent: "Review the draft before publishing",
    },
    code,
    "mcp",
  );
  svc.delegate(titular.id, "agent-code", user, "ui");
  svc.askUser(
    titular.id,
    "Publish version A («Relay») or B («Relevo»)? The post goes out tomorrow at 09:00.",
    code,
    "mcp",
  );
  svc.db
    .prepare("UPDATE work_items SET updated_at = ? WHERE id = ?")
    .run(hoursAgo(3), titular.id);

  const migrate = svc.createItem(
    {
      title: "Migrate archived notes into the store",
      goal: "Every note under /archive indexed in Relay",
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
      blocked_reason: "missing read access to the /archive folder",
    },
    research,
    "mcp",
  );

  const hosting = svc.createItem(
    {
      title: "Review the hosting agreement",
      reminder_at: hoursFromNow(18),
      reminder_intent: "Call before signing",
    },
    user,
    "ui",
  );
  svc.updateItem(
    hosting.id,
    { assignee_type: "user", assignee_id: USER_ACTOR_ID },
    user,
  );

  svc.createItem({ title: "Buy the product domain" }, user, "ui");

  const brief = svc.createNote({
    title: "Launch brief",
    body_md:
      "Audience: small teams that already use several AI agents.\nTone: precise, calm.\nWorking name: Relay.",
  });
  const decision = svc.createNote({
    title: "Product name: Relay (working title)",
    body_md:
      "«Relevo» ruled out in Spanish (sports collision).\nStill to validate with the launch post.",
  });
  const contextNote = svc.createNote({
    title: "Demo talking points",
    body_md:
      "Show needs-you, blocked, and today in Attention.\nKeep the clip under three minutes.",
  });
  svc.linkNote(titular.id, brief.id, "context");
  svc.linkNote(titular.id, decision.id, "decision");
  svc.linkNote(demo.id, brief.id, "reference");
  svc.linkNote(demo.id, contextNote.id, "context");

  const done = svc.createItem(
    {
      title: "Draft this week's changelog",
      goal: "Changelog published on the internal channel",
    },
    user,
    "ui",
  );
  svc.delegate(done.id, "agent-writing", user, "ui");
  svc.complete(done.id, writing, "mcp");

  const result = {
    dbPath,
    needsYouId: titular.id,
    blockedId: migrate.id,
    inProgressId: demo.id,
  };
  console.info("Seeded Relay demo data (reset-and-seed, EN):");
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
