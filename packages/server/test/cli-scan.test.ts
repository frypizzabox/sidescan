import { describe, it, expect } from "vitest";
import { selectScanTargets } from "@/cli/scan.js";
import type { ProjectRow } from "@/db/queries.js";

function project(
  slug: string,
  frequency: ProjectRow["scan_frequency"],
): ProjectRow {
  return {
    id: 1,
    slug,
    name: slug,
    description: null,
    scan_frequency: frequency,
    scan_time: null,
    bootstrap_lookback_years: 2,
    hidden: 0,
    created_at: "",
    updated_at: "",
  } as unknown as ProjectRow;
}

describe("selectScanTargets", () => {
  const all: ProjectRow[] = [
    project("a", "daily"),
    project("b", "weekly"),
    project("c", "manual"),
  ];

  it("returns exactly the named project when a slug is given", () => {
    expect(selectScanTargets(all, { slug: "b" }).map((p) => p.slug)).toEqual([
      "b",
    ]);
  });

  it("returns an empty set when the slug doesn't match", () => {
    expect(selectScanTargets(all, { slug: "unknown" })).toEqual([]);
  });

  it("returns non-manual projects by default", () => {
    expect(selectScanTargets(all, {}).map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("returns every project when --all is set", () => {
    expect(selectScanTargets(all, { all: true }).map((p) => p.slug)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("prioritises slug over --all when both are given", () => {
    const out = selectScanTargets(all, { slug: "c", all: true });
    expect(out.map((p) => p.slug)).toEqual(["c"]);
  });
});
