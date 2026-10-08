import { useCallback, useEffect, useRef, useState } from "react";
import type { AppView } from "../lib/types";
import {
  emptyUrlState,
  EMPTY_FACETS,
  parseUrlState,
  serializeUrlState,
  urlsEqual,
  type RelayUrlState,
  type UrlFacets,
} from "../lib/url_state";

export type UseUrlStateOptions = {
  /** Agent ids from catalog; unknown actors are stripped and URL rewritten. */
  knownActors?: ReadonlySet<string>;
};

function readLocation(knownActors?: ReadonlySet<string>): {
  state: RelayUrlState;
  dirty: boolean;
} {
  return parseUrlState(
    window.location.pathname,
    window.location.search,
    knownActors,
  );
}

function writeHistory(state: RelayUrlState, mode: "push" | "replace"): void {
  const url = serializeUrlState(state);
  const current = `${window.location.pathname}${window.location.search}`;
  if (url === current) return;
  if (mode === "push") {
    window.history.pushState({ relay: true }, "", url);
  } else {
    window.history.replaceState({ relay: true }, "", url);
  }
}

/**
 * Canonical URL `/{view}?q=&status=&actor=&due=&from=&to=&label=&item=&note=`
 * — pushState for view/facets; replaceState for q, item, note; popstate restores.
 */
export function useUrlState(opts?: UseUrlStateOptions): {
  state: RelayUrlState;
  setView: (view: AppView, clearFacets?: boolean) => void;
  setQuery: (q: string) => void;
  setFacets: (facets: UrlFacets | ((prev: UrlFacets) => UrlFacets)) => void;
  clearFilters: () => void;
  setItem: (item: string | null) => void;
  setNote: (note: string | null) => void;
  replaceAll: (next: RelayUrlState) => void;
} {
  const knownActors = opts?.knownActors;
  const [state, setState] = useState<RelayUrlState>(() => {
    if (typeof window === "undefined") return emptyUrlState();
    return readLocation(knownActors).state;
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const knownRef = useRef(knownActors);
  knownRef.current = knownActors;

  // Initial canonicalize + known-actor hygiene
  useEffect(() => {
    const { state: parsed, dirty } = readLocation(knownRef.current);
    if (dirty || !urlsEqual(parsed, stateRef.current)) {
      setState(parsed);
      writeHistory(parsed, "replace");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Re-validate actors when catalog arrives
  useEffect(() => {
    if (!knownActors || knownActors.size === 0) return;
    const { state: parsed, dirty } = readLocation(knownActors);
    if (dirty) {
      setState(parsed);
      writeHistory(parsed, "replace");
    }
  }, [knownActors]);

  useEffect(() => {
    function onPop() {
      const { state: parsed, dirty } = readLocation(knownRef.current);
      setState(parsed);
      if (dirty) writeHistory(parsed, "replace");
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setView = useCallback((view: AppView, clearFacets = true) => {
    setState((prev) => {
      if (prev.view === view && !clearFacets) return prev;
      const next: RelayUrlState = clearFacets
        ? {
            view,
            q: "",
            facets: { ...EMPTY_FACETS },
            item: null,
            note: null,
          }
        : { ...prev, view };
      writeHistory(next, "push");
      return next;
    });
  }, []);

  const setQuery = useCallback((q: string) => {
    setState((prev) => {
      if (prev.q === q) return prev;
      const next = { ...prev, q };
      writeHistory(next, "replace");
      return next;
    });
  }, []);

  const setFacets = useCallback(
    (facets: UrlFacets | ((prev: UrlFacets) => UrlFacets)) => {
      setState((prev) => {
        const nextFacets =
          typeof facets === "function" ? facets(prev.facets) : facets;
        const next = { ...prev, facets: nextFacets };
        if (urlsEqual(next, prev)) return prev;
        writeHistory(next, "push");
        return next;
      });
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setState((prev) => {
      const next: RelayUrlState = {
        ...prev,
        q: "",
        facets: { ...EMPTY_FACETS },
      };
      if (urlsEqual(next, prev)) return prev;
      writeHistory(next, "push");
      return next;
    });
  }, []);

  const setItem = useCallback((item: string | null) => {
    setState((prev) => {
      if (prev.item === item) return prev;
      // Changing the selected item closes any open note.
      const next = { ...prev, item, note: null };
      writeHistory(next, "replace");
      return next;
    });
  }, []);

  const setNote = useCallback((note: string | null) => {
    setState((prev) => {
      if (prev.note === note) return prev;
      const next = { ...prev, note };
      writeHistory(next, "replace");
      return next;
    });
  }, []);

  const replaceAll = useCallback((next: RelayUrlState) => {
    setState((prev) => {
      if (urlsEqual(next, prev)) return prev;
      writeHistory(next, "replace");
      return next;
    });
  }, []);

  return {
    state,
    setView,
    setQuery,
    setFacets,
    clearFilters,
    setItem,
    setNote,
    replaceAll,
  };
}
