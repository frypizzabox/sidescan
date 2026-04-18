import type { Db } from "@/db/connection.js";

export interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  ai_inferred_summary: string | null;
  scan_frequency: "daily" | "weekly" | "hourly" | "manual";
  scan_time: string | null;
  bootstrap_lookback_years: number;
  hidden: number;
  created_at: string;
  updated_at: string;
}

export interface RepoRow {
  id: number;
  project_id: number;
  path: string;
  /** For GitHub URLs, optional non-default branch. Null for local paths or when using default. */
  branch: string | null;
  last_scanned_at: string | null;
  last_commit_sha_seen: string | null;
  created_at: string;
  updated_at: string;
}

export function listProjects(db: Db, opts: { includeHidden?: boolean } = {}): ProjectRow[] {
  const sql = opts.includeHidden
    ? "SELECT * FROM project ORDER BY name"
    : "SELECT * FROM project WHERE hidden = 0 ORDER BY name";
  return db.prepare<[], ProjectRow>(sql).all();
}

export function getProjectBySlug(
  db: Db,
  slug: string,
): ProjectRow | undefined {
  return db
    .prepare<[string], ProjectRow>("SELECT * FROM project WHERE slug = ?")
    .get(slug);
}

export function listReposForProject(db: Db, projectId: number): RepoRow[] {
  return db
    .prepare<[number], RepoRow>(
      "SELECT * FROM repo WHERE project_id = ? ORDER BY path",
    )
    .all(projectId);
}

export interface UpsertProjectInput {
  slug: string;
  name: string;
  description: string | null;
  scan_frequency: ProjectRow["scan_frequency"];
  scan_time: string | null;
  bootstrap_lookback_years: number;
}

export function insertProject(db: Db, input: UpsertProjectInput): number {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO project
        (slug, name, description, scan_frequency, scan_time, bootstrap_lookback_years, hidden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      input.slug,
      input.name,
      input.description,
      input.scan_frequency,
      input.scan_time,
      input.bootstrap_lookback_years,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

export function updateProject(db: Db, id: number, input: UpsertProjectInput): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE project
     SET slug = ?, name = ?, description = ?, scan_frequency = ?, scan_time = ?,
         bootstrap_lookback_years = ?, hidden = 0, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.slug,
    input.name,
    input.description,
    input.scan_frequency,
    input.scan_time,
    input.bootstrap_lookback_years,
    now,
    id,
  );
}

export function hideProject(db: Db, id: number): void {
  db.prepare(
    "UPDATE project SET hidden = 1, updated_at = ? WHERE id = ?",
  ).run(new Date().toISOString(), id);
}

export function insertRepo(
  db: Db,
  projectId: number,
  path: string,
  branch: string | null = null,
): number {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO repo (project_id, path, branch, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(projectId, path, branch, now, now);
  return Number(result.lastInsertRowid);
}

export function updateRepoBranch(
  db: Db,
  id: number,
  branch: string | null,
): void {
  db.prepare(
    "UPDATE repo SET branch = ?, updated_at = ? WHERE id = ?",
  ).run(branch, new Date().toISOString(), id);
}

export function deleteRepo(db: Db, id: number): void {
  db.prepare("DELETE FROM repo WHERE id = ?").run(id);
}
