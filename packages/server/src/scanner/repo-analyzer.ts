import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export interface RepoContext {
  path: string;
  detectedLanguage: string | null;
  readme: string | null;
  manifest: { filename: string; content: string } | null;
  fileTree: string[];
  keyFiles: { path: string; content: string }[];
  totalBytes: number;
}

/**
 * Manifest files that signal the project's primary language/ecosystem.
 * Order matters: earlier entries take precedence when multiple are present.
 */
const MANIFESTS: { filename: string; language: string }[] = [
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

const README_CANDIDATES = [
  "README.md",
  "Readme.md",
  "readme.md",
  "README",
  "README.MD",
  "README.rst",
  "README.txt",
];

/**
 * Directories to exclude from traversal.
 */
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "tmp",
  ".godot",
]);

const MAX_README_BYTES = 8 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024;
const MAX_KEY_FILE_BYTES = 3 * 1024;
const MAX_KEY_FILES = 8;

/**
 * Reads a repo and produces a compact text context for the AI prompt.
 * No network, no git — pure filesystem.
 */
export function analyzeRepo(repoPath: string): RepoContext {
  if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) {
    throw new Error(`Not a directory: ${repoPath}`);
  }

  const readme = readReadme(repoPath);
  const manifest = readManifest(repoPath);
  const detectedLanguage = manifest
    ? (MANIFESTS.find((m) => m.filename === manifest.filename)?.language ??
      null)
    : null;
  const fileTree = listTree(repoPath, 2);
  const keyFiles = pickKeyFiles(repoPath, fileTree, manifest?.filename);

  const totalBytes =
    (readme?.length ?? 0) +
    (manifest?.content.length ?? 0) +
    keyFiles.reduce((acc, f) => acc + f.content.length, 0);

  return {
    path: repoPath,
    detectedLanguage,
    readme,
    manifest,
    fileTree,
    keyFiles,
    totalBytes,
  };
}

function readReadme(repoPath: string): string | null {
  for (const name of README_CANDIDATES) {
    const p = join(repoPath, name);
    if (existsSync(p) && statSync(p).isFile()) {
      return truncate(readFileSync(p, "utf8"), MAX_README_BYTES);
    }
  }
  return null;
}

function readManifest(
  repoPath: string,
): { filename: string; content: string } | null {
  for (const { filename } of MANIFESTS) {
    const p = join(repoPath, filename);
    if (existsSync(p) && statSync(p).isFile()) {
      return {
        filename,
        content: truncate(readFileSync(p, "utf8"), MAX_MANIFEST_BYTES),
      };
    }
  }
  return null;
}

/**
 * Walks the repo up to `maxDepth` levels deep, returning relative paths.
 * Skips hidden files / dirs and the IGNORE_DIRS list.
 */
function listTree(rootPath: string, maxDepth: number): string[] {
  const results: string[] = [];
  walk(rootPath, rootPath, 0, maxDepth, results);
  results.sort();
  return results;
}

function walk(
  root: string,
  dir: string,
  depth: number,
  maxDepth: number,
  out: string[],
): void {
  if (depth > maxDepth) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".") && name !== "." && name !== "..") continue;
    if (IGNORE_DIRS.has(name)) continue;
    const p = join(dir, name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    const rel = relative(root, p);
    if (s.isDirectory()) {
      out.push(`${rel}/`);
      walk(root, p, depth + 1, maxDepth, out);
    } else {
      out.push(rel);
    }
  }
}

/**
 * Heuristic: pick files likely to reveal what the project does.
 * Prefers entrypoints and short configs; caps at MAX_KEY_FILES and per-file
 * size to keep the prompt compact.
 */
function pickKeyFiles(
  repoPath: string,
  fileTree: string[],
  manifestFilename?: string,
): { path: string; content: string }[] {
  const ENTRYPOINTS = [
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

  const picked = new Set<string>();
  const results: { path: string; content: string }[] = [];

  // 1. Entrypoints by known path
  for (const candidate of ENTRYPOINTS) {
    if (fileTree.includes(candidate)) picked.add(candidate);
    if (picked.size >= MAX_KEY_FILES) break;
  }

  // 2. Then top-level short files that look interesting (excluding manifest)
  const topLevelInteresting = fileTree
    .filter((f) => !f.includes("/"))
    .filter((f) => /\.(ts|tsx|js|jsx|py|rs|go|gd|rb)$/.test(f))
    .filter((f) => f !== manifestFilename);
  for (const f of topLevelInteresting) {
    if (picked.size >= MAX_KEY_FILES) break;
    picked.add(f);
  }

  for (const rel of picked) {
    const abs = join(repoPath, rel);
    try {
      const content = truncate(readFileSync(abs, "utf8"), MAX_KEY_FILE_BYTES);
      results.push({ path: rel, content });
    } catch {
      // skip unreadable
    }
  }

  return results;
}

function truncate(text: string, maxBytes: number): string {
  if (text.length <= maxBytes) return text;
  return text.slice(0, maxBytes) + "\n\n[...truncated]";
}

/**
 * Formats a RepoContext as the text blob that goes into the AI prompt.
 * Kept separate from analyze() so tests can compare structure easily.
 */
export function formatContextForPrompt(ctx: RepoContext): string {
  const parts: string[] = [];
  parts.push(`REPO PATH: ${basename(ctx.path)}`);
  if (ctx.detectedLanguage) {
    parts.push(`PRIMARY LANGUAGE: ${ctx.detectedLanguage}`);
  }
  if (ctx.readme) {
    parts.push(`README\n${"-".repeat(40)}\n${ctx.readme}`);
  }
  if (ctx.manifest) {
    parts.push(
      `MANIFEST (${ctx.manifest.filename})\n${"-".repeat(40)}\n${ctx.manifest.content}`,
    );
  }
  if (ctx.fileTree.length > 0) {
    parts.push(
      `FILE TREE (top 2 levels)\n${"-".repeat(40)}\n${ctx.fileTree.join("\n")}`,
    );
  }
  for (const kf of ctx.keyFiles) {
    parts.push(
      `FILE: ${kf.path}\n${"-".repeat(40)}\n${kf.content}`,
    );
  }
  return parts.join("\n\n");
}
