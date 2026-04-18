import type { Command } from "commander";

/**
 * Registers stubs for commands not yet implemented. Each prints a clear
 * "not implemented" message with the target phase and exits non-zero.
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
  { name: "stop", description: "Stop a running daemon", phase: "Phase 2b" },
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
] as const;
