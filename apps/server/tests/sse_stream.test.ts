import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayService, USER_ACTOR_ID } from "@relay/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { createSseHub, type SseHub } from "../src/sse_hub.js";

type ParsedSse = {
  id?: string;
  event?: string;
  data?: string;
  retry?: string;
  comment?: string;
};

async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ParsedSse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (;;) {
        const split = buf.indexOf("\n\n");
        if (split < 0) break;
        const raw = buf.slice(0, split);
        buf = buf.slice(split + 2);
        const frame: ParsedSse = {};
        for (const line of raw.split("\n")) {
          if (line.startsWith(":")) {
            frame.comment = line.slice(1).trim();
          } else if (line.startsWith("id:")) {
            frame.id = line.slice(3).trim();
          } else if (line.startsWith("event:")) {
            frame.event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const piece = line.slice(5).trimStart();
            frame.data = frame.data ? `${frame.data}\n${piece}` : piece;
          } else if (line.startsWith("retry:")) {
            frame.retry = line.slice(6).trim();
          }
        }
        if (
          frame.id !== undefined ||
          frame.event !== undefined ||
          frame.data !== undefined ||
          frame.retry !== undefined ||
          frame.comment !== undefined
        ) {
          yield frame;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function collectUntil(
  body: ReadableStream<Uint8Array>,
  predicate: (frames: ParsedSse[]) => boolean,
  timeoutMs = 5000,
): Promise<ParsedSse[]> {
  const frames: ParsedSse[] = [];
  const deadline = Date.now() + timeoutMs;
  for await (const frame of readSseFrames(body)) {
    frames.push(frame);
    if (predicate(frames)) return frames;
    if (Date.now() > deadline) break;
  }
  return frames;
}

describe("GET /api/stream SSE", () => {
  let dir: string;
  let svc: RelayService;
  let hub: SseHub;
  let app: ReturnType<typeof createApp>;
  const actor = { type: "user" as const, id: USER_ACTOR_ID };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-sse-"));
    svc = new RelayService({ dbPath: join(dir, "t.db") });
    hub = createSseHub(svc, {
      maxConnections: 3,
      resyncThreshold: 5,
      watchIntervalMs: 40,
      heartbeatIntervalMs: 80,
      replayPageSize: 1,
    });
    app = createApp(svc, "http://127.0.0.1:7421", { streamHub: hub });
  });

  afterEach(() => {
    hub.close();
    svc.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("replays from Last-Event-ID with no gap/duplicate across handover", async () => {
    for (let i = 0; i < 4; i += 1) {
      svc.createItem({ title: `Pre-${i}` }, actor, "ui");
    }
    const headBefore = svc.latestSeq();

    const ac = new AbortController();
    const res = await app.request("http://127.0.0.1/api/stream", {
      headers: { "Last-Event-ID": "0" },
      signal: ac.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(res.body).toBeTruthy();

    // Concurrent writes while replay pages (page size 1) are streaming.
    const writePromise = (async () => {
      await new Promise((r) => setTimeout(r, 5));
      for (let i = 0; i < 3; i += 1) {
        svc.createItem({ title: `Live-${i}` }, actor, "ui");
        hub.pollOnce();
        await new Promise((r) => setTimeout(r, 5));
      }
    })();

    const frames = await collectUntil(res.body!, (f) => {
      const events = f.filter((x) => x.event && x.event !== "resync" && x.data);
      return events.length >= headBefore + 3;
    });
    await writePromise;

    const eventFrames = frames.filter(
      (f) => f.event && f.event !== "resync" && f.data,
    );
    const seqs = eventFrames.map((f) => Number(f.id));
    expect(seqs.length).toBeGreaterThanOrEqual(headBefore + 3);
    expect(new Set(seqs).size).toBe(seqs.length);
    for (let i = 1; i < seqs.length; i += 1) {
      expect(seqs[i]).toBe((seqs[i - 1] ?? 0) + 1);
    }
    expect(seqs[0]).toBe(1);
    expect(frames.some((f) => f.retry === "3000")).toBe(true);

    ac.abort();
  });

  it("sends heartbeat comments", async () => {
    const ac = new AbortController();
    const res = await app.request("http://127.0.0.1/api/stream", {
      signal: ac.signal,
    });
    expect(res.status).toBe(200);
    const frames = await collectUntil(
      res.body!,
      (f) => f.some((x) => x.comment === "heartbeat"),
      2000,
    );
    expect(frames.some((f) => f.comment === "heartbeat")).toBe(true);
    ac.abort();
  });

  it("returns 503 when connection cap is exceeded", async () => {
    const controllers: AbortController[] = [];
    for (let i = 0; i < 3; i += 1) {
      const ac = new AbortController();
      controllers.push(ac);
      const res = await app.request("http://127.0.0.1/api/stream", {
        signal: ac.signal,
      });
      expect(res.status).toBe(200);
      // Drain start so attach registers the client.
      void res.body?.getReader().read();
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(hub.size).toBe(3);
    const over = await app.request("http://127.0.0.1/api/stream");
    expect(over.status).toBe(503);
    const body = (await over.json()) as { error: string };
    expect(body.error).toBe("service_unavailable");
    for (const ac of controllers) ac.abort();
    await new Promise((r) => setTimeout(r, 30));
  });

  it("cleans up on client abort", async () => {
    const ac = new AbortController();
    const res = await app.request("http://127.0.0.1/api/stream", {
      signal: ac.signal,
    });
    expect(res.status).toBe(200);
    void res.body?.getReader().read();
    await new Promise((r) => setTimeout(r, 30));
    expect(hub.size).toBe(1);
    ac.abort();
    await new Promise((r) => setTimeout(r, 40));
    expect(hub.size).toBe(0);
  });

  it("delivers a cross-process write on the stream", async () => {
    const dbPath = join(dir, "t.db");
    const other = new RelayService({ dbPath });
    const ac = new AbortController();
    const res = await app.request("http://127.0.0.1/api/stream?after_seq=0", {
      signal: ac.signal,
    });
    expect(res.status).toBe(200);

    const title = `XPROC-SSE-${Date.now()}`;
    // Separate process connection (second RelayService) writing the same DB.
    other.createItem({ title }, { type: "agent", id: "agent-code" }, "mcp");

    const frames = await collectUntil(
      res.body!,
      (f) =>
        f.some((x) => {
          if (!x.data || x.event !== "created") return false;
          try {
            const ev = JSON.parse(x.data) as { payload?: { title?: string } };
            return ev.payload?.title === title;
          } catch {
            return false;
          }
        }),
      3000,
    );
    other.close();
    const hit = frames.find((x) => x.event === "created" && x.data?.includes(title));
    expect(hit).toBeTruthy();
    ac.abort();
  });

  it("sends resync when client is too far behind", async () => {
    for (let i = 0; i < 8; i += 1) {
      svc.createItem({ title: `Far-${i}` }, actor, "ui");
    }
    const ac = new AbortController();
    const res = await app.request("http://127.0.0.1/api/stream?after_seq=0", {
      signal: ac.signal,
    });
    expect(res.status).toBe(200);
    const frames = await collectUntil(
      res.body!,
      (f) => f.some((x) => x.event === "resync"),
      2000,
    );
    const resync = frames.find((f) => f.event === "resync");
    expect(resync).toBeTruthy();
    const data = JSON.parse(resync!.data!) as { reason: string; head_seq: number };
    expect(data.reason).toBe("too_far_behind");
    expect(data.head_seq).toBe(svc.latestSeq());
    ac.abort();
  });

  it("returns 400 for a bad Last-Event-ID", async () => {
    const bad = await app.request("http://127.0.0.1/api/stream", {
      headers: { "Last-Event-ID": "not-an-int" },
    });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as {
      error: string;
      message: string;
      field?: string;
    };
    expect(body.error).toBe("validation_error");
    expect(body.field).toBe("Last-Event-ID");
    expect(body.message).toMatch(/Last-Event-ID|safe integer/i);

    const sci = await app.request("http://127.0.0.1/api/stream?after_seq=1e21");
    expect(sci.status).toBe(400);

    const neg = await app.request("http://127.0.0.1/api/stream?after_seq=-1");
    expect(neg.status).toBe(400);
  });

  it("returns 400 for empty after_seq= and empty Last-Event-ID naming the field", async () => {
    const emptyQuery = await app.request("http://127.0.0.1/api/stream?after_seq=");
    expect(emptyQuery.status).toBe(400);
    const qBody = (await emptyQuery.json()) as {
      error: string;
      message: string;
      field?: string;
    };
    expect(qBody.error).toBe("validation_error");
    expect(qBody.field).toBe("after_seq");
    expect(qBody.message).toMatch(/after_seq/i);

    const emptyHeader = await app.request("http://127.0.0.1/api/stream", {
      headers: { "Last-Event-ID": "" },
    });
    expect(emptyHeader.status).toBe(400);
    const hBody = (await emptyHeader.json()) as {
      error: string;
      message: string;
      field?: string;
    };
    expect(hBody.error).toBe("validation_error");
    expect(hBody.field).toBe("Last-Event-ID");
    expect(hBody.message).toMatch(/Last-Event-ID/i);
  });
});
