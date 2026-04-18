import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerInit } from "@/cli/init.js";
import { registerStart } from "@/cli/start.js";
import { registerStatus } from "@/cli/status.js";
import { registerReload } from "@/cli/reload.js";
import { registerVersion } from "@/cli/version.js";
import { registerStubs } from "@/cli/stubs.js";

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "package.json"),
    join(here, "..", "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }
  return "0.0.0";
}

const version = readVersion();

const program = new Command()
  .name("sidescan")
  .description("Competitive intel for your dev projects")
  .version(version, "-v, --version");

registerInit(program);
registerStart(program, version);
registerStatus(program, version);
registerReload(program);
registerVersion(program, version);
registerStubs(program);

program.parseAsync(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
