import { parentPort, workerData } from "node:worker_threads";
import { setTimeout as sleep } from "node:timers/promises";

const { RelayService, USER_ACTOR_ID } = await import("../dist/index.js");

const { dbPath, count, offset } = workerData;

function isBusy(err) {
  const message = err instanceof Error ? err.message : String(err);
  return /database is locked|SQLITE_BUSY|busy/i.test(message);
}

async function openService() {
  let lastErr;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return new RelayService({ dbPath });
    } catch (err) {
      lastErr = err;
      if (!isBusy(err)) throw err;
      await sleep(25 * (attempt + 1));
    }
  }
  throw lastErr;
}

const svc = await openService();
try {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    let item;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        item = svc.createItem(
          { title: `C${offset + i}` },
          { type: "user", id: USER_ACTOR_ID },
          "ui",
        );
        break;
      } catch (err) {
        if (!isBusy(err) || attempt === 39) throw err;
        await sleep(25 * (attempt + 1));
      }
    }
    ids.push(item.id);
  }
  parentPort.postMessage({ ok: true, ids });
} catch (err) {
  parentPort.postMessage({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
} finally {
  svc.close();
}
