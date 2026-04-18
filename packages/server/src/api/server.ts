import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { buildApiRoutes, type ApiDeps } from "@/api/routes.js";

export type CreateServerDeps = ApiDeps;

/**
 * Builds the Hono app. Mounts:
 * - `/api/*` — programmatic routes (JSON)
 * - `/healthz` — liveness probe (for Docker / load balancers)
 * - Static web assets from packages/web/dist/ if present (Docker + prod),
 *   else a lightweight landing page (dev without a built web bundle).
 *
 * In dev you typically run Vite on :5173 (proxies /api → this server).
 * In prod/Docker the built web bundle is served from this server itself.
 */
export function createServer(deps: CreateServerDeps): Hono {
  const app = new Hono();

  app.route("/api", buildApiRoutes(deps));

  app.get("/healthz", (c) =>
    c.json({ status: "ok", version: deps.version }),
  );

  const webDist = resolveWebDist();
  if (webDist && existsSync(join(webDist, "index.html"))) {
    // Serve hashed assets (immutable)
    app.use("/assets/*", serveStatic({ root: webDist }));
    app.get("/favicon.svg", serveStatic({ root: webDist }));
    // SPA catch-all
    app.get("*", (c) => {
      const html = readFileSync(join(webDist, "index.html"), "utf8");
      return c.html(html);
    });
  } else {
    app.get("/", (c) =>
      c.html(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sidescan</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1rem; color: #222; }
    h1 { margin-bottom: 0.5rem; }
    code { background: #f3f3f3; padding: 0.15rem 0.35rem; border-radius: 3px; }
    .note { color: #666; font-size: 0.9rem; }
    ul { line-height: 1.8; }
  </style>
</head>
<body>
  <h1>Sidescan</h1>
  <p>API is live. No web bundle found at <code>packages/web/dist/</code> — run <code>npm run build</code> or use Vite dev server at <code>http://localhost:5173</code>.</p>
  <p class="note">Endpoints:</p>
  <ul>
    <li><code>GET /healthz</code> — liveness</li>
    <li><code>GET /api/projects</code> — list projects</li>
    <li><code>GET /api/projects/:slug</code> — project detail</li>
    <li><code>GET /api/across</code> — new findings across all projects</li>
    <li><code>POST /api/reload</code> — re-read config.yaml</li>
  </ul>
</body>
</html>`),
    );
  }

  return app;
}

/**
 * Walks up from this module to find `packages/web/dist/`. Works in both
 * dev (source tree) and Docker (copied artifacts). Returns null if not
 * found — the API still runs, just without a web UI served here.
 */
function resolveWebDist(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "packages", "web", "dist");
    if (existsSync(candidate)) return candidate;
    // In Docker the server bundle + web bundle sit as siblings:
    //   /app/packages/server/dist/api/server.js
    //   /app/packages/web/dist/
    // Walk up a level until we hit the repo root.
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
