import { logger } from "@/lib/logger.js";
import type { RepoContext } from "@/scanner/repo-analyzer.js";
import type { RepoSpec } from "@/scanner/repo-spec.js";

const GH_API = "https://api.github.com";

const MANIFEST_CANDIDATES: { filename: string; language: string }[] = [
  { filename: "package.json", language: "javascript/typescript" },
  { filename: "pyproject.toml", language: "python" },
  { filename: "requirements.txt", language: "python" },
  { filename: "Cargo.toml", language: "rust" },
  { filename: "go.mod", language: "go" },
  { filename: "Gemfile", language: "ruby" },
  { filename: "pom.xml", language: "java" },
  { filename: "build.gradle", language: "java/kotlin" },
  { filename: "build.gradle.kts", language: "kotlin" },
  { filename: "mix.exs", language: "elixir" },
  { filename: "Package.swift", language: "swift" },
  { filename: "composer.json", language: "php" },
  { filename: "deno.json", language: "typescript (deno)" },
  { filename: "project.godot", language: "gdscript (godot)" },
];

const ENTRYPOINT_CANDIDATES = [
  "src/index.ts",
  "src/index.js",
  "src/main.ts",
  "src/main.js",
  "src/App.tsx",
  "src/app.tsx",
  "src/lib.rs",
  "src/main.rs",
  "main.go",
  "cmd/main.go",
  "main.py",
  "app.py",
  "lib/index.js",
  "server.js",
  "server.ts",
  "index.js",
  "index.ts",
];

const MAX_README_BYTES = 8 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024;
const MAX_KEY_FILE_BYTES = 3 * 1024;
const MAX_KEY_FILES = 8;

interface RepoInfo {
  default_branch: string;
  language: string | null;
}

interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
}

interface TreeResponse {
  sha: string;
  tree: TreeEntry[];
  truncated: boolean;
}

/**
 * Runs the file-summary analysis against a GitHub-hosted repo via the REST API.
 * Returns the same `RepoContext` shape the local analyzer returns so downstream
 * code (query-builder, orchestrator) doesn't branch on source type.
 */
export async function analyzeGitHubRepo(
  spec: Extract<RepoSpec, { type: "github" }>,
  token: string | null,
): Promise<RepoContext> {
  const headers = buildHeaders(token);
  const { owner, repo } = spec;

  // 1. Basic info — lets us pick the default branch if none was configured.
  const info = await githubJson<RepoInfo>(
    `${GH_API}/repos/${owner}/${repo}`,
    headers,
  );
  const branch = spec.branch ?? info.default_branch;

  // 2. README (any format, decoded by the API for us via `Accept: raw`).
  const readme = await fetchReadme(owner, repo, branch, headers);

  // 3. Manifest (probes common filenames, first hit wins).
  const manifest = await fetchFirstManifest(owner, repo, branch, headers);

  // 4. File tree (recursive; we keep top 2 levels worth of paths).
  const fileTree = await fetchTree(owner, repo, branch, headers);

  // 5. Key files: entrypoints that exist in the tree, capped at MAX_KEY_FILES.
  const keyFiles = await fetchKeyFiles(
    owner,
    repo,
    branch,
    headers,
    fileTree,
    manifest?.filename,
  );

  const detectedLanguage = manifest
    ? (MANIFEST_CANDIDATES.find((m) => m.filename === manifest.filename)
        ?.language ?? info.language ?? null)
    : info.language ?? null;

  const totalBytes =
    (readme?.length ?? 0) +
    (manifest?.content.length ?? 0) +
    keyFiles.reduce((acc, f) => acc + f.content.length, 0);

  return {
    path: spec.url,
    detectedLanguage,
    readme,
    manifest,
    fileTree,
    keyFiles,
    totalBytes,
  };
}

function buildHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sidescan/0.1",
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function githubJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} at ${url}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchReadme(
  owner: string,
  repo: string,
  branch: string,
  headers: Record<string, string>,
): Promise<string | null> {
  // Raw content saves a base64 decode.
  const url = `${GH_API}/repos/${owner}/${repo}/readme?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: { ...headers, Accept: "application/vnd.github.raw+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    logger.warn({ url, status: res.status }, "README fetch failed");
    return null;
  }
  const text = await res.text();
  return truncate(text, MAX_README_BYTES);
}

interface ContentsFileResponse {
  type: "file";
  content: string;
  encoding: "base64" | "none";
  size: number;
}

async function fetchRawFile(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    logger.warn({ url, status: res.status }, "GitHub file fetch failed");
    return null;
  }
  const body = (await res.json()) as ContentsFileResponse;
  if (body.type !== "file" || body.encoding !== "base64") return null;
  return Buffer.from(body.content, "base64").toString("utf8");
}

async function fetchFirstManifest(
  owner: string,
  repo: string,
  branch: string,
  headers: Record<string, string>,
): Promise<{ filename: string; content: string } | null> {
  for (const { filename } of MANIFEST_CANDIDATES) {
    const raw = await fetchRawFile(owner, repo, filename, branch, headers);
    if (raw !== null) {
      return { filename, content: truncate(raw, MAX_MANIFEST_BYTES) };
    }
  }
  return null;
}

/**
 * Recursive tree; filter to paths that are at most 2 directories deep.
 * Dir entries are suffixed with "/" to match the local analyzer's output.
 */
async function fetchTree(
  owner: string,
  repo: string,
  branch: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const url = `${GH_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    logger.warn({ url, status: res.status }, "GitHub tree fetch failed");
    return [];
  }
  const body = (await res.json()) as TreeResponse;
  const out: string[] = [];
  for (const entry of body.tree) {
    if (entry.path.startsWith(".")) continue;
    const depth = entry.path.split("/").length;
    if (depth > 3) continue; // keep top-2 levels
    if (entry.type === "tree") {
      out.push(`${entry.path}/`);
    } else if (entry.type === "blob") {
      out.push(entry.path);
    }
  }
  out.sort();
  return out;
}

async function fetchKeyFiles(
  owner: string,
  repo: string,
  branch: string,
  headers: Record<string, string>,
  fileTree: string[],
  manifestFilename?: string,
): Promise<{ path: string; content: string }[]> {
  const picked = new Set<string>();

  for (const candidate of ENTRYPOINT_CANDIDATES) {
    if (fileTree.includes(candidate)) picked.add(candidate);
    if (picked.size >= MAX_KEY_FILES) break;
  }

  const topLevelInteresting = fileTree
    .filter((f) => !f.includes("/"))
    .filter((f) => /\.(ts|tsx|js|jsx|py|rs|go|gd|rb)$/.test(f))
    .filter((f) => f !== manifestFilename);
  for (const f of topLevelInteresting) {
    if (picked.size >= MAX_KEY_FILES) break;
    picked.add(f);
  }

  const results: { path: string; content: string }[] = [];
  for (const relPath of picked) {
    const content = await fetchRawFile(owner, repo, relPath, branch, headers);
    if (content !== null) {
      results.push({ path: relPath, content: truncate(content, MAX_KEY_FILE_BYTES) });
    }
  }
  return results;
}

function truncate(text: string, maxBytes: number): string {
  if (text.length <= maxBytes) return text;
  return text.slice(0, maxBytes) + "\n\n[...truncated]";
}
