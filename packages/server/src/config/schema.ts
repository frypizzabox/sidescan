import { z } from "zod";

export const ScanConfigSchema = z.object({
  frequency: z.enum(["daily", "weekly", "hourly", "manual"]),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "scan.time must be HH:MM")
    .optional(),
});

export const RepoConfigSchema = z.object({
  /**
   * Either a GitHub URL (https://github.com/owner/repo or git@github.com:owner/repo.git)
   * or a local filesystem path (absolute or ~-expanded). Auto-detected at runtime.
   */
  path: z.string().min(1, "repo.path is required"),
  /** For GitHub URLs, an optional non-default branch to scan. Ignored for local paths. */
  branch: z.string().optional(),
});

export const ProjectConfigSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase alphanumeric + hyphens"),
  description: z.string().optional(),
  bootstrap_lookback_years: z.number().int().min(1).max(10).default(2),
  scan: ScanConfigSchema,
  repos: z.array(RepoConfigSchema).min(1, "each project needs at least one repo"),
});

export const ProvidersConfigSchema = z.object({
  ai: z.enum(["claude", "openai", "ollama"]),
  ai_model: z.string().optional(),
  search: z.enum(["brave", "serper"]).nullable().default(null),
});

export const GithubSourceSchema = z
  .object({
    token_env: z.string().default("GITHUB_TOKEN"),
  })
  .default({});

export const SourcesConfigSchema = z
  .object({
    github: GithubSourceSchema,
  })
  .default({});

export const ServerConfigSchema = z
  .object({
    port: z.number().int().min(1).max(65535).default(3000),
    host: z.string().default("localhost"),
  })
  .default({});

export const ConfigSchema = z
  .object({
    server: ServerConfigSchema,
    providers: ProvidersConfigSchema,
    sources: SourcesConfigSchema,
    projects: z.array(ProjectConfigSchema).min(1, "define at least one project"),
  })
  .refine(
    (c) => new Set(c.projects.map((p) => p.slug)).size === c.projects.length,
    { message: "project slugs must be unique" },
  );

export type Config = z.infer<typeof ConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type RepoConfig = z.infer<typeof RepoConfigSchema>;
export type ProvidersConfig = z.infer<typeof ProvidersConfigSchema>;
