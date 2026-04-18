import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "@/db/connection.js";
import { migrate } from "@/db/migrate.js";
import { reconcile } from "@/config/reconcile.js";
import { parseConfig } from "@/config/parse.js";
import { createServer } from "@/api/server.js";

const YAML = `
providers: { ai: ollama }
projects:
  - name: Alpha
    slug: alpha
    description: First project
    scan: { frequency: weekly, time: "09:00" }
    repos:
      - path: /tmp/alpha
      - path: /tmp/alpha-sidecar
  - name: Beta
    slug: beta
    scan: { frequency: manual }
    repos:
      - path: /tmp/beta
`;

interface ProjectDto {
  slug: string;
  name: string;
  description: string | null;
  scan: { frequency: string; time: string | null };
}

describe("API routes", () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sidescan-api-"));
    db = openDb(join(dir, "test.db"));
    migrate(db);
    reconcile(db, parseConfig(YAML));
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/projects returns all non-hidden projects", async () => {
    const app = createServer({ db, version: "0.1.0" });
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: ProjectDto[] };
    expect(body.projects.map((p) => p.slug).sort()).toEqual(["alpha", "beta"]);
  });

  it("GET /api/projects/:slug returns the project and its repos", async () => {
    const app = createServer({ db, version: "0.1.0" });
    const res = await app.request("/api/projects/alpha");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: ProjectDto;
      repos: { path: string }[];
    };
    expect(body.project.slug).toBe("alpha");
    expect(body.project.description).toBe("First project");
    expect(body.repos.map((r) => r.path).sort()).toEqual([
      "/tmp/alpha",
      "/tmp/alpha-sidecar",
    ]);
  });

  it("GET /api/projects/:slug returns 404 for unknown slugs", async () => {
    const app = createServer({ db, version: "0.1.0" });
    const res = await app.request("/api/projects/nonexistent");
    expect(res.status).toBe(404);
  });

  it("GET /healthz reports version", async () => {
    const app = createServer({ db, version: "0.1.0" });
    const res = await app.request("/healthz");
    const body = (await res.json()) as { status: string; version: string };
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
  });

  it("POST /api/reload calls onReload handler", async () => {
    let called = false;
    const app = createServer({
      db,
      version: "0.1.0",
      onReload: () => {
        called = true;
        return { ok: true, summary: "2 updated" };
      },
    });
    const res = await app.request("/api/reload", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; summary: string };
    expect(body.ok).toBe(true);
    expect(body.summary).toBe("2 updated");
    expect(called).toBe(true);
  });

  it("POST /api/reload returns 503 when no handler is configured", async () => {
    const app = createServer({ db, version: "0.1.0" });
    const res = await app.request("/api/reload", { method: "POST" });
    expect(res.status).toBe(503);
  });
});
