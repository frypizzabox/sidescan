import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DbError } from "@/lib/errors.js";
import type { Db } from "@/db/connection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

interface Migration {
  version: string;
  filename: string;
  sql: string;
}

function listMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files.map((filename) => {
    const version = filename.replace(/\.sql$/, "");
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
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
