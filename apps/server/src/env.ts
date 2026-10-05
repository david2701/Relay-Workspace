import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

function defaultDbPath(): string {
  const candidates = [
    resolve(process.cwd(), "data/relay.db"),
    resolve(process.cwd(), "../../data/relay.db"),
  ];
  for (const p of candidates) {
    if (existsSync(resolve(p, ".."))) return p;
  }
  return candidates[0] ?? resolve(process.cwd(), "data/relay.db");
}

const EnvSchema = z.object({
  RELAY_HOST: z.string().default("127.0.0.1"),
  RELAY_PORT: z.coerce.number().int().positive().default(7420),
  RELAY_DB: z.string().default(defaultDbPath()),
  RELAY_WEB_ORIGIN: z.string().default("http://127.0.0.1:7421"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse({
    ...env,
    RELAY_DB: env.RELAY_DB ?? defaultDbPath(),
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
