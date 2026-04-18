import { join, resolve } from "node:path";

/**
 * Sidescan is a self-hosted service. Install = a directory containing
 * `config.yaml`, `.env`, and a `data/` folder for the SQLite DB.
 * Works for all three distribution paths: `git clone`, Docker compose,
 * compiled binary.
 *
 * - `config.yaml` and `.env` live at the project root (`process.cwd()`).
 * - `data/` also lives there by default. It's the SQLite home.
 * - `SIDESCAN_DATA_DIR` can override just the data/ location, which is
 *   what Docker typically needs (read-only mounted config at /app,
 *   writable volume at /data).
 */

function projectDir(): string {
  return process.cwd();
}

export function dataDir(): string {
  const override = process.env.SIDESCAN_DATA_DIR;
  if (override && override.length > 0) return resolve(override);
  return join(projectDir(), "data");
}

export function configPath(): string {
  return join(projectDir(), "config.yaml");
}

export function envFilePath(): string {
  return join(projectDir(), ".env");
}

export function dbPath(): string {
  return join(dataDir(), "sidescan.db");
}

export function pidPath(): string {
  return join(dataDir(), "sidescan.pid");
}

/**
 * Expands a leading `~` to the user's home directory in a path string.
 * Used only for project-config repo paths (e.g., `~/Projects/foo`),
 * never for sidescan's own install location.
 */
export function expandTilde(p: string): string {
  const home = process.env.HOME;
  if (!home) return p;
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}
