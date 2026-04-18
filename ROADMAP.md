# Sidescan Roadmap

> A self-hostable competitive-intelligence server for solo devs. Point it at your own repos; it watches HN, Product Hunt, GitHub, and the web for nearby work.

**Distribution model:** self-hosted service. Primary install paths: Docker Compose (clone + `docker compose up`), run from source for tinkering, and a compiled single-file binary in Phase 7. An install is one directory holding `config.yaml`, `.env`, and `data/` (SQLite DB). Not a global npm CLI.

**Current status:** Phase 4 complete — external sources wired. A scan now surfaces real findings: HN stories + comments, GitHub similar repos, and (with a key) web search via Brave or Serper. Findings dedupe by `(source, url)` and persist across scans.

## Phases

- [x] **Phase 1 — Scaffolding** — Node + npm workspaces, CLI (`init`, `start`, `version`), SQLite schema + migration runner, Hono server with `/healthz`, React + Vite + Tailwind web placeholder.
- [x] **Phase 2 — Config ↔ DB reconciliation** — projects + repos sync from YAML into DB on start/reload; API routes for projects; `sidescan status` + `sidescan reload` CLI commands; web sidebar switcher + project detail shell with News/Insights/Github tabs.
- [x] **Phase 3 — Repo analyzer + AI layer + repo activity** — `sidescan scan` runs end-to-end against Claude Sonnet 4.6, extracts repo inference via file-summary prompt, captures commits via `git log`. Web project page shows the inference card.
- [x] **Phase 4 — External sources** — HN (Algolia), GitHub repo search, Brave, Serper. Findings dedupe by `(source, url)`; first_seen/last_seen tracked per scan. Web News + Github tabs render real results.
- [ ] **Phase 5 — Scanner orchestration + cumulative diff** — bootstrap vs incremental scans, `sidescan reset <project>`, in-process scheduler (`node-cron`), AI ranker, "what's new" summaries.
- [ ] **Phase 6 — Dashboard UI** — project list → project detail with **News | Insights | Github** tabs (Insights deferred to V2), timeline view merging repo activity + findings, ⌘K command palette, dismiss-finding.
- [ ] **Phase 7 — Distribution** — npm publish, Dockerfile + `docker-compose.yml`, README with install/screenshots, optional compiled binaries.
- [ ] **Phase 8 — Launch** — Show HN draft, r/selfhosted, Microlaunch, Peerlist listings, 90-second screencast.

## Stack

Node ≥ 20 + TypeScript + Hono + `better-sqlite3` + React 19 + Vite + Tailwind v4 + TanStack React Query + Zustand + cmdk. AI providers: Claude / OpenAI / Ollama (BYO key). Search providers: Brave / Serper (BYO key, optional).

## Principles

- **Config-first.** `config.yaml` in your install directory is the source of truth. CLI is operational; web UI is view-only in V1.
- **Self-host complete.** Every V1 feature works in self-host without caps.
- **Cumulative scans.** Findings accumulate with `first_seen`/`last_seen` timestamps. "What's new since last scan" is the retention hook.
- **BYO keys.** All API keys (AI, search, GitHub) come from env vars — never in config files.
- **Zero telemetry.** The binary never phones home.

## License

MIT.
