import { describe, it, expect } from "vitest";
import { cronExpression } from "@/scheduler/cron.js";
import type { ProjectConfig } from "@/config/schema.js";

function p(
  freq: ProjectConfig["scan"]["frequency"],
  time?: string,
): ProjectConfig {
  return {
    name: "x",
    slug: "x",
    bootstrap_lookback_years: 2,
    scan: { frequency: freq, time },
    repos: [{ path: "/tmp/x" }],
  };
}

describe("cronExpression", () => {
  it("returns null for manual", () => {
    expect(cronExpression(p("manual"))).toBeNull();
  });

  it("produces top-of-hour for hourly", () => {
    expect(cronExpression(p("hourly"))).toBe("0 * * * *");
  });

  it("daily at 09:00 by default", () => {
    expect(cronExpression(p("daily"))).toBe("0 9 * * *");
  });

  it("daily at custom time", () => {
    expect(cronExpression(p("daily", "14:30"))).toBe("30 14 * * *");
  });

  it("weekly on Mondays at the specified time", () => {
    expect(cronExpression(p("weekly", "07:15"))).toBe("15 7 * * 1");
  });
});
