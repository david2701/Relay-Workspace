import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import {
  createServer as createHttpServer,
  type Server as HttpServer,
} from "node:http";
import {
  createSecureServer,
  type Http2Server,
  type Http2ServerRequest,
  type Http2ServerResponse,
} from "node:http2";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type CapturedApns = {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  jwtHeader: Record<string, unknown>;
  jwtPayload: Record<string, unknown>;
};

export type CapturedFcm = {
  authorization: string | null;
  body: unknown;
};

function decodeJwt(jwt: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
} {
  const [h, p] = jwt.split(".");
  if (!h || !p) throw new Error("bad jwt");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(p, "base64url").toString("utf8")),
  };
}

/** Generate a self-signed TLS cert for local HTTP/2 APNs mock. */
export function createTlsMaterial(): {
  dir: string;
  keyPem: string;
  certPem: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "relay-apns-tls-"));
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-nodes",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "pipe" },
  );
  return {
    dir,
    keyPem: readFileSync(keyPath, "utf8"),
    certPem: readFileSync(certPath, "utf8"),
  };
}

export function generateApnsP8(): {
  privateKeyPem: string;
  keyId: string;
  teamId: string;
} {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    keyId: randomBytes(5).toString("hex").toUpperCase().slice(0, 10),
    teamId: randomBytes(5).toString("hex").toUpperCase().slice(0, 10),
  };
}

export function generateFcmServiceAccount(): {
  credentials: {
    client_email: string;
    private_key: string;
    project_id: string;
  };
  credentialsPath: string;
  dir: string;
} {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const private_key = privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;
  const credentials = {
    client_email: "relay-push@test.iam.gserviceaccount.com",
    private_key,
    project_id: "relay-test",
  };
  const dir = mkdtempSync(join(tmpdir(), "relay-fcm-cred-"));
  const credentialsPath = join(dir, "sa.json");
  writeFileSync(credentialsPath, JSON.stringify(credentials), "utf8");
  return { credentials, credentialsPath, dir };
}

export type MockApnsServer = {
  authority: string;
  requests: CapturedApns[];
  /** Tokens that should return 410 BadDeviceToken. */
  deadTokens: Set<string>;
  close(): Promise<void>;
};

export async function startMockApns(tls: {
  keyPem: string;
  certPem: string;
}): Promise<MockApnsServer> {
  const requests: CapturedApns[] = [];
  const deadTokens = new Set<string>();
  const server: Http2Server = createSecureServer(
    { key: tls.keyPem, cert: tls.certPem },
    (req: Http2ServerRequest, res: Http2ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const auth = String(req.headers.authorization ?? "");
        const jwt = auth.replace(/^bearer\s+/i, "");
        const decoded = decodeJwt(jwt);
        const body = raw ? JSON.parse(raw) : null;
        requests.push({
          path: req.url ?? "",
          headers: { ...req.headers } as Record<
            string,
            string | string[] | undefined
          >,
          body,
          jwtHeader: decoded.header,
          jwtPayload: decoded.payload,
        });
        const token = (req.url ?? "").replace(/^\/3\/device\//, "");
        if (deadTokens.has(token)) {
          res.writeHead(410, { "content-type": "application/json" });
          res.end(JSON.stringify({ reason: "BadDeviceToken" }));
          return;
        }
        res.writeHead(200);
        res.end();
      });
    },
  );
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  const authority = `https://127.0.0.1:${addr.port}`;
  return {
    authority,
    requests,
    deadTokens,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export type MockFcmServer = {
  tokenUrl: string;
  sendUrlTemplate: string;
  accessTokensIssued: string[];
  assertions: Array<{
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
  }>;
  sends: CapturedFcm[];
  deadTokens: Set<string>;
  close(): Promise<void>;
};

export async function startMockFcm(): Promise<MockFcmServer> {
  const accessTokensIssued: string[] = [];
  const assertions: Array<{
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
  }> = [];
  const sends: CapturedFcm[] = [];
  const deadTokens = new Set<string>();

  const server: HttpServer = createHttpServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const url = req.url ?? "";
      if (url === "/token" && req.method === "POST") {
        const params = new URLSearchParams(raw);
        const assertion = params.get("assertion") ?? "";
        assertions.push(decodeJwt(assertion));
        const token = `fcm-access-${accessTokensIssued.length + 1}`;
        accessTokensIssued.push(token);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ access_token: token, expires_in: 3600 }));
        return;
      }
      if (url.startsWith("/v1/projects/") && req.method === "POST") {
        const authorization = req.headers.authorization ?? null;
        const body = raw ? JSON.parse(raw) : null;
        sends.push({ authorization, body });
        const token = String(
          (body as { message?: { token?: string } })?.message?.token ?? "",
        );
        if (deadTokens.has(token)) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: {
                status: "NOT_FOUND",
                details: [{ errorCode: "UNREGISTERED" }],
              },
            }),
          );
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ name: "projects/relay-test/messages/1" }));
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  const base = `http://127.0.0.1:${addr.port}`;
  return {
    tokenUrl: `${base}/token`,
    sendUrlTemplate: `${base}/v1/projects/{projectId}/messages:send`,
    accessTokensIssued,
    assertions,
    sends,
    deadTokens,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
