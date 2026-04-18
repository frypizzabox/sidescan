# Sidescan Roadmap

> A self-hostable competitive-intelligence server for solo devs. Point it at your own repos; it watches HN, Product Hunt, GitHub, and the web for nearby work.

**Current status:** Phase 1 complete — scaffold, CLI skeleton, DB migrations, Hono health endpoint, placeholder web UI.

## Phases

- [x] **Phase 1 — Scaffolding** — Node + npm workspaces, CLI (`init`, `start`, `version`), SQLite schema + migration runner, Hono server with `/healthz`, React + Vite + Tailwind web placeholder.
- [ ] **Phase 2 — Config ↔ DB reconciliation** — on start/reload, sync projects + repos from YAML into the DB. Project switcher in the web sidebar reads from DB.
- [ ] **Phase 3 — Repo analyzer + AI layer + repo activity** — file-summary analysis of each repo, AI-generated project inference + search queries, commits/releases/issues pulled into a timeline.
- [ ] **Phase 4 — External sources** — GitHub similar-repo search, HN, Product Hunt, web search via Brave or Serper. All findings dedupe by `(source, url)`.
- [ ] **Phase 5 — Scanner orchestration + cumulative diff** — bootstrap vs incremental scans, `sidescan reset <project>`, in-process scheduler (`node-cron`), AI ranker, "what's new" summaries.
- [ ] **Phase 6 — Dashboard UI** — project list → project detail with **News | Insights | Github** tabs (Insights deferred to V2), timeline view merging repo activity + findings, ⌘K command palette, dismiss-finding.
- [ ] **Phase 7 — Distribution** — npm publish, Dockerfile + `docker-compose.yml`, README with install/screenshots, optional compiled binaries.
- [ ] **Phase 8 — Launch** — Show HN draft, r/selfhosted, Microlaunch, Peerlist listings, 90-second screencast.

## Stack

Node ≥ 20 + TypeScript + Hono + `better-sqlite3` + React 19 + Vite + Tailwind v4 + TanStack React Query + Zustand + cmdk. AI providers: Claude / OpenAI / Ollama (BYO key). Search providers: Brave / Serper (BYO key, optional).

## Principles

- **Config-first.** `~/.sidescan/config.yaml` is the source of truth. CLI is operational; web UI is view-only in V1.
- **Self-host complete.** Every V1 feature works in self-host without caps.
- **Cumulative scans.** Findings accumulate with `first_seen`/`last_seen` timestamps. "What's new since last scan" is the retention hook.
- **BYO keys.** All API keys (AI, search, GitHub) come from env vars — never in config files.
- **Zero telemetry.** The binary never phones home.

## License

MIT.
