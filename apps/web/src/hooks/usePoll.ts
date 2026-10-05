import { useCallback, useEffect, useRef, useState } from "react";

/** Sub-second poll so MCP→UI worst case stays under the 2s AC3 SLA. */
const INTERVAL_MS = 750;

export function usePoll<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): {
  data: T | null;
  error: string | null;
  offline: boolean;
  lastOkAt: number | null;
  reload: () => Promise<void>;
  setData: (updater: ((prev: T | null) => T | null) | T | null) => void;
} {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const fails = useRef(0);
  const fetcherRef = useRef(fetcher);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const pendingReload = useRef(false);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (inFlight.current) {
      pendingReload.current = true;
      return;
    }
    const gen = generation.current;
    inFlight.current = true;
    try {
      const next = await fetcherRef.current();
      if (gen !== generation.current) return;
      setDataState(next);
      setError(null);
      fails.current = 0;
      setOffline(false);
      setLastOkAt(Date.now());
    } catch (err) {
      if (gen !== generation.current) return;
      fails.current += 1;
      if (fails.current >= 3) setOffline(true);
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      inFlight.current = false;
      if (pendingReload.current && gen === generation.current) {
        pendingReload.current = false;
        void reload();
      }
    }
  }, []);

  useEffect(() => {
    generation.current += 1;
    setDataState(null);
    void reload();
    const id = window.setInterval(() => {
      void reload();
    }, INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) void reload();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data,
    error,
    offline,
    lastOkAt,
    reload,
    setData: setDataState,
  };
}
