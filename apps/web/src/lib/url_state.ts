import type { AppView, Status } from "./types";

/** Stable human actor id (legacy `david` rewritten in URLs). */
export const USER_ACTOR_ID = "user";
const USER_LEGACY = "david";

export const APP_VIEWS: readonly AppView[] = [
  "attention",
  "agent_wip",
  "upcoming",
  "done",
  "all",
  "notes",
] as const;

export const STATUS_ORDER: readonly Status[] = [
  "inbox",
  "assigned",
  "in_progress",
  "blocked",
  "needs_you",
  "done",
  "cancelled",
] as const;

export type DueFacet = "overdue" | "today" | "week" | "none" | "range";

export const DUE_VALUES: readonly DueFacet[] = [
  "overdue",
  "today",
  "week",
  "none",
  "range",
] as const;

export type UrlFacets = {
  status: Status[];
  actor: string[];
  due: DueFacet | null;
  from: string | null;
  to: string | null;
  /** Reserved; accepted in URL but ignored by search. */
  label: string | null;
};

export type RelayUrlState = {
  view: AppView;
  q: string;
  facets: UrlFacets;
  item: string | null;
  note: string | null;
};

export const EMPTY_FACETS: UrlFacets = {
  status: [],
  actor: [],
  due: null,
  from: null,
  to: null,
  label: null,
};

const STATUS_SET = new Set<string>(STATUS_ORDER);
const DUE_SET = new Set<string>(DUE_VALUES);
const VIEW_SET = new Set<string>(APP_VIEWS);
const KNOWN_KEYS = new Set([
  "q",
  "status",
  "actor",
  "due",
  "from",
  "to",
  "label",
  "item",
  "note",
]);

function sortStatuses(values: readonly string[]): Status[] {
  const set = new Set<Status>();
  for (const v of values) {
    if (STATUS_SET.has(v)) set.add(v as Status);
  }
  return STATUS_ORDER.filter((s) => set.has(s));
}

export function normalizeActorId(id: string): string {
  return id === USER_LEGACY ? USER_ACTOR_ID : id;
}

function sortActors(values: readonly string[]): string[] {
  const uniq = [
    ...new Set(values.filter((a) => a.length > 0).map(normalizeActorId)),
  ];
  return uniq.sort((a, b) => {
    if (a === USER_ACTOR_ID) return -1;
    if (b === USER_ACTOR_ID) return 1;
    return a.localeCompare(b);
  });
}

export function emptyUrlState(view: AppView = "attention"): RelayUrlState {
  return { view, q: "", facets: { ...EMPTY_FACETS }, item: null, note: null };
}

export function hasActiveFacets(facets: UrlFacets): boolean {
  return (
    facets.status.length > 0 ||
    facets.actor.length > 0 ||
    facets.due !== null ||
    (facets.label !== null && facets.label.length > 0)
  );
}

export function facetCount(facets: UrlFacets): number {
  let n = 0;
  if (facets.status.length > 0) n += 1;
  if (facets.actor.length > 0) n += 1;
  if (facets.due !== null) n += 1;
  if (facets.label) n += 1;
  return n;
}

export function parsePathView(pathname: string): AppView {
  const seg = pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
  if (!seg) return "attention";
  if (VIEW_SET.has(seg)) return seg as AppView;
  return "attention";
}

/**
 * Parse location into Relay URL state. Unknown status/due/view values are dropped
 * (caller should rewrite with replaceState when dirty).
 */
export function parseUrlState(
  pathname: string,
  search: string,
  knownActors?: ReadonlySet<string>,
): { state: RelayUrlState; dirty: boolean } {
  let dirty = false;
  const viewRaw = pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
  let view: AppView = "attention";
  if (!viewRaw) {
    view = "attention";
    // `/` is accepted as attention; canonicalize to `/attention`
    dirty = true;
  } else if (VIEW_SET.has(viewRaw)) {
    view = viewRaw as AppView;
  } else {
    dirty = true;
    view = "attention";
  }

  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );

  for (const key of params.keys()) {
    if (!KNOWN_KEYS.has(key)) dirty = true;
  }

  const q = params.get("q") ?? "";
  if (params.has("q") && q === "") dirty = true;

  const statusRaw = params.get("status");
  let status: Status[] = [];
  if (statusRaw !== null) {
    const parts = statusRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    status = sortStatuses(parts);
    if (parts.length !== status.length || statusRaw !== status.join(",")) {
      dirty = true;
    }
    if (status.length === 0) dirty = true;
  }

  const actorRaw = params.get("actor");
  let actor: string[] = [];
  if (actorRaw !== null) {
    const parts = actorRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const normalized = parts.map(normalizeActorId);
    if (parts.some((a) => a === USER_LEGACY)) dirty = true;
    const filtered = knownActors
      ? normalized.filter((a) => a === USER_ACTOR_ID || knownActors.has(a))
      : normalized;
    if (filtered.length !== parts.length) dirty = true;
    actor = sortActors(filtered);
    if (actorRaw !== actor.join(",")) dirty = true;
    if (actor.length === 0) dirty = true;
  }

  const dueRaw = params.get("due");
  let due: DueFacet | null = null;
  if (dueRaw !== null) {
    if (DUE_SET.has(dueRaw)) {
      due = dueRaw as DueFacet;
    } else {
      dirty = true;
    }
  }

  let from = params.get("from");
  let to = params.get("to");
  if (due !== "range") {
    if (from !== null || to !== null) dirty = true;
    from = null;
    to = null;
  } else {
    if (from !== null && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      dirty = true;
      from = null;
    }
    if (to !== null && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      dirty = true;
      to = null;
    }
  }

  const labelRaw = params.get("label");
  if (params.has("label") && !labelRaw) dirty = true;
  const label = labelRaw && labelRaw.length > 0 ? labelRaw : null;

  const itemRaw = params.get("item");
  if (params.has("item") && !itemRaw) dirty = true;
  const item = itemRaw && itemRaw.length > 0 ? itemRaw : null;

  const noteRaw = params.get("note");
  if (params.has("note") && !noteRaw) dirty = true;
  const note = noteRaw && noteRaw.length > 0 ? noteRaw : null;

  const state: RelayUrlState = {
    view,
    q,
    facets: { status, actor, due, from, to, label },
    item,
    note,
  };

  const canonical = serializeUrlState(state);
  const currentPath = viewRaw ? `/${viewRaw}` : "/";
  const qs = search.startsWith("?") ? search.slice(1) : search;
  const current = qs ? `${currentPath}?${qs}` : currentPath;
  if (canonical !== current) dirty = true;

  return { state, dirty };
}

/** Canonical `/{view}?q=&status=&…` with sorted lists and no empty params. */
export function serializeUrlState(state: RelayUrlState): string {
  const path = `/${state.view}`;
  const parts: string[] = [];
  // Keep commas in list params (`status=blocked,needs_you`) unencoded — canonical form.
  const add = (key: string, value: string) => {
    const enc = encodeURIComponent(value).replace(/%2C/gi, ",");
    parts.push(`${encodeURIComponent(key)}=${enc}`);
  };
  if (state.q.trim()) add("q", state.q);
  if (state.facets.status.length > 0) {
    add("status", sortStatuses(state.facets.status).join(","));
  }
  if (state.facets.actor.length > 0) {
    add("actor", sortActors(state.facets.actor).join(","));
  }
  if (state.facets.due) add("due", state.facets.due);
  if (state.facets.due === "range") {
    if (state.facets.from) add("from", state.facets.from);
    if (state.facets.to) add("to", state.facets.to);
  }
  if (state.facets.label) add("label", state.facets.label);
  if (state.item) add("item", state.item);
  if (state.note) add("note", state.note);
  return parts.length > 0 ? `${path}?${parts.join("&")}` : path;
}

export function urlsEqual(a: RelayUrlState, b: RelayUrlState): boolean {
  return serializeUrlState(a) === serializeUrlState(b);
}
