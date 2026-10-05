import { useCallback, useEffect, useRef, useState } from "react";

const INTERVAL_MS = 2000;

export function usePoll<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): {
  data: T | null;
  error: string | null;
  offline: boolean;
  lastOkAt: number | null;
  reload: () => Promise<void>;
  setData: (updater: (prev: T | null) => T | null) => void;
} {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const fails = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      setDataState(next);
      setError(null);
      fails.current = 0;
      setOffline(false);
      setLastOkAt(Date.now());
    } catch (err) {
      fails.current += 1;
      if (fails.current >= 3) setOffline(true);
      setError(err instanceof Error ? err.message : "Error");
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => {
      void reload();
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
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
