import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActorMark } from "./components/ActorMark";
import { DetailPanel } from "./components/DetailPanel";
import { FilterBar } from "./components/FilterBar";
import { ItemRow } from "./components/ItemRow";
import { NoteView } from "./components/NoteView";
import { OnboardingCard } from "./components/OnboardingCard";
import { focusSearchField } from "./components/SearchField";
import {
  parseSettingsSection,
  SettingsPanel,
  type SettingsSection,
} from "./components/SettingsPanel";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { VirtualItemList } from "./components/VirtualItemList";
import { useActorLabels } from "./hooks/useActorLabels";
import { useInboxLive } from "./hooks/useInboxLive";
import { useTheme } from "./hooks/useTheme";
import { useUrlState } from "./hooks/useUrlState";
import { useI18n, useT } from "./i18n/I18nProvider";
import type { MessageKey } from "./i18n/types";
import { markForOwner, markForUser } from "./lib/actor_mark";
import { api, type RelaySettings } from "./lib/api";
import { groupByDue } from "./lib/date_groups";
import { setDisplayContext } from "./lib/display_context";
import { itemMatchesFacets } from "./lib/facet_filter";
import { formatGroupLabel } from "./lib/group_label";
import { appendInboxPage, INBOX_PAGE_SIZE } from "./lib/inbox_page";
import { toPlainText } from "./lib/markdown";
import { matchesQuery } from "./lib/normalize";
import {
  readTodoGroupBy,
  TODO_GROUP_KEY,
} from "./lib/todo_group_pref";
import type {
  Agent,
  AppView,
  InboxResult,
  InboxView,
  Note,
  Recommendation,
  SearchMatch,
  WorkItem,
} from "./lib/types";
import {
  EMPTY_FACETS,
  hasActiveFacets,
  USER_ACTOR_ID,
} from "./lib/url_state";
import { setUserProfile } from "./lib/user_profile";
import {
  assertNoDuplicateIds,
  buildViewSections,
  type LingerRow,
} from "./lib/view_model";
import "./components/ActorMark.css";
import "./App.css";

const COLLAPSED_GROUPS_KEY = "relay.groups.collapsed.all";

function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function dismissedKey(id: string): string {
  return `relay.dismiss.${id}`;
}

const DEFAULT_SETTINGS: RelaySettings = {
  timezone: "Europe/Paris",
  user_display_name: "",
  user_initial: "",
  onboarding_completed_at: null,
};

const APP_VERSION = "0.3.0-dev";

function readSettingsSectionFromUrl(): SettingsSection | null {
  if (typeof window === "undefined") return null;
  return parseSettingsSection(
    new URLSearchParams(window.location.search).get("settings"),
  );
}

export default function App() {
  const t = useT();
  const actorLabels = useActorLabels();
  const { locale, intlLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<RelaySettings>(DEFAULT_SETTINGS);
  const [workItemCount, setWorkItemCount] = useState(0);
  const [settingsStatus, setSettingsStatus] = useState<
    "loading" | "ok" | "error"
  >("loading");
  const urlSettingsSection = readSettingsSectionFromUrl();
  const [settingsOpen, setSettingsOpen] = useState(
    () => urlSettingsSection !== null,
  );
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(
    () => urlSettingsSection ?? "profile",
  );
  const settingsTriggerRef = useRef<HTMLElement | null>(null);
  const attentionTitleRef = useRef<HTMLHeadingElement | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const VIEWS = useMemo(
    (): { id: AppView; label: string }[] => [
      { id: "attention", label: t("nav.attention") },
      { id: "agent_wip", label: t("nav.agent_wip") },
      { id: "upcoming", label: t("nav.upcoming") },
      { id: "done", label: t("nav.done") },
      { id: "all", label: t("nav.all") },
      { id: "notes", label: t("nav.notes") },
    ],
    [t],
  );
  const knownActors = useMemo(
    () => new Set(agents.map((a) => a.id)),
    [agents],
  );
  const {
    state: urlState,
    setView: setUrlView,
    setQuery,
    setFacets,
    clearFilters,
    setItem: setUrlItem,
    setNote: setUrlNote,
    replaceAll: replaceUrl,
  } = useUrlState({ knownActors });
  const view = urlState.view;
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const selectedId = urlState.item;
  const selectedNoteId = urlState.note;
  const setSelectedId = useCallback(
    (id: string | null) => {
      setUrlItem(id);
    },
    [setUrlItem],
  );
  const openNote = useCallback(
    (noteId: string) => {
      setUrlNote(noteId);
    },
    [setUrlNote],
  );
  const closeNote = useCallback(() => {
    setUrlNote(null);
  }, [setUrlNote]);
  const onNoteChange = useCallback((n: Note) => {
    setNotes((prev) => prev.map((x) => (x.id === n.id ? n : x)));
  }, []);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [capture, setCapture] = useState("");
  const [pendingRows, setPendingRows] = useState<WorkItem[]>([]);
  const [lingerRows, setLingerRows] = useState<LingerRow[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [suggestedCollapsed, setSuggestedCollapsed] = useState(
    () => localStorage.getItem("relay.suggested.collapsed") === "1",
  );
  const [dismissTick, setDismissTick] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHowto, setShowHowto] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    undo?: () => void;
  } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [gPending, setGPending] = useState(false);
  const [todoGroupBy, setTodoGroupBy] = useState<"due" | "none">(readTodoGroupBy);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    readCollapsedGroups,
  );
  const [openPicker, setOpenPicker] = useState<"due" | "reminder" | null>(null);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [searchMatches, setSearchMatches] = useState<Map<string, SearchMatch>>(
    () => new Map(),
  );
  const [searchAllowedIds, setSearchAllowedIds] = useState<Set<string> | null>(
    null,
  );
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevUpdated = useRef<Map<string, string>>(new Map());
  const prevItems = useRef<Map<string, WorkItem>>(new Map());
  const prevView = useRef<InboxView>("attention");
  const viewEpoch = useRef(0);
  const hydratedView = useRef<InboxView | null>(null);
  const syncAge = useRef(0);
  const inboxStateRef = useRef<InboxResult | null>(null);
  const searchGen = useRef(0);
  const [tick, setTick] = useState(0);

  const selectView = useCallback((next: AppView) => {
    if (next === view) return;
    setUrlView(next, true);
  }, [view, setUrlView]);

  // Wipe linger before paint on every view change (rail, G+letter, popstate).
  const lastViewRef = useRef(view);
  useLayoutEffect(() => {
    if (lastViewRef.current === view) return;
    lastViewRef.current = view;
    viewEpoch.current += 1;
    hydratedView.current = null;
    prevItems.current = new Map();
    prevUpdated.current = new Map();
    setLingerRows([]);
    setFacetsOpen(false);
  }, [view]);

  useEffect(() => {
    void api.agents().then((r) => setAgents(r.agents));
  }, []);

  useEffect(() => {
    void api
      .getSettings()
      .then((r) => {
        setSettings(r.settings);
        setWorkItemCount(r.work_item_count);
        setSettingsStatus("ok");
      })
      .catch(() => {
        setSettingsStatus("error");
      });
  }, []);

  const needsOnboarding =
    settingsStatus === "ok" && settings.onboarding_completed_at === null;

  useEffect(() => {
    setDisplayContext({
      timezone: settings.timezone,
      intlLocale,
      locale,
    });
    setUserProfile({
      displayName: settings.user_display_name,
      initial: settings.user_initial,
    });
  }, [settings.timezone, settings.user_display_name, settings.user_initial, intlLocale, locale]);

  const applySettingsPatch = useCallback((patch: Partial<RelaySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const persistSettings = useCallback(async (patch: Partial<RelaySettings>) => {
    const { settings: next } = await api.updateSettings(patch);
    setSettings(next);
  }, []);

  const inboxView: InboxView = view === "notes" ? "attention" : view;
  const loadingMoreRef = useRef(false);

  // Reset page-append state when the lens changes (useInboxLive clears data).
  useEffect(() => {
    inboxStateRef.current = null;
    loadingMoreRef.current = false;
  }, [inboxView]);

  const {
    data: inboxRaw,
    error,
    offline,
    syncState,
    lastOkAt,
    setData: setInboxRaw,
    reload,
    lastEventItemIds,
  } = useInboxLive(inboxView);

  const loadMoreInbox = useCallback(async () => {
    const cur = inboxStateRef.current;
    if (!cur?.has_more || !cur.next_cursor || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    const cursor = cur.next_cursor;
    try {
      const page = (await api.inbox(inboxView, {
        limit: INBOX_PAGE_SIZE,
        cursor,
      })) as InboxResult;
      // Merge onto the *latest* ref — an SSE delta may have landed while
      // this page fetch was in flight (AC3 mutations must not be wiped).
      const latest = inboxStateRef.current ?? cur;
      const merged = appendInboxPage(latest, page);
      if (latest.sync_cursor) merged.sync_cursor = latest.sync_cursor;
      if (latest.seq !== undefined) merged.seq = latest.seq;
      if (latest.counters) merged.counters = latest.counters;
      if (latest.section_counts) merged.section_counts = latest.section_counts;
      if (latest.total_count !== undefined) {
        merged.total_count = latest.total_count;
      }
      inboxStateRef.current = merged;
      setInboxRaw(merged);
    } catch {
      // Ignore; next scroll will retry.
    } finally {
      loadingMoreRef.current = false;
    }
  }, [inboxView, setInboxRaw]);

  const setInbox = useCallback(
    (updater: ((prev: InboxResult | null) => InboxResult | null) | InboxResult | null) => {
      setInboxRaw((prev) => {
        const next =
          typeof updater === "function" ? updater(prev) : updater;
        if (next) inboxStateRef.current = next;
        return next;
      });
    },
    [setInboxRaw],
  );

  // Ignore a previous view's payload while the matching fetch is in flight.
  const inbox =
    inboxRaw && inboxRaw.view === inboxView ? inboxRaw : null;

  useEffect(() => {
    if (inboxRaw) inboxStateRef.current = inboxRaw;
  }, [inboxRaw]);

  useEffect(() => {
    if (view !== "notes") return;
    void api.notes().then((r) => setNotes(r.notes));
  }, [view, lastOkAt]);

  const refreshSelectedItem = useCallback((id: string) => {
    void api.getItem(id).then((r) => {
      setSelectedItem((prev) => {
        const active = document.activeElement;
        const editingField = active?.closest(
          "[contenteditable], textarea, input, .dtp-trigger, .dtp-popover",
        );
        if (prev && editingField) {
          if (prev.updated_at !== r.item.updated_at) {
            flash(r.item.id);
          }
          // Keep local drafts for title / Objetivo while the field is focused.
          const title =
            active?.closest(".detail-title") ||
            active?.closest("[contenteditable]")
              ? prev.title
              : r.item.title;
          const goal = active?.closest("#goal-field, .goal-field")
            ? prev.goal
            : r.item.goal;
          return { ...r.item, title, goal };
        }
        if (prev && prev.updated_at !== r.item.updated_at) flash(r.item.id);
        return r.item;
      });
    });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      return;
    }
    refreshSelectedItem(selectedId);
  }, [selectedId, refreshSelectedItem]);

  // SSE-driven detail refresh (no 750 ms poll).
  useEffect(() => {
    if (!selectedId || lastEventItemIds.length === 0) return;
    if (lastEventItemIds.includes(selectedId)) {
      refreshSelectedItem(selectedId);
    }
  }, [lastEventItemIds, selectedId, refreshSelectedItem]);

  // Keep prevView in sync when the lens changes (linger already wiped in selectView).
  useEffect(() => {
    prevView.current = inboxView;
  }, [inboxView]);

  useEffect(() => {
    if (!inbox) return;
    const epoch = viewEpoch.current;
    const nextMap = new Map<string, string>();
    const nextItems = new Map<string, WorkItem>();
    for (const item of inbox.items) {
      const prev = prevUpdated.current.get(item.id);
      const canFlashNew =
        hydratedView.current === inboxView && prevView.current === inboxView;
      if (prev && prev !== item.updated_at) flash(item.id);
      else if (!prev && canFlashNew) flash(item.id);
      nextMap.set(item.id, item.updated_at);
      nextItems.set(item.id, item);
    }
    // Drop linger once the item is present again in this view.
    setLingerRows((rows) =>
      rows.filter(
        (r) =>
          r.fromView === inboxView &&
          !nextItems.has(r.item.id) &&
          r.until > Date.now(),
      ),
    );
    // Only detect departures after this view has hydrated once — never treat
    // the first payload after a switch as "everything left" (BUG-2).
    const canLinger =
      hydratedView.current === inboxView && prevView.current === inboxView;
    if (canLinger) {
      const leftIds = [...prevItems.current.keys()].filter(
        (id) => !nextItems.has(id),
      );
      for (const id of leftIds) {
        const fromView = inboxView;
        const captureEpoch = epoch;
        void api.getItem(id).then(({ item }) => {
          if (viewEpoch.current !== captureEpoch) return;
          if (prevView.current !== fromView) return;
          if (prevItems.current.has(id)) return;
          const until = Date.now() + 2000;
          setLingerRows((rows) => [
            ...rows.filter((r) => r.item.id !== id),
            { item, fromView, until },
          ]);
          flash(item.id);
          window.setTimeout(() => {
            if (viewEpoch.current !== captureEpoch) return;
            setLingerRows((rows) => rows.filter((r) => r.item.id !== id));
          }, 2100);
        });
      }
    }
    prevUpdated.current = nextMap;
    prevItems.current = nextItems;
    prevView.current = inboxView;
    hydratedView.current = inboxView;
  }, [inbox, inboxView]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (lastOkAt) {
        syncAge.current = Math.max(0, Math.round((Date.now() - lastOkAt) / 1000));
        setTick((t) => t + 1);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lastOkAt]);

  function flash(id: string) {
    setFlashIds((prev) => new Set(prev).add(id));
    // Keep the seek token past one poll tick so virtualized oldest-first
    // rows at section ends still scroll into view (AC3 ≤2 s).
    window.setTimeout(() => {
      setFlashIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 2500);
  }

  const facetsActive = hasActiveFacets(urlState.facets);
  const qTrim = urlState.q.trim();
  const qActive = qTrim.length >= 2;
  /** True when the list is actually narrowed (not a 1-char stub). */
  const filtersActive =
    facetsActive || qActive || (view === "notes" && qTrim.length > 0);

  // Debounced server search (150 ms from 2 chars; facets alone also search).
  useEffect(() => {
    if (view === "notes") {
      setSearchAllowedIds(null);
      setSearchMatches(new Map());
      setSearchTotal(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const needSearch = facetsActive || qActive;
    if (!needSearch) {
      setSearchAllowedIds(null);
      setSearchMatches(new Map());
      setSearchTotal(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    if (offline) {
      // Offline: facets (and title) on client; no API search / note hits.
      if (inbox) {
        const ids = new Set(
          inbox.items
            .filter((i) => {
              if (facetsActive && !itemMatchesFacets(i, urlState.facets)) {
                return false;
              }
              if (qActive && !matchesQuery(i.title, qTrim)) return false;
              return facetsActive || qActive;
            })
            .map((i) => i.id),
        );
        setSearchAllowedIds(ids);
        setSearchTotal(ids.size);
      } else {
        setSearchAllowedIds(null);
        setSearchTotal(null);
      }
      setSearchMatches(new Map());
      setSearching(false);
      setSearchError(null);
      return;
    }
    const gen = ++searchGen.current;
    setSearching(true);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await api.search({
            ...(qActive ? { q: qTrim } : {}),
            ...(urlState.facets.status.length > 0
              ? { status: urlState.facets.status }
              : {}),
            ...(urlState.facets.actor.length > 0
              ? { actor: urlState.facets.actor }
              : {}),
            ...(urlState.facets.due
              ? { due: urlState.facets.due }
              : {}),
            ...(urlState.facets.due === "range" && urlState.facets.from
              ? { from: urlState.facets.from }
              : {}),
            ...(urlState.facets.due === "range" && urlState.facets.to
              ? { to: urlState.facets.to }
              : {}),
            view: inboxView,
            limit: 200,
          });
          if (searchGen.current !== gen) return;
          const ids = new Set(res.items.map((h) => h.item.id));
          const map = new Map<string, SearchMatch>();
          for (const h of res.items) map.set(h.item.id, h.match);
          setSearchAllowedIds(ids);
          setSearchMatches(map);
          setSearchTotal(res.total);
          setSearchError(null);
        } catch {
          if (searchGen.current !== gen) return;
          setSearchError(t("error.search"));
        } finally {
          if (searchGen.current === gen) setSearching(false);
        }
      })();
    }, qActive ? 150 : 0);
    return () => window.clearTimeout(handle);
  }, [
    view,
    inboxView,
    facetsActive,
    qActive,
    qTrim,
    urlState.facets,
    offline,
    inbox,
  ]);

  const baseUnfilteredCount = useMemo(() => {
    if (!inbox) return 0;
    if (typeof inbox.total_count === "number") return inbox.total_count;
    if (inbox.section_counts) {
      return Object.values(inbox.section_counts).reduce((n, c) => n + c, 0);
    }
    return buildViewSections({
      inbox,
      inboxView,
      lingerRows,
      pendingRows,
      filter: "",
      now: Date.now(),
    }).reduce((n, s) => n + (s.count ?? s.items.length), 0);
  }, [inbox, inboxView, lingerRows, pendingRows, tick]);

  const viewSections = useMemo(() => {
    const offlineTitleFilter =
      offline && qTrim.length > 0 && !facetsActive ? qTrim : "";
    const sections = buildViewSections({
      inbox,
      inboxView,
      lingerRows,
      pendingRows,
      filter: offlineTitleFilter,
      allowedIds: searchAllowedIds,
      now: Date.now(),
    });
    let result = sections;
    if (view === "all" && todoGroupBy === "due") {
      const items = sections.flatMap((s) => s.items);
      const buckets = groupByDue(items, new Date());
      const byKey = new Map<string, (typeof buckets)[number]>(
        buckets.map((g) => [g.key, g]),
      );
      const serverCounts = inbox?.group_counts;
      if (serverCounts && serverCounts.length > 0) {
        // Headers use full-view server totals; rows are the loaded page only.
        // Groups with count > 0 stay visible even when no rows are loaded yet.
        result = serverCounts
          .filter((c) => c.count > 0)
          .map((c) => ({
            key: c.key,
            label: formatGroupLabel(c.key, {
              t,
              intlLocale,
              date: c.date,
              timeZone: settings.timezone,
            }),
            items: byKey.get(c.key)?.items ?? [],
            count: c.count,
          }));
      } else {
        result = buckets.map((g) => ({
          key: g.key,
          labelKey: g.labelKey,
          label: t(g.labelKey),
          items: g.items,
          count: g.items.length,
        }));
      }
    } else if (view === "upcoming" || view === "done") {
      // Server sends stable codes — localize here (never use English label prose).
      result = result.map((s) => {
        if (s.labelKey || s.label) return s;
        return {
          ...s,
          label: formatGroupLabel(s.key, {
            t,
            intlLocale,
            date: s.date,
            timeZone: settings.timezone,
          }),
        };
      });
    }
    if (import.meta.env.DEV && result.length > 0) {
      assertNoDuplicateIds(result, inboxView);
    }
    return result;
  }, [
    inbox,
    inboxView,
    lingerRows,
    pendingRows,
    searchAllowedIds,
    offline,
    qTrim,
    facetsActive,
    tick,
    view,
    todoGroupBy,
    t,
    intlLocale,
    settings.timezone,
  ]);

  const flatItems = useMemo(() => {
    if (view === "all" && todoGroupBy === "due") {
      return viewSections
        .filter((s) => !collapsedGroups.has(s.key))
        .flatMap((s) => s.items);
    }
    return viewSections.flatMap((s) => s.items);
  }, [viewSections, view, todoGroupBy, collapsedGroups]);

  const filteredNotes = useMemo(() => {
    if (view !== "notes") return notes;
    if (!qTrim) return notes;
    return notes.filter(
      (n) =>
        matchesQuery(n.title, qTrim) ||
        matchesQuery(toPlainText(n.body_md), qTrim),
    );
  }, [notes, view, qTrim]);

  const filteredCount =
    view === "notes" ? filteredNotes.length : flatItems.length;
  const notesTotal = notes.length;
  // Never paint «Todo · 0» while the first snapshot is still loading.
  const inboxReady = Boolean(inbox) || Boolean(error);
  const headerCount =
    view === "notes"
      ? filtersActive
        ? t("header.of", { n: filteredNotes.length, total: notesTotal })
        : String(notesTotal)
      : !inboxReady
        ? null
        : filtersActive && baseUnfilteredCount > 0
          ? t("header.of", { n: flatItems.length, total: baseUnfilteredCount })
          : String(baseUnfilteredCount || flatItems.length);
  const countLive =
    filtersActive
      ? t("header.results", {
          n: filteredCount,
          total:
            view === "notes"
              ? notesTotal
              : baseUnfilteredCount || searchTotal || filteredCount,
        })
      : null;

  // If selection falls outside filtered results, move to first / clear.
  useEffect(() => {
    if (view === "notes") return;
    if (!selectedId) return;
    if (flatItems.some((i) => i.id === selectedId)) return;
    if (searchAllowedIds && !searchAllowedIds.has(selectedId)) {
      const first = flatItems[0];
      setSelectedId(first ? first.id : null);
    }
  }, [flatItems, selectedId, searchAllowedIds, view, setSelectedId]);

  // Rail Atención counter: when Atención is painted, use the rendered
  // Te necesita row count (same list as the header · N). Otherwise use
  // the last known server counter so the rail stays coherent off-view.
  const renderedNeedsYou = viewSections.find(
    (s) => s.key === "needs_you",
  )?.items.length;
  const needsYouCount =
    renderedNeedsYou !== undefined
      ? renderedNeedsYou
      : (inboxRaw?.counters.needs_you ?? 0);

  useEffect(() => {
    if (view !== "attention") return;
    void api.recommend().then((r) => setRecs(r.recommendations));
  }, [view, needsYouCount, dismissTick]);

  const visibleRecs = recs.filter(
    (r) => sessionStorage.getItem(dismissedKey(r.item_id)) !== "1",
  );

  const createItem = useCallback(
    async (openDetail: boolean) => {
      const title = capture.trim();
      if (!title || offline) return;
      const tempId = `itm_temp${Date.now().toString(36)}`;
      const optimistic: WorkItem = {
        id: tempId,
        title,
        goal: null,
        status: "inbox",
        assignee_type: "unassigned",
        assignee_id: null,
        due_at: null,
        reminder_at: null,
        reminder_intent: null,
        priority: "none",
        blocked_reason: null,
        needs_you_reason: null,
        source: "ui",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        completed_by_type: null,
        completed_by_id: null,
        last_actor_type: "user",
        last_actor_id: USER_ACTOR_ID,
        list_id: null,
      };
      setPendingRows((p) => [optimistic, ...p]);
      setCapture("");
      try {
        const { item } = await api.createItem(title);
        setPendingRows((p) => p.filter((x) => x.id !== tempId));
        setInbox((prev) =>
          prev
            ? { ...prev, items: [item, ...prev.items.filter((i) => i.id !== item.id)] }
            : prev,
        );
        flash(item.id);
        if (openDetail) setSelectedId(item.id);
        captureRef.current?.focus();
      } catch {
        setPendingRows((p) =>
          p.map((x) =>
            x.id === tempId
              ? { ...x, title: `${title} — ${t("capture.error")}` }
              : x,
          ),
        );
      }
    },
    [capture, offline, setInbox],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (needsOnboarding) return;
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      // Ignore picker/menu chrome; the main item list is also role=listbox.
      const overlayHost = t?.closest(
        "[role=dialog],[role=grid],[role=menu]",
      );
      const listbox = t?.closest("[role=listbox]");
      const inOverlay =
        !!overlayHost ||
        (!!listbox && !listbox.classList.contains("item-list"));

      // ⌘K reserved for palette (P1) — do nothing globally.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        return;
      }

      // Esc chain §4.2: popover/menu → note editor → search → shortcuts → capture → deselect
      if (e.key === "Escape") {
        if (inOverlay) return; // DateTimePicker / FacetMenu / dialogs stopPropagation
        if (facetsOpen) {
          e.stopPropagation();
          setFacetsOpen(false);
          return;
        }
        // NoteView / NoteEditor handle Esc (save+exit or back) via stopPropagation.
        if (
          selectedNoteId &&
          t?.closest("[data-note-panel], .note-editor, .note-view")
        ) {
          return;
        }
        if (selectedNoteId) {
          e.stopPropagation();
          closeNote();
          return;
        }
        const searchEl = document.getElementById(
          "view-filter",
        ) as HTMLInputElement | null;
        if (document.activeElement === searchEl) {
          e.stopPropagation();
          if (urlState.q) {
            setQuery("");
          } else {
            searchEl?.blur();
            listRef.current?.focus();
          }
          return;
        }
        if (showShortcuts) {
          e.stopPropagation();
          setShowShortcuts(false);
          return;
        }
        if (document.activeElement === captureRef.current) {
          e.stopPropagation();
          setCapture("");
          captureRef.current?.blur();
          return;
        }
        if (selectedId) {
          e.stopPropagation();
          setSelectedId(null);
          return;
        }
      }
      // Native checkbox / inputs: Space must not complete the list item (V12-M10).
      if (typing || inOverlay) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        captureRef.current?.focus();
        return;
      }
      if (e.key === "?" ) {
        setShowShortcuts(true);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        focusSearchField();
        return;
      }
      if (e.key === "f" || e.key === "F") {
        if (e.shiftKey) {
          e.preventDefault();
          clearFilters();
          return;
        }
        if (view !== "notes") {
          e.preventDefault();
          setFacetsOpen(true);
          return;
        }
      }
      if (e.key === "g" || e.key === "G") {
        setGPending(true);
        window.setTimeout(() => setGPending(false), 800);
        return;
      }
      if (gPending) {
        if (e.key.toLowerCase() === "s") {
          if (needsOnboarding) {
            setGPending(false);
            return;
          }
          settingsTriggerRef.current =
            (document.activeElement as HTMLElement) ?? null;
          setSettingsSection("profile");
          setSettingsOpen(true);
          setGPending(false);
          return;
        }
        const map: Record<string, AppView> = {
          a: "attention",
          g: "agent_wip",
          p: "upcoming",
          h: "done",
          t: "all",
          o: "notes",
        };
        const v = map[e.key.toLowerCase()];
        if (v) {
          selectView(v);
          setGPending(false);
        }
        return;
      }
      if ((e.key === "t" || e.key === "T") && selectedId) {
        e.preventDefault();
        setOpenPicker(e.shiftKey ? "reminder" : "due");
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1);
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1);
      }
      if (e.key === "Enter" && selectedId) {
        // already open
      }
      if ((e.key === "x" || e.key === "X" || e.key === " ") && selectedId) {
        e.preventDefault();
        void completeSelected();
      }
      if ((e.key === "d" || e.key === "D") && selectedId) {
        // DetailPanel handles D via focus; trigger assign popover indirectly
      }
      if (e.key === "m" || e.key === "M") {
        if (selectedId) void api.assignMe(selectedId).then((r) => {
          setSelectedItem(r.item);
          flash(r.item.id);
        });
      }
      if (e.shiftKey && (e.key === "R" || e.key === "r") && selectedId) {
        void api.reopen(selectedId).then((r) => {
          setSelectedItem(r.item);
          flash(r.item.id);
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function moveSelection(delta: number) {
    if (flatItems.length === 0) return;
    const idx = flatItems.findIndex((i) => i.id === selectedId);
    const next = flatItems[Math.max(0, Math.min(flatItems.length - 1, (idx < 0 ? 0 : idx) + delta))];
    if (next) setSelectedId(next.id);
  }

  async function completeSelected() {
    if (!selectedId || offline) return;
    const { item } = await api.complete(selectedId);
    setSelectedItem(item);
    flash(item.id);
    setToast({
      text: t("toast.completed"),
      undo: () => {
        void api.reopen(item.id).then((r) => {
          setSelectedItem(r.item);
          flash(r.item.id);
        });
      },
    });
    window.setTimeout(() => setToast(null), 5000);
    void reload();
  }

  const title =
    view === "notes"
      ? t("nav.notes")
      : VIEWS.find((v) => v.id === view)?.label ?? "Relay";

  return (
    <div className={`app-shell${needsOnboarding ? " is-onboarding" : ""}`}>
      <nav
        className="rail"
        aria-label={t("a11y.views")}
        inert={needsOnboarding ? true : undefined}
      >
        <div className="brand">Relay</div>
        <ul>
          {VIEWS.filter((v) => v.id !== "notes").map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className={view === v.id ? "active" : ""}
                aria-current={view === v.id ? "page" : undefined}
                onClick={() => selectView(v.id)}
              >
                <span className="rail-label">{v.label}</span>
                {v.id === "attention" && needsYouCount > 0 ? (
                  <span
                    className="rail-count mono"
                    data-rail-counter="attention"
                    aria-label={t("a11y.needsYouCount", { n: needsYouCount })}
                  >
                    {needsYouCount}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="rail-sep" />
        <button
          type="button"
          className={view === "notes" ? "active" : ""}
          onClick={() => selectView("notes")}
        >
          <span className="rail-label">{t("nav.notes")}</span>
        </button>
        <div className="rail-foot">
          <div
            className="mono sync-seal"
            data-sync-state={syncState}
            title={
              syncState === "reconnecting"
                ? t("sync.reconnecting")
                : offline
                  ? t("sync.offline")
                  : undefined
            }
          >
            {syncState === "offline"
              ? t("sync.offline")
              : syncState === "reconnecting"
                ? t("sync.reconnecting")
                : t("sync.ok", {
                    relative: new Intl.RelativeTimeFormat(intlLocale, {
                      numeric: "auto",
                      style: "short",
                    }).format(-Math.max(0, syncAge.current), "second"),
                  })}
          </div>
          <button type="button" className="linkish" onClick={() => setShowShortcuts(true)}>
            ? {t("nav.shortcuts")}
          </button>
          <button
            type="button"
            className="linkish settings-rail-btn"
            onClick={(e) => {
              settingsTriggerRef.current = e.currentTarget;
              setSettingsSection("profile");
              setSettingsOpen(true);
            }}
            aria-label={t("nav.settings")}
          >
            <span aria-hidden="true">⚙</span> {t("settings.open")}
          </button>
          <ThemeSwitch theme={theme} onChange={setTheme} />
        </div>
      </nav>

      {needsOnboarding ? (
        <OnboardingCard
          isPreloaded={workItemCount > 0}
          onCompleted={(next) => {
            setSettings(next);
            void api.getSettings().then((r) => {
              setSettings(r.settings);
              setWorkItemCount(r.work_item_count);
            });
            void api.agents().then((r) => setAgents(r.agents));
            reload();
            selectView("attention");
            window.setTimeout(() => {
              attentionTitleRef.current?.focus();
            }, 50);
          }}
        />
      ) : null}

      <main className="list-zone" hidden={needsOnboarding}>
        <header className="list-head">
          <div className="list-head-title">
            <h2 ref={attentionTitleRef} tabIndex={-1}>
              {title}
            </h2>
            {headerCount !== null ? (
              <span className="list-head-count mono" aria-hidden>
                · {headerCount}
              </span>
            ) : null}
          </div>
          <div className="list-head-actions">
            {view === "all" ? (
              <button
                type="button"
                className="group-toggle"
                aria-label={
                  todoGroupBy === "due"
                    ? t("groupBy.due")
                    : t("groupBy.none")
                }
                onClick={() => {
                  const next = todoGroupBy === "due" ? "none" : "due";
                  setTodoGroupBy(next);
                  localStorage.setItem(TODO_GROUP_KEY, next);
                }}
              >
                {todoGroupBy === "due" ? t("groupBy.due") : t("groupBy.none")}
              </button>
            ) : null}
          </div>
        </header>

        <FilterBar
          q={urlState.q}
          facets={urlState.facets}
          agents={agents}
          offline={offline}
          searching={searching}
          searchError={searchError}
          countLive={countLive}
          hideFacets={view === "notes"}
          hideOwner={false}
          placeholder={
            view === "notes"
              ? t("search.placeholderNotes")
              : t("search.placeholderItems")
          }
          onQueryChange={setQuery}
          onFacetsChange={setFacets}
          onClear={clearFilters}
          facetsOpen={facetsOpen}
          onFacetsOpenChange={setFacetsOpen}
          onFocusFirstResult={() => {
            const first = flatItems[0];
            if (first) {
              setSelectedId(first.id);
              listRef.current?.focus();
            }
          }}
        />

        {offline ? (
          <div className="banner offline" role="status">
            {t("offline.banner")}{" "}
            <button type="button" className="linkish" onClick={() => void reload()}>
              {t("cta.retry")}
            </button>{" "}
            <button
              type="button"
              className="linkish"
              onClick={() => setShowHowto((v) => !v)}
            >
              {t("offline.howto")}
            </button>
            {showHowto ? (
              <pre className="howto mono">{`relay api   →  http://127.0.0.1:7420
relay mcp   →  http://127.0.0.1:7420/mcp  ·  pnpm --filter @relay/server mcp:stdio
relay web   →  http://127.0.0.1:7421`}</pre>
            ) : null}
          </div>
        ) : null}

        {error && !offline ? (
          <div className="banner error" role="alert">
            {t("error.loadView")}{" "}
            <button type="button" className="linkish" onClick={() => void reload()}>
              {t("cta.retry")}
            </button>
          </div>
        ) : null}

        {view !== "notes" ? (
          <div className="capture-wrap">
            <label className="sr-only" htmlFor="quick-capture">
              {t("capture.label")}
            </label>
            <input
              id="quick-capture"
              ref={captureRef}
              className="quick-capture"
              placeholder={t("capture.placeholder")}
              value={capture}
              maxLength={200}
              disabled={offline}
              title={offline ? t("offline.disabled") : undefined}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void createItem(false);
                }
                if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault();
                  void createItem(true);
                }
                if (e.key === "Escape") {
                  setCapture("");
                  captureRef.current?.blur();
                }
              }}
            />
            {capture.length >= 180 ? (
              <span className="mono cap-count">
                {capture.length}/200
              </span>
            ) : (
              <span className="mono cap-hint">N</span>
            )}
          </div>
        ) : null}

        {view === "attention" && visibleRecs.length > 0 ? (
          <section className="suggested" aria-label={t("section.suggested")}>
            <button
              type="button"
              className="suggested-head label-caps"
              onClick={() => {
                const next = !suggestedCollapsed;
                setSuggestedCollapsed(next);
                localStorage.setItem(
                  "relay.suggested.collapsed",
                  next ? "1" : "0",
                );
              }}
            >
              {t("suggested.header", { n: visibleRecs.length })}
            </button>
            {!suggestedCollapsed
              ? visibleRecs.map((r) => {
                  const item =
                    inbox?.items.find((i) => i.id === r.item_id) ??
                    flatItems.find((i) => i.id === r.item_id);
                  const mark = item
                    ? markForOwner(item, agents, actorLabels)
                    : markForUser();
                  const title = r.title || item?.title || t("item.noTitle");
                  return (
                    <div key={r.item_id} className="suggested-row" role="listitem">
                      <ActorMark
                        kind={mark.kind}
                        name={mark.name}
                        monogram={mark.monogram}
                        size={20}
                      />
                      <div className="sug-text">
                        <div className="sug-title">{title}</div>
                        <div className="sug-reason">
                          {t(
                            r.reason_code as MessageKey,
                            r.reason_params ?? {},
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => setSelectedId(r.item_id)}
                      >
                        {t("cta.open")}
                      </button>
                      <button
                        type="button"
                        className="icon-x"
                        aria-label={t("cta.notNow")}
                        onClick={() => {
                          sessionStorage.setItem(dismissedKey(r.item_id), "1");
                          setDismissTick((n) => n + 1);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              : null}
          </section>
        ) : null}

        {view === "notes" ? (
          <div className="notes-list">
            {notes.length === 0 ? (
              <Empty text={t("empty.notes")} />
            ) : filteredNotes.length === 0 ? (
              <Empty
                text={t("empty.noMatch")}
                action={{
                  label: t("empty.clearFilters"),
                  onClick: clearFilters,
                }}
              />
            ) : (
              filteredNotes.map((n) => (
                <article
                  key={n.id}
                  className={`note-card list-note${selectedNoteId === n.id ? " is-selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openNote(n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openNote(n.id);
                    }
                  }}
                >
                  <strong>{n.title}</strong>
                  <p className="note-extract">{toPlainText(n.body_md)}</p>
                </article>
              ))
            )}
          </div>
        ) : (
          <div
            ref={listRef}
            className="item-list"
            role="listbox"
            tabIndex={0}
            data-inbox-view={inbox?.view ?? ""}
            aria-activedescendant={selectedId ? `row-${selectedId}` : undefined}
          >
            {!inbox && !error ? <Skeleton /> : null}
            {inbox ? (
              <VirtualItemList
                scrollRef={listRef}
                sections={viewSections}
                agents={agents}
                selectedId={selectedId}
                flashIds={flashIds}
                showChatBadge={view === "all"}
                showCompletedBy={view === "done"}
                dueGroupMode={view === "all" && todoGroupBy === "due"}
                matches={searchMatches}
                {...(view === "all" && todoGroupBy === "due"
                  ? {
                      collapsedKeys: collapsedGroups,
                      onToggleGroup: (key: string) => {
                        setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          localStorage.setItem(
                            COLLAPSED_GROUPS_KEY,
                            JSON.stringify([...next]),
                          );
                          return next;
                        });
                      },
                    }
                  : {})}
                onSelect={setSelectedId}
                hasMore={!!inbox.has_more}
                onLoadMore={() => {
                  void loadMoreInbox();
                }}
              />
            ) : null}
            {inbox && flatItems.length === 0 ? (
              filtersActive ? (
                <Empty
                  text={t("empty.noMatch")}
                  action={{
                    label: t("empty.clearFilters"),
                    onClick: clearFilters,
                  }}
                  secondary={
                    qTrim
                      ? {
                          label: t("empty.searchAllViews", { q: qTrim }),
                          onClick: () => {
                            replaceUrl({
                              view: "all",
                              q: qTrim,
                              facets: { ...EMPTY_FACETS },
                              item: null,
                              note: null,
                            });
                          },
                        }
                      : undefined
                  }
                />
              ) : view === "attention" ? (
                <Empty
                  text={t("empty.attention")}
                  action={{
                    label: t("empty.attentionCta"),
                    onClick: () => selectView("agent_wip"),
                  }}
                />
              ) : (
                <Empty
                  text={
                    view === "agent_wip"
                      ? t("empty.agent_wip")
                      : view === "upcoming"
                        ? t("empty.upcoming")
                        : view === "done"
                          ? t("empty.done")
                          : t("empty.all")
                  }
                />
              )
            ) : null}
            {pendingRows
              .filter((p) => !flatItems.some((i) => i.id === p.id))
              .map((item) => (
                <div key={item.id}>
                  <ItemRow
                    item={item}
                    agents={agents}
                    selected={selectedId === item.id}
                    flash={flashIds.has(item.id)}
                    onSelect={setSelectedId}
                  />
                  {view !== "all" ? (
                    <div className="elsewhere mono">
                      {t("capture.created_elsewhere")}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        )}

        {toast ? (
          <div className="toast" role="status">
            {toast.text}{" "}
            {toast.undo ? (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                {t("toast.undo")}
              </button>
            ) : null}
          </div>
        ) : null}
      </main>

      {(selectedId || selectedNoteId) && window.innerWidth < 1024 ? (
        <div
          className="detail-scrim"
          onClick={() => {
            if (selectedNoteId) closeNote();
            else setSelectedId(null);
          }}
        />
      ) : null}

      {needsOnboarding ? null : selectedNoteId ? (
        <NoteView
          noteId={selectedNoteId}
          offline={offline}
          returnLabel={
            selectedId ? t("note.backToItem") : t("note.close")
          }
          onBack={closeNote}
          onNoteChange={onNoteChange}
        />
      ) : (
        <DetailPanel
          item={selectedItem}
          agents={agents}
          offline={offline}
          onClose={() => setSelectedId(null)}
          onChange={(item) => {
            setSelectedItem(item);
            void reload();
          }}
          onFlash={flash}
          openPicker={openPicker}
          onOpenPickerHandled={() => setOpenPicker(null)}
          onOpenNote={openNote}
        />
      )}

      {showShortcuts ? (
        <div className="modal-scrim" onClick={() => setShowShortcuts(false)}>
          <div
            className="shortcuts"
            role="dialog"
            aria-label={t("shortcuts.title")}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t("shortcuts.title")}</h3>
            <ul className="mono">
              <li>{t("shortcuts.line1")}</li>
              <li>{t("shortcuts.line2")}</li>
              <li>{t("shortcuts.line3")}</li>
              <li>{t("shortcuts.line4")}</li>
              <li>{t("shortcuts.line5")}</li>
              <li>{t("shortcuts.line6")}</li>
              <li>{t("shortcuts.line7")}</li>
              <li>{t("shortcuts.line8")}</li>
            </ul>
            <button type="button" className="btn-secondary" onClick={() => setShowShortcuts(false)}>
              {t("shortcuts.close")}
            </button>
          </div>
        </div>
      ) : null}

      <SettingsPanel
        open={settingsOpen && !needsOnboarding}
        settings={settings}
        theme={theme}
        version={APP_VERSION}
        offline={offline}
        initialSection={settingsSection}
        onClose={() => {
          setSettingsOpen(false);
          window.setTimeout(() => {
            settingsTriggerRef.current?.focus();
          }, 0);
        }}
        onPatch={async (patch) => {
          applySettingsPatch(patch);
          await persistSettings(patch);
        }}
        onThemeChange={setTheme}
      />

      <div className="sr-only" aria-live="polite">
        {needsYouCount > 0
          ? t("a11y.needsYouCount", { n: needsYouCount })
          : ""}
      </div>
    </div>
  );
}

function Empty({
  text,
  action,
  secondary,
}: {
  text: string;
  action?: { label: string; onClick: () => void } | undefined;
  secondary?: { label: string; onClick: () => void } | undefined;
}) {
  return (
    <div className="empty">
      <p>{text}</p>
      {action ? (
        <button type="button" className="linkish" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {secondary ? (
        <button type="button" className="linkish" onClick={secondary.onClick}>
          {secondary.label}
        </button>
      ) : null}
    </div>
  );
}

function Skeleton() {
  const t = useT();
  return (
    <div aria-busy="true" className="skeleton">
      <span className="sr-only">{t("loading")}</span>
      {["a", "b", "c", "d", "e", "f"].map((id, i) => (
        <div key={id} className="skel-row" style={{ width: `${50 + (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}
