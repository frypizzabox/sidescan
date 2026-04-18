import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { parseConfig } from "@/config/parse.js";
import { reconcile } from "@/config/reconcile.js";
import { listProjects, listReposForProject } from "@/db/queries.js";
import type { Config } from "@/config/schema.js";

function cfg(yaml: string): Config {
  return parseConfig(yaml);
}

const BASE_YAML = `
providers: { ai: ollama }
projects:
  - name: Alpha
    slug: alpha
    scan: { frequency: weekly, time: "09:00" }
    repos:
      - path: /tmp/alpha
`;

describe("reconcile", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-reconcile-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("adds new projects on first run", () => {
    const summary = reconcile(db, cfg(BASE_YAML));
    expect(summary.projectsAdded).toBe(1);
    expect(summary.projectsUpdated).toBe(0);
    expect(summary.reposAdded).toBe(1);

    const projects = listProjects(db);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.slug).toBe("alpha");
    expect(projects[0]!.scan_frequency).toBe("weekly");
    expect(projects[0]!.scan_time).toBe("09:00");
  });

  it("is idempotent — second call reports no changes", () => {
    reconcile(db, cfg(BASE_YAML));
    const second = reconcile(db, cfg(BASE_YAML));
    expect(second).toEqual({
      projectsAdded: 0,
      projectsUpdated: 0,
      projectsHidden: 0,
      projectsUnhidden: 0,
      reposAdded: 0,
      reposRemoved: 0,
    });
  });

  it("updates changed project fields", () => {
    reconcile(db, cfg(BASE_YAML));

    const updated = `
providers: { ai: ollama }
projects:
  - name: Alpha Renamed
    slug: alpha
    description: Now with description
    bootstrap_lookback_years: 3
    scan: { frequency: daily, time: "10:00" }
    repos:
      - path: /tmp/alpha
`;
    const summary = reconcile(db, cfg(updated));
    expect(summary.projectsUpdated).toBe(1);

    const project = listProjects(db)[0]!;
    expect(project.name).toBe("Alpha Renamed");
    expect(project.description).toBe("Now with description");
    expect(project.bootstrap_lookback_years).toBe(3);
    expect(project.scan_frequency).toBe("daily");
    expect(project.scan_time).toBe("10:00");
  });

  it("hides projects that disappear from config", () => {
    const two = `
providers: { ai: ollama }
projects:
  - name: Alpha
    slug: alpha
    scan: { frequency: weekly }
    repos: [{ path: /tmp/a }]
  - name: Beta
    slug: beta
    scan: { frequency: weekly }
    repos: [{ path: /tmp/b }]
`;
    reconcile(db, cfg(two));
    const onlyAlpha = reconcile(db, cfg(BASE_YAML));
    expect(onlyAlpha.projectsHidden).toBe(1);

    const visible = listProjects(db);
    expect(visible.map((p) => p.slug)).toEqual(["alpha"]);

    const all = listProjects(db, { includeHidden: true });
    expect(all.map((p) => p.slug).sort()).toEqual(["alpha", "beta"]);
    const beta = all.find((p) => p.slug === "beta")!;
    expect(beta.hidden).toBe(1);
  });

  it("un-hides projects when they come back to config", () => {
    const two = `
providers: { ai: ollama }
projects:
  - name: Alpha
    slug: alpha
    scan: { frequency: weekly }
    repos: [{ path: /tmp/a }]
  - name: Beta
    slug: beta
    scan: { frequency: weekly }
    repos: [{ path: /tmp/b }]
`;
    reconcile(db, cfg(two));
    reconcile(db, cfg(BASE_YAML)); // hides beta
    const summary = reconcile(db, cfg(two)); // restores beta
    expect(summary.projectsUnhidden).toBe(1);

    const visible = listProjects(db);
    expect(visible.map((p) => p.slug).sort()).toEqual(["alpha", "beta"]);
  });

  it("adds new repos to existing project", () => {
    reconcile(db, cfg(BASE_YAML));

    const withExtraRepo = `
providers: { ai: ollama }
projects:
  - name: Alpha
    slug: alpha
    scan: { frequency: weekly, time: "09:00" }
    repos:
      - path: /tmp/alpha
      - path: /tmp/alpha-sidecar
`;
    const summary = reconcile(db, cfg(withExtraRepo));
    expect(summary.reposAdded).toBe(1);
    expect(summary.reposRemoved).toBe(0);

    const project = listProjects(db)[0]!;
    const repos = listReposForProject(db, project.id);
    expect(repos.map((r) => r.path).sort()).toEqual([
      "/tmp/alpha",
      "/tmp/alpha-sidecar",
    ]);
  });

  it("removes repos that disappear from config", () => {
    const twoRepos = `
providers: { ai: ollama }
projects:
  - name: Alpha
    slug: alpha
    scan: { frequency: weekly, time: "09:00" }
    repos:
      - path: /tmp/a1
      - path: /tmp/a2
`;
    reconcile(db, cfg(twoRepos));
    const summary = reconcile(db, cfg(BASE_YAML));
    // BASE_YAML has /tmp/alpha, prior had /tmp/a1 + /tmp/a2 →
    // +1 added (/tmp/alpha), -2 removed (/tmp/a1, /tmp/a2).
    expect(summary.reposAdded).toBe(1);
    expect(summary.reposRemoved).toBe(2);

    const project = listProjects(db)[0]!;
    const repos = listReposForProject(db, project.id);
    expect(repos.map((r) => r.path)).toEqual(["/tmp/alpha"]);
  });
});
