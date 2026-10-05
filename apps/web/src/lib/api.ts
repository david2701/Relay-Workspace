import type {
  Agent,
  ContextPack,
  InboxResult,
  InboxView,
  LinkedNote,
  Note,
  NoteRole,
  Recommendation,
  WorkItem,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:7420";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Source": "ui",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,
  health: () => request<{ ok: boolean }>("/api/health"),
  agents: () => request<{ agents: Agent[] }>("/api/agents"),
  inbox: (view: InboxView) => request<InboxResult>(`/api/inbox?view=${view}`),
  recommend: () =>
    request<{ recommendations: Recommendation[] }>("/api/inbox/recommend"),
  getItem: (id: string) => request<{ item: WorkItem }>(`/api/items/${id}`),
  createItem: (title: string) =>
    request<{ item: WorkItem }>("/api/items", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  updateItem: (id: string, patch: Record<string, unknown>) =>
    request<{ item: WorkItem }>(`/api/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  setStatus: (
    id: string,
    status: string,
    reasons?: { blocked_reason?: string; needs_you_reason?: string },
  ) =>
    request<{ item: WorkItem }>(`/api/items/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...reasons }),
    }),
  complete: (id: string) =>
    request<{ item: WorkItem }>(`/api/items/${id}/complete`, {
      method: "POST",
      body: "{}",
    }),
  reopen: (id: string) =>
    request<{ item: WorkItem }>(`/api/items/${id}/reopen`, {
      method: "POST",
      body: "{}",
    }),
  delegate: (id: string, agentId: string) =>
    request<{ item: WorkItem }>(`/api/items/${id}/delegate`, {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId }),
    }),
  assignMe: (id: string) =>
    request<{ item: WorkItem }>(`/api/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        assignee_type: "user",
        assignee_id: "david",
      }),
    }),
  notes: () => request<{ notes: Note[] }>("/api/notes"),
  createNote: (title: string, body_md = "") =>
    request<{ note: Note }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title, body_md }),
    }),
  updateNote: (id: string, patch: { title?: string; body_md?: string }) =>
    request<{ note: Note }>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  itemNotes: (id: string) =>
    request<{ notes: LinkedNote[] }>(`/api/items/${id}/links`),
  linkNote: (itemId: string, noteId: string, role: NoteRole = "context") =>
    request<{ link: unknown }>("/api/notes/link", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, note_id: noteId, role }),
    }),
  unlinkNote: (itemId: string, noteId: string) =>
    request<{ ok: boolean }>("/api/notes/unlink", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, note_id: noteId }),
    }),
  setNoteRole: (itemId: string, noteId: string, role: NoteRole) =>
    request<{ link: unknown }>(`/api/items/${itemId}/notes/${noteId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  context: (id: string) =>
    request<{ context: ContextPack; markdown: string }>(
      `/api/items/${id}/context`,
    ),
};
