import type { Command } from "commander";

export function registerVersion(program: Command, version: string): void {
  program
    .command("version")
    .description("Print detailed version info")
    .action(() => {
      console.log(`sidescan ${version}`);
      console.log(`node ${process.versions.node}`);
    });
}
