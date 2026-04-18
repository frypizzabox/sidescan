import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Resolves ~/.sidescan/ and everything inside it.
 * Honors SIDESCAN_DATA_DIR for overriding (e.g., in Docker).
 */
export function dataDir(): string {
  const override = process.env.SIDESCAN_DATA_DIR;
  if (override && override.length > 0) return resolve(override);
  return join(homedir(), ".sidescan");
}

export function configPath(): string {
  return join(dataDir(), "config.yaml");
}

export function dbPath(): string {
  return join(dataDir(), "sidescan.db");
}

export function envFilePath(): string {
  return join(dataDir(), ".env");
}

export function pidPath(): string {
  return join(dataDir(), "sidescan.pid");
}

/**
 * Expands a leading `~` to the user's home directory in a path string.
 * Leaves other paths untouched.
 */
export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}
