import type { RelayService } from "@relay/core";

export type ReminderWatcherOptions = {
  svc: RelayService;
  intervalMs: number;
  now?: () => Date;
  /** When false, watcher is a no-op (push disabled). */
  enabled?: boolean;
};

export type ReminderWatcher = {
  pollOnce(): number;
  close(): void;
};

/**
 * Periodically emits `reminder_fired` item_events for due reminders.
 * The push dispatcher (subscribed to the SSE hub) picks those events up the
 * same way as needs_you / assigned — including cross-process writes.
 */
export function createReminderWatcher(
  opts: ReminderWatcherOptions,
): ReminderWatcher {
  if (opts.enabled === false) {
    return { pollOnce: () => 0, close: () => undefined };
  }
  const now = opts.now ?? (() => new Date());
  const timer = setInterval(() => {
    pollOnce();
  }, opts.intervalMs);
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  function pollOnce(): number {
    return opts.svc.fireDueReminders(now()).length;
  }

  return {
    pollOnce,
    close() {
      clearInterval(timer);
    },
  };
}
