# Sidescan

> Self-hostable competitive-intel server for solo devs. Point it at your own repos; it watches HN, Product Hunt, GitHub, and the web for nearby work.

**Status:** Phase 2 complete — config ↔ DB reconciliation, API routes, web shell. See `ROADMAP.md` for the full plan.

## What you get

- A local service + SQLite DB + web dashboard
- You configure projects (repos to monitor) in a YAML file
- On a schedule, it scans each repo, uses an LLM to infer what the project is, and queries HN / Product Hunt / GitHub / the web for nearby work
- Findings accumulate; "what's new since last scan" is the retention hook

## Install shape (the mental model)

One directory is your install. It holds:

```
my-sidescan/
├── config.yaml       # projects to watch (your edits)
├── .env              # API keys (gitignored)
├── data/
│   └── sidescan.db   # SQLite (gitignored)
├── docker-compose.yml   (optional — Docker install)
└── ... sidescan source or npm'd deps
```

Distribution paths:
1. **Run from source (current)** — clone this repo, `npm install`, initialize in-tree.
2. **Docker Compose (Phase 7)** — clone + `docker compose up`, data in a volume.
3. **Compiled binary (Phase 7)** — drop a binary in your PATH, `sidescan init` sets up the dir for you.

Not a global npm CLI. Sidescan is a service, not a scaffolder.

## Run from source (dev / tinkering)

Prerequisites: Node ≥ 20.

```bash
git clone <this-repo> my-sidescan
cd my-sidescan
npm install
npm run build

# Initialize config.yaml + .env + data/ in this directory
node packages/server/bin/sidescan init

# Edit config.yaml to point at your real projects
# Put your AI key in .env:
#   ANTHROPIC_API_KEY=sk-ant-...

# Start the server (foreground)
node packages/server/bin/sidescan start

# In another terminal, for the dashboard dev server:
npm run dev:web
```

Server: `http://localhost:3000` (API + placeholder root page)
Web dashboard: `http://localhost:5173` (Vite dev server, proxies `/api` to the server)

## CLI commands

```
sidescan init                     # create config.yaml + .env + data/ in CWD
sidescan start                    # boot the server (foreground)
sidescan start --watch-config     # also watch config.yaml for live reloads
sidescan status                   # running state + project summary
sidescan reload                   # re-read config.yaml on a running server
sidescan version
```

## Config

See `packages/server/src/config/example.yaml` for the full shape. `sidescan init` copies it into your CWD.

Keys go in `.env` (never in `config.yaml`):

```
ANTHROPIC_API_KEY=sk-ant-...          # if providers.ai = claude
OPENAI_API_KEY=sk-...                 # if providers.ai = openai
# (nothing needed for ollama)

BRAVE_API_KEY=...                     # if providers.search = brave
SERPER_API_KEY=...                    # if providers.search = serper

GITHUB_TOKEN=ghp_...                  # optional, raises GitHub API rate limits
OLLAMA_HOST=http://localhost:11434    # optional, ollama default
```

## License

MIT.
