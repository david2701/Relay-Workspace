/**
 * Seed the dedicated demo store (data/relay-demo.db) in English with
 * onboarding_completed_at left null (PR1 / AC3-D1).
 *
 *   RELAY_DEMO_DB=… pnpm --filter @relay/server exec tsx scripts/seed_demo.ts
 */
import { seedDemoDatabase } from "../src/seed/demo_seed.js";

seedDemoDatabase();
