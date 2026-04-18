import { Hono } from "hono";

export interface CreateServerDeps {
  version: string;
}

/**
 * Builds the Hono app. Phase 1: /healthz and a placeholder root page.
 * Later phases attach DB-backed routes and the static web bundle.
 */
export function createServer(deps: CreateServerDeps): Hono {
  const app = new Hono();

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
  </style>
</head>
<body>
  <h1>Sidescan</h1>
  <p>Phase 1 scaffold is running.</p>
  <p class="note">
    Health check: <code>GET /healthz</code><br>
    Version: <code>${deps.version}</code>
  </p>
</body>
</html>`),
  );

  return app;
}
