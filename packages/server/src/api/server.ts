import { Hono } from "hono";
import { buildApiRoutes, type ApiDeps } from "@/api/routes.js";

export type CreateServerDeps = ApiDeps;

/**
 * Builds the Hono app. Mounts `/api/*` for programmatic routes and keeps
 * a simple landing page at `/`.
 * Later phases attach the static web bundle under `/`.
 */
export function createServer(deps: CreateServerDeps): Hono {
  const app = new Hono();

  app.route("/api", buildApiRoutes(deps));

  // Back-compat: /healthz stays at root so it works without the /api prefix.
  app.get("/healthz", (c) =>
    c.json({ status: "ok", version: deps.version }),
  );

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
  <p>Phase 2 — API is live. Dashboard served from dev Vite (<code>http://localhost:5173</code>) or from a build served here later.</p>
  <p class="note">Endpoints:</p>
  <ul>
    <li><code>GET /healthz</code> — liveness</li>
    <li><code>GET /api/projects</code> — list projects</li>
    <li><code>GET /api/projects/:slug</code> — project detail</li>
    <li><code>POST /api/reload</code> — re-read config.yaml</li>
  </ul>
</body>
</html>`),
  );

  return app;
}
