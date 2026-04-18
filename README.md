# Sidescan

> Self-hostable competitive-intel server for solo devs. Point it at your GitHub repos (or local clones); it watches HN, GitHub, and the web for nearby work.

**Status:** V1 complete — scan, infer, surface findings, rank, dashboard.

## What you get

- A local service + SQLite DB + web dashboard
- You configure projects (repos to monitor) in a single YAML file
- On a schedule, each project's repo is analyzed, an LLM infers what it is, and search queries fan out to HN / GitHub / Brave or Serper for nearby work
- Findings accumulate across scans with dedup + relevance ranking
- "What's new since last scan" digest, dismiss, timeline view, ⌘K palette

## Install shape

One directory is your install. It holds:

```
my-sidescan/
├── config.yaml       # projects to watch (your edits)
├── .env              # API keys (gitignored)
└── data/
    └── sidescan.db   # SQLite (gitignored)
```

Two ways to run it: Docker (recommended) or from source.

## Quickstart: Docker

Prereqs: Docker + Docker Compose.

```bash
git clone <this-repo> my-sidescan
cd my-sidescan

# 1. Seed config + env
cp packages/server/src/config/example.yaml config.yaml
cat > .env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...   # your Claude key
# BRAVE_API_KEY=...            # optional, enables web search
# GITHUB_TOKEN=...              # optional, raises GitHub rate limits
EOF

# 2. Edit config.yaml — add your projects (paths live under /repos/ in the container)
$EDITOR config.yaml

# 3. Boot
docker compose up -d

# 4. Open the dashboard
open http://localhost:3000
```

The compose file mounts `~/Projects` on your host to `/repos` in the container so local-clone paths work; if you use only GitHub URLs, the mount isn't needed. Edit `docker-compose.yml` for your setup.

### Running commands inside the container

```bash
# Trigger a scan immediately
docker compose exec sidescan node packages/server/bin/sidescan scan <project-slug>

# See project status
docker compose exec sidescan node packages/server/bin/sidescan status

# Reset a project's findings
docker compose exec sidescan node packages/server/bin/sidescan reset <project-slug> -y
```

## Quickstart: from source (dev / tinkering)

Prereqs: Node ≥ 20.

```bash
git clone <this-repo> my-sidescan
cd my-sidescan
npm install
npm run build

# Initialize config.yaml + .env + data/ in this directory
node packages/server/bin/sidescan init

# Fill in config.yaml and .env
$EDITOR config.yaml
$EDITOR .env        # put ANTHROPIC_API_KEY here

# Start the server (foreground, API on :3000)
node packages/server/bin/sidescan start

# In a second terminal, the Vite dev server (UI on :5173, proxies /api):
npm run dev:web
```

The Vite dev server has the nicer experience (HMR). Once built, the server at :3000 also serves the dashboard from `packages/web/dist/`.

## CLI commands

```
sidescan init                         # create config.yaml + .env + data/ in CWD
sidescan start [--watch-config]       # boot server + scheduler (foreground)
sidescan status                       # running state + project summary
sidescan reload                       # re-read config.yaml on a running server
sidescan scan [project-slug]          # scan one or all auto-scan projects
sidescan reset <project-slug> [-y]    # hard-delete scan history for a project
sidescan version
```

## Config

See `packages/server/src/config/example.yaml` for the full shape. Highlights:

```yaml
providers:
  ai: claude            # claude | openai | ollama
  search: brave         # brave | serper | null

projects:
  - name: My Project
    slug: my-project
    bootstrap_lookback_years: 2
    scan:
      frequency: weekly   # daily | weekly | hourly | manual
      time: "09:00"
    repos:
      - path: https://github.com/owner/repo
        # branch: develop   # optional; defaults to the repo's default branch

      # Or point at a local clone:
      # - path: /Users/you/Projects/web/my-project
```

`path` accepts either a GitHub URL (`https://github.com/owner/repo` or `git@github.com:owner/repo.git`) or an absolute filesystem path. GitHub URLs are fetched via the GitHub API — set `GITHUB_TOKEN` in `.env` or rate limits will bite you fast.

## Env keys (in `.env`)

```
ANTHROPIC_API_KEY=sk-ant-...     # required if providers.ai = claude
OPENAI_API_KEY=sk-...            # required if providers.ai = openai
# (nothing for ollama; set OLLAMA_HOST if non-default)

BRAVE_API_KEY=...                # if providers.search = brave
SERPER_API_KEY=...               # if providers.search = serper

GITHUB_TOKEN=ghp_...             # optional for search sources; effectively required
                                 # if any repo is a GitHub URL (unauth = 60 req/hr)
```

Keys never live in `config.yaml`. `config.yaml` is safe to commit to a dotfiles repo; `.env` stays on the host.

## Costs (rough)

Each scan makes 2-3 AI calls (repo inference, rank findings, what's-new summary) plus external source requests.

- Claude Sonnet 4.6: ~$0.01 - $0.03 per scan
- HN / GitHub (unauth): free
- Brave free tier: 1 req/sec, 2k/month
- Serper: pay-per-search

A daily scan across ~5 projects is roughly $2-5/month in AI costs.

## License

MIT.
