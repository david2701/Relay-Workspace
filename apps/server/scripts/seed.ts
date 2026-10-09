/**
 * CLI entry: reset-and-seed. Logic lives in src/seed/demo_seed.ts
 * so the HTTP API can import it under the server rootDir.
 */
import { seedDatabase } from "../src/seed/demo_seed.js";

seedDatabase();
