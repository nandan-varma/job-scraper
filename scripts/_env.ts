/**
 * Load .env.local before anything else. Must be the FIRST import in any
 * script entrypoint — ES module evaluation runs each imported module's body
 * in import-declaration order, so this has to precede imports of modules
 * (like db/client.ts) that read process.env at module-load time.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) config({ path: ".env.local" });
