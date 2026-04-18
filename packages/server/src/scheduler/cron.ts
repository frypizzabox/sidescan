import cron, { type ScheduledTask } from "node-cron";
import { logger } from "@/lib/logger.js";
import type { Db } from "@/db/connection.js";
import type { Config, ProjectConfig } from "@/config/schema.js";
import type { AIProvider } from "@/ai/provider.js";
import { scanProject } from "@/scanner/orchestrator.js";

export interface SchedulerHandle {
  /** Replaces all active schedules with the ones from `config`. */
  reload(newConfig: Config): void;
  stop(): void;
  /** How many projects currently have a job scheduled. */
  activeCount(): number;
}

export function startScheduler(opts: {
  db: Db;
  config: Config;
  provider: AIProvider;
}): SchedulerHandle {
  const jobs = new Map<string, ScheduledTask>();

  const install = (cfg: Config) => {
    // Stop all existing jobs
    for (const [, task] of jobs) task.stop();
    jobs.clear();

    for (const project of cfg.projects) {
      const expr = cronExpression(project);
      if (!expr) continue; // manual or unknown

      const task = cron.schedule(
        expr,
        async () => {
          logger.info(
            { project: project.slug },
            "Scheduled scan starting",
          );
          try {
            const result = await scanProject({
              db: opts.db,
              config: cfg,
              provider: opts.provider,
              projectSlug: project.slug,
            });
            logger.info(
              {
                project: project.slug,
                scanId: result.scanId,
                status: result.status,
                cost: result.costEstimateUSD,
              },
              "Scheduled scan finished",
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(
              { project: project.slug, err: msg },
              "Scheduled scan failed",
            );
          }
        },
        { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      );
      jobs.set(project.slug, task);
    }
  };

  install(opts.config);

  return {
    reload: install,
    stop: () => {
      for (const [, task] of jobs) task.stop();
      jobs.clear();
    },
    activeCount: () => jobs.size,
  };
}

/**
 * Converts a project's scan config into a cron expression.
 * Returns null for `manual` (no job scheduled).
 */
export function cronExpression(project: ProjectConfig): string | null {
  const { frequency, time } = project.scan;
  if (frequency === "manual") return null;
  if (frequency === "hourly") return "0 * * * *";
  const [hh, mm] = parseHHMM(time ?? "09:00");
  if (frequency === "daily") return `${mm} ${hh} * * *`;
  if (frequency === "weekly") return `${mm} ${hh} * * 1`; // Mondays
  return null;
}

function parseHHMM(hhmm: string): [number, number] {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return [9, 0];
  return [Number(m[1]), Number(m[2])];
}
