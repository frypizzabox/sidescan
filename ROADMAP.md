# Sidescan Roadmap

> A self-hostable competitive-intelligence server for solo devs. Point it at your GitHub repos (or local clones); it watches HN, GitHub, and the web for nearby work.

**Distribution model:** self-hosted service. Primary install paths: Docker Compose (clone + `docker compose up`), run from source for tinkering, and a compiled single-file binary in Phase 7. An install is one directory holding `config.yaml`, `.env`, and `data/` (SQLite DB). Not a global npm CLI.

**Current status:** V1 complete — phases 1-7 shipped. `sidescan scan <project>` runs end-to-end: repo file-summary → Claude inference → fan-out to HN/GitHub/(optional Brave|Serper) → AI ranker with auto-dismiss → what's-new digest. Web dashboard: project list, timeline, ⌘K palette, dismiss, across-projects feed, scan detail. Packaged as a Docker image that serves API + web on one port.

## Phases

- [x] **Phase 1 — Scaffolding** — Node + npm workspaces, CLI (`init`, `start`, `version`), SQLite schema + migration runner, Hono server with `/healthz`, React + Vite + Tailwind web placeholder.
- [x] **Phase 2 — Config ↔ DB reconciliation** — projects + repos sync from YAML into DB on start/reload; API routes for projects; `sidescan status` + `sidescan reload` CLI commands; web sidebar switcher + project detail shell with News/Insights/Github tabs.
- [x] **Phase 3 — Repo analyzer + AI layer + repo activity** — `sidescan scan` runs end-to-end against Claude Sonnet 4.6, extracts repo inference via file-summary prompt, captures commits via `git log`. Web project page shows the inference card.
- [x] **Phase 4 — External sources** — HN (Algolia), GitHub repo search, Brave, Serper. Findings dedupe by `(source, url)`; first_seen/last_seen tracked per scan. Web News + Github tabs render real results.
- [x] **Phase 5 — Scanner orchestration + cumulative diff** — AI ranker with auto-dismiss below 0.2, what's-new digest per scan, `sidescan reset <project>`, in-process `node-cron` scheduler wired from `sidescan start`, incremental `since` cutoffs.
- [x] **Phase 6 — Dashboard UI** — Project list with new-count badges, News tab as timeline (findings + commits interleaved), what's-new hero card, across-projects feed, scan detail page, ⌘K command palette, dismiss action.
- [x] **Phase 7 — Distribution** — multi-stage Dockerfile, docker-compose.yml mounting config + data, static web served from the API server, README rewritten around Docker quickstart.
- [ ] **Phase 8 — Launch** (optional) — Show HN draft, r/selfhosted, Microlaunch, Peerlist, screencast.

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
