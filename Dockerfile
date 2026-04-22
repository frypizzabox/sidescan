# syntax=docker/dockerfile:1.7

# ---- Stage 1: build --------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /build

# System deps for better-sqlite3 native compile
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Install deps at workspace level
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json    packages/web/package.json
RUN npm ci

# Copy sources
COPY tsconfig.base.json ./
COPY packages ./packages

# Build web + server
RUN npm run build

# ---- Stage 2: runtime ------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app

# Minimal system deps (none strictly needed at runtime for better-sqlite3
# since the prebuilt node-gyp output ships in node_modules, but we keep
# a tiny stack for native fallbacks).

# Copy workspace manifests + lockfile and install only production deps
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json    packages/web/package.json
RUN npm ci --omit=dev --workspace=packages/server

# Server build artifacts + non-bundled files shipped via "files"
COPY --from=builder /build/packages/server/dist                    packages/server/dist
COPY --from=builder /build/packages/server/bin                     packages/server/bin
COPY --from=builder /build/packages/server/src/config/example.yaml packages/server/src/config/example.yaml
COPY --from=builder /build/packages/server/src/db/migrations       packages/server/src/db/migrations

# Web bundle (served by the server in production)
COPY --from=builder /build/packages/web/dist packages/web/dist

# Put `sidescan` on the container's PATH so `docker compose exec sidescan
# sidescan scan <slug>` works instead of the long `node packages/.../bin`.
RUN ln -s /app/packages/server/bin/sidescan /usr/local/bin/sidescan

# Install dir lives at /app; config + .env + data/ are mounted here.
# Data dir override lets compose mount a named volume elsewhere if desired.
ENV SIDESCAN_DATA_DIR=/app/data
VOLUME ["/app/data"]

EXPOSE 3000

# Default: foreground server, listens on all interfaces so the compose
# port mapping works. Override with `docker run sidescan <command>` to
# run `init`, `scan`, `reset`, etc.
CMD ["node", "packages/server/bin/sidescan", "start", "--host", "0.0.0.0"]
