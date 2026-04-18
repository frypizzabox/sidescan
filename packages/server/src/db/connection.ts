import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DbError } from "@/lib/errors.js";

export type Db = Database.Database;

/**
 * Opens a SQLite connection with our standard pragmas (WAL + foreign keys on).
 * Creates the parent directory if missing.
 */
export function openDb(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  try {
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DbError(`Failed to open DB at ${path}: ${msg}`, { cause: err });
  }
}
