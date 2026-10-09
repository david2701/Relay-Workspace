export type RelaySettings = {
  timezone: string;
  user_display_name: string;
  user_initial: string;
  onboarding_completed_at: string | null;
};

export type SettingsResponse = {
  settings: RelaySettings;
  work_item_count: number;
};

export type RelayDevice = {
  id: string;
  name: string;
  platform: "web" | "ios" | "android" | "other";
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export type PairingSessionResponse = {
  code: string;
  expires_at: string;
  qr: { v: 1; url: string; code: string };
};

import type {
  Agent,
  ContextPack,
  InboxResult,
  InboxSyncDelta,
  InboxView,
  LinkedNote,
  Note,
  NoteRole,
  NotesSearchResult,
  Recommendation,
  SearchResult,
  WorkItem,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:7420";

export class ApiError extends Error {
  status: number;
  code?: string;
  current_updated_at?: string;

  constructor(
    message: string,
    opts: { status: number; code?: string; current_updated_at?: string },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    if (opts.code !== undefined) this.code = opts.code;
    if (opts.current_updated_at !== undefined) {
      this.current_updated_at = opts.current_updated_at;
    }
  }
}

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
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?:
        | string
        | { code?: string; message?: string; current_updated_at?: string };
    };
    const errObj = typeof body.error === "object" ? body.error : undefined;
    const message =
      errObj?.message ??
      body.message ??
      (typeof body.error === "string" ? body.error : undefined) ??
      `HTTP ${res.status}`;
    throw new ApiError(message, {
      status: res.status,
      ...(errObj?.code !== undefined ? { code: errObj.code } : {}),
      ...(errObj?.current_updated_at !== undefined
        ? { current_updated_at: errObj.current_updated_at }
        : {}),
    });
  }
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,
  health: () => request<{ ok: boolean }>("/api/health"),
  agents: () => request<{ agents: Agent[] }>("/api/agents"),
  inbox: (
    view: InboxView,
    opts?: {
      since?: string;
      after_seq?: number;
      limit?: number;
      cursor?: string;
    },
  ) => {
    const params = new URLSearchParams({ view });
    if (opts?.after_seq != null) params.set("after_seq", String(opts.after_seq));
    else if (opts?.since) params.set("since", opts.since);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    return request<InboxResult | InboxSyncDelta>(`/api/inbox?${params}`);
  },
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
        assignee_id: "user",
      }),
    }),
  answer: (
    id: string,
    body: {
      text: string;
      return_to?: "agent" | "none";
      locale?: "en" | "fr" | "es";
      if_updated_at?: string;
    },
  ) =>
    request<{ item: WorkItem; note: Note; seq: number }>(
      `/api/items/${id}/answer`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  take: (id: string, opts?: { if_updated_at?: string }) =>
    request<{ item: WorkItem; seq: number }>(`/api/items/${id}/take`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),
  getSettings: () => request<SettingsResponse>("/api/settings"),
  updateSettings: (patch: Partial<RelaySettings>) =>
    request<SettingsResponse>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  listDevices: () => request<{ devices: RelayDevice[] }>("/api/devices"),
  startPairing: () =>
    request<PairingSessionResponse>("/api/pair/start", { method: "POST" }),
  claimPairing: (body: {
    code: string;
    device_name: string;
    platform: RelayDevice["platform"];
  }) =>
    request<{
      device_id: string;
      token: string;
      device: RelayDevice;
    }>("/api/pair/claim", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  renameDevice: (id: string, name: string) =>
    request<{ device: RelayDevice }>(`/api/devices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  revokeDevice: (id: string) =>
    request<{ device: RelayDevice }>(`/api/devices/${id}`, {
      method: "DELETE",
    }),
  mintStreamTicket: () =>
    request<{
      access_token: string;
      expires_at: string;
      expires_in: number;
    }>("/api/stream/ticket", { method: "POST" }),
  loadSampleData: (locale: "en" | "fr" | "es") =>
    request<SettingsResponse & { ok: boolean; locale: string }>("/api/seed", {
      method: "POST",
      body: JSON.stringify({ locale }),
    }),
  prepareOnboarding: (variant: "empty" | "preloaded", locale: "en" | "fr" | "es" = "en") =>
    request<
      SettingsResponse & { ok: boolean; variant: "empty" | "preloaded" }
    >("/api/store/prepare-onboarding", {
      method: "POST",
      body: JSON.stringify({ variant, locale }),
    }),
  notes: () => request<{ notes: Note[] }>("/api/notes"),
  getNote: (id: string) =>
    request<{ note: Note; links: { item_id: string; note_id: string; role: string }[] }>(
      `/api/notes/${id}`,
    ),
  createNote: (title: string, body_md = "") =>
    request<{ note: Note }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title, body_md }),
    }),
  updateNote: (
    id: string,
    patch: { title?: string; body_md?: string },
    opts?: { if_updated_at?: string },
  ) =>
    request<{ note: Note }>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...patch,
        ...(opts?.if_updated_at !== undefined
          ? { if_updated_at: opts.if_updated_at }
          : {}),
      }),
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
  search: (opts: {
    q?: string;
    status?: string[];
    actor?: string[];
    due?: string;
    from?: string;
    to?: string;
    view?: InboxView;
    label?: string;
    limit?: number;
    cursor?: string;
  }) => {
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.status && opts.status.length > 0) {
      params.set("status", opts.status.join(","));
    }
    if (opts.actor && opts.actor.length > 0) {
      params.set("actor", opts.actor.join(","));
    }
    if (opts.due) params.set("due", opts.due);
    if (opts.from) params.set("from", opts.from);
    if (opts.to) params.set("to", opts.to);
    if (opts.view) params.set("view", opts.view);
    if (opts.label) params.set("label", opts.label);
    if (opts.limit != null) params.set("limit", String(opts.limit));
    if (opts.cursor) params.set("cursor", opts.cursor);
    return request<SearchResult>(`/api/search?${params}`);
  },
  searchNotes: (q: string, opts?: { limit?: number }) => {
    const params = new URLSearchParams({ q });
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    return request<NotesSearchResult>(`/api/notes/search?${params}`);
  },
};
