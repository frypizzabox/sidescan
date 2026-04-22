import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";

describe("db migrations", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-db-test-"));
    db = openDb(join(dir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs initial migration cleanly on empty DB", () => {
    const applied = migrate(db);
    expect(applied).toEqual([
      "001_initial",
      "002_repo_branch",
      "003_read_state",
      "004_enrichment",
      "005_source_catalog",
      "006_insights_kind",
    ]);

    const row = db
      .prepare<[], { version: string }>(
        "SELECT version FROM schema_migrations",
      )
      .get();
    expect(row?.version).toBe("001_initial");
  });

  it("is idempotent — second run applies nothing", () => {
    migrate(db);
    const second = migrate(db);
    expect(second).toEqual([]);
  });

  it("creates all expected tables", () => {
    migrate(db);
    const tables = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r) => r.name);

    expect(tables).toEqual([
      "ai_summary",
      "finding",
      "project",
      "repo",
      "repo_activity",
      "scan",
      "schema_migrations",
      "sqlite_sequence",
    ]);
  });

  it("enforces foreign keys", () => {
    migrate(db);
    expect(() =>
      db
        .prepare(
          "INSERT INTO repo (project_id, path, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run(9999, "/tmp/x", "2026-04-18T00:00:00Z", "2026-04-18T00:00:00Z"),
    ).toThrow(/FOREIGN KEY/i);
  });

  it("enforces unique (source, url) on finding", () => {
    migrate(db);
    const now = "2026-04-18T00:00:00Z";
    db.prepare(
      "INSERT INTO project (slug, name, scan_frequency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("p", "P", "manual", now, now);
    db.prepare(
      "INSERT INTO repo (project_id, path, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(1, "/tmp/p", now, now);
    db.prepare(
      "INSERT INTO scan (repo_id, started_at, status) VALUES (?, ?, ?)",
    ).run(1, now, "success");

    const insertFinding = db.prepare(
      `INSERT INTO finding
        (scan_id, source, tab, url, title, first_seen_scan_id, last_seen_scan_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertFinding.run(1, "hn", "news", "https://a.test", "A", 1, 1, now);
    expect(() =>
      insertFinding.run(1, "hn", "news", "https://a.test", "A again", 1, 1, now),
    ).toThrow(/UNIQUE/i);
  });
});
