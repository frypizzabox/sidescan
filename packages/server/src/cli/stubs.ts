import type { Command } from "commander";

/**
 * Registers the commands that are Phase 1 stubs — documented in the help
 * output but not yet implemented. Each prints "not yet implemented" and
 * exits 1 so scripts that depend on them fail loudly.
 */
export function registerStubs(program: Command): void {
  for (const cmd of STUB_COMMANDS) {
    program
      .command(cmd.name)
      .description(cmd.description)
      .action(() => {
        console.error(
          `\`sidescan ${cmd.name}\` is not implemented yet (scheduled for ${cmd.phase}).`,
        );
        process.exit(1);
      });
  }
}

const STUB_COMMANDS = [
  { name: "stop", description: "Stop a running daemon", phase: "Phase 1b" },
  { name: "status", description: "Show server and project status", phase: "Phase 2" },
  {
    name: "scan [project]",
    description: "Scan projects for new findings",
    phase: "Phase 5",
  },
  {
    name: "reset <project>",
    description: "Hard-delete a project's scan history",
    phase: "Phase 5",
  },
  { name: "reload", description: "Re-read config.yaml", phase: "Phase 2" },
] as const;
