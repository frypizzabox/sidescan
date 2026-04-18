/**
 * Typed error classes for Sidescan. Lets command handlers distinguish
 * user-facing config errors (exit 2) from runtime errors (exit 3).
 */

export class ConfigError extends Error {
  readonly code = "CONFIG_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class DbError extends Error {
  readonly code = "DB_ERROR";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DbError";
  }
}

export class RuntimeError extends Error {
  readonly code = "RUNTIME_ERROR";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RuntimeError";
  }
}

export function exitCodeFor(err: unknown): number {
  if (err instanceof ConfigError) return 2;
  if (err instanceof DbError || err instanceof RuntimeError) return 3;
  return 1;
}
