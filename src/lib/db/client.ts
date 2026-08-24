import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * Module-scoped connection: reused across requests within a process (Next.js
 * server runtime) and within a single sync run (GH Actions script). `max: 1`
 * for Neon's pooled connection string keeps this friendly to serverless
 * concurrency limits — Neon's own pooler (pgbouncer) handles fan-out.
 */
const client = postgres(process.env.DATABASE_URL, { max: 1 });

export const db = drizzle(client, { schema });
