/**
 * Restart demo sample data only (AC3-D4). Touches RELAY_DEMO_DB /
 * data/relay-demo.db — never data/relay.db.
 *
 *   pnpm --filter @relay/server exec tsx scripts/reset_demo.ts
 */
import { resetDemoDatabase } from "../src/seed/demo_seed.js";

const started = Date.now();
resetDemoDatabase();
console.info(`  elapsed_ms: ${Date.now() - started}`);
