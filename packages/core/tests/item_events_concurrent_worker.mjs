import { parentPort, workerData } from "node:worker_threads";

const { RelayService, USER_ACTOR_ID } = await import("../dist/index.js");

const { dbPath, count, offset } = workerData;
const svc = new RelayService({ dbPath });
try {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const item = svc.createItem(
      { title: `C${offset + i}` },
      { type: "user", id: USER_ACTOR_ID },
      "ui",
    );
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
