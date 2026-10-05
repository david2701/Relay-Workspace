export type Status =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "needs_you"
  | "done"
  | "cancelled";

export type AssigneeType = "user" | "agent" | "unassigned";
export type ActorType = "user" | "agent" | "system";
export type Source = "ui" | "mcp" | "system";
export type Priority = "none" | "low" | "medium" | "high";
export type NoteRole = "context" | "reference" | "decision";
export type InboxView = "attention" | "agent_wip" | "upcoming" | "done" | "all";
export type AppView = InboxView | "notes";

export type Agent = {
  id: string;
  display_name: string;
  monogram: string;
};

export type WorkItem = {
  id: string;
  title: string;
  goal: string | null;
  status: Status;
  assignee_type: AssigneeType;
  assignee_id: string | null;
  due_at: string | null;
  reminder_at: string | null;
  reminder_intent: string | null;
  priority: Priority;
  blocked_reason: string | null;
  needs_you_reason: string | null;
  source: Source;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by_type: ActorType | null;
  completed_by_id: string | null;
  last_actor_type: ActorType;
  last_actor_id: string;
  list_id: string | null;
};

export type Note = {
  id: string;
  title: string;
  body_md: string;
  created_at: string;
  updated_at: string;
};

export type LinkedNote = Note & { role: NoteRole };

export type Recommendation = {
  item_id: string;
  reason: string;
  score: number;
  kind: string;
};

export type InboxResult = {
  view: InboxView;
  items: WorkItem[];
  sections?: { key: "needs_you" | "blocked" | "today"; items: WorkItem[] }[];
  groups?: { key: string; label: string; items: WorkItem[] }[];
  counters: { needs_you: number };
};

export type ContextPack = {
  item_id: string;
  title: string;
  goal: string | null;
  status: string;
  blocked_reason: string | null;
  needs_you_reason: string | null;
  assignee_type: string;
  assignee_id: string | null;
  assignee_display_name: string | null;
  due_at: string | null;
  reminder_at: string | null;
  reminder_intent: string | null;
  notes: {
    id: string;
    title: string;
    role: string;
    body_preview: string;
    body_md: string;
  }[];
};
