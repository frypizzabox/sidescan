import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DbError } from "@/lib/errors.js";
import type { Db } from "@/db/connection.js";

/**
 * Resolves the migrations directory by walking up from this module until
 * we find the package root (the first dir with a package.json), then
 * reading src/db/migrations from there. Works in both tsx (dev) and tsup-
 * bundled (prod) because `src/db/migrations/` ships in the npm package
 * via the package.json `files` array.
 */
function resolveMigrationsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) {
      const candidate = join(dir, "src", "db", "migrations");
      if (existsSync(candidate)) return candidate;
    }
    dir = dirname(dir);
  }
  throw new DbError(
    "Could not locate migrations directory relative to module",
  );
}

interface Migration {
  version: string;
  filename: string;
  sql: string;
}

function listMigrations(): Migration[] {
  const dir = resolveMigrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files.map((filename) => {
    const version = filename.replace(/\.sql$/, "");
    const sql = readFileSync(join(dir, filename), "utf8");
    return { version, filename, sql };
  });
}

/**
 * Runs all pending migrations. Returns the list of versions applied.
 */
export function migrate(db: Db): string[] {
  ensureMigrationsTable(db);
  const applied = new Set(
    db
      .prepare<[], { version: string }>("SELECT version FROM schema_migrations")
      .all()
      .map((r) => r.version),
  );

  const pending = listMigrations().filter((m) => !applied.has(m.version));
  const results: string[] = [];

  for (const m of pending) {
    const tx = db.transaction(() => {
      try {
        db.exec(m.sql);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new DbError(
          `Migration ${m.filename} failed: ${msg}`,
          { cause: err },
        );
      }
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      ).run(m.version, new Date().toISOString());
    });
    tx();
    results.push(m.version);
  }

  return results;
}

function ensureMigrationsTable(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}
