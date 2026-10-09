import type { RelayService } from "@relay/core";
import type { SseHub } from "../sse_hub.js";
import { createApnsClient } from "./apns.js";
import {
  formatPushDisabledLog,
  formatPushEnabledLog,
  loadPushConfig,
  type PushRuntimeConfig,
  type parsePushRedactEnv,
} from "./config.js";
import { createPushDispatcher, type PushDispatcher } from "./dispatcher.js";
import { createFcmClient } from "./fcm.js";
import {
  createReminderWatcher,
  type ReminderWatcher,
} from "./reminder_watcher.js";

export type PushRuntime = {
  config: PushRuntimeConfig;
  dispatcher: PushDispatcher | null;
  reminders: ReminderWatcher;
  close(): void;
};

export type StartPushRuntimeOptions = {
  svc: RelayService;
  hub: SseHub;
  env?: NodeJS.ProcessEnv;
  config?: PushRuntimeConfig;
  log?: (line: string) => void;
  /** Test overrides for provider endpoints. */
  apnsAuthorities?: {
    production?: string;
    sandbox?: string;
    rejectUnauthorized?: boolean;
  };
  fcmEndpoints?: {
    tokenUrl?: string;
    sendUrlTemplate?: string;
  };
};

/**
 * Wire APNs/FCM clients + dispatcher + reminder watcher.
 * Logs a single line when credentials are missing (push disabled cleanly).
 */
export function startPushRuntime(opts: StartPushRuntimeOptions): PushRuntime {
  const log = opts.log ?? ((line: string) => console.info(line));
  const config = opts.config ?? loadPushConfig(opts.env ?? process.env);
  if (!config.enabled) {
    log(formatPushDisabledLog());
    return {
      config,
      dispatcher: null,
      reminders: createReminderWatcher({
        svc: opts.svc,
        intervalMs: config.reminderPollMs,
        enabled: false,
      }),
      close() {
        // nothing
      },
    };
  }
  log(formatPushEnabledLog(config));
  const apns = config.apns
    ? createApnsClient({
        keyPem: config.apns.keyPem,
        keyId: config.apns.keyId,
        teamId: config.apns.teamId,
        defaultTopic: config.apns.topic,
        ...(opts.apnsAuthorities?.production !== undefined
          ? { productionAuthority: opts.apnsAuthorities.production }
          : {}),
        ...(opts.apnsAuthorities?.sandbox !== undefined
          ? { sandboxAuthority: opts.apnsAuthorities.sandbox }
          : {}),
        ...(opts.apnsAuthorities?.rejectUnauthorized !== undefined
          ? { rejectUnauthorized: opts.apnsAuthorities.rejectUnauthorized }
          : {}),
      })
    : null;
  const fcm = config.fcm
    ? createFcmClient({
        credentials: config.fcm,
        ...(opts.fcmEndpoints?.tokenUrl !== undefined
          ? { tokenUrl: opts.fcmEndpoints.tokenUrl }
          : {}),
        ...(opts.fcmEndpoints?.sendUrlTemplate !== undefined
          ? { sendUrlTemplate: opts.fcmEndpoints.sendUrlTemplate }
          : {}),
      })
    : null;
  const dispatcher = createPushDispatcher({
    svc: opts.svc,
    hub: opts.hub,
    config,
    apns,
    fcm,
    log,
  });
  const reminders = createReminderWatcher({
    svc: opts.svc,
    intervalMs: config.reminderPollMs,
    enabled: true,
  });
  return {
    config,
    dispatcher,
    reminders,
    close() {
      dispatcher.close();
      reminders.close();
    },
  };
}

export type { PushDispatcher, PushRuntimeConfig, ReminderWatcher };
export {
  createApnsClient,
  createFcmClient,
  createPushDispatcher,
  createReminderWatcher,
  formatPushDisabledLog,
  formatPushEnabledLog,
  loadPushConfig,
  type parsePushRedactEnv,
};
