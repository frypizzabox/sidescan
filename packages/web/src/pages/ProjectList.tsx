import { Link } from "react-router-dom";
import { useProjects } from "@/lib/api";

export function ProjectList() {
  const { data, isLoading, isError } = useProjects();

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-[22px] font-semibold text-zinc-900 tracking-[-0.01em]">
        Projects
      </h1>
      <p className="text-[13px] text-zinc-500 mt-0.5 mb-8">
        Configure projects in{" "}
        <code className="px-1 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono text-[12px]">
          config.yaml
        </code>
        .{data?.projects ? ` ${data.projects.length} active.` : ""}
      </p>

      {isLoading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {isError && (
        <p className="text-red-600 text-sm">
          Failed to load projects from server.
        </p>
      )}
      {data?.projects.length === 0 && (
        <p className="text-zinc-500 text-sm">
          No projects configured yet. Edit your config.yaml, then run{" "}
          <code>sidescan reload</code>.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data?.projects.map((p) => (
          <Link
            key={p.slug}
            to={`/projects/${p.slug}/feed`}
            className="group text-left rounded-md bg-white ring-1 ring-inset ring-zinc-200 hover:ring-zinc-300 hover:shadow-sm transition-all p-4"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-semibold text-zinc-900 truncate">
                  {p.name}
                </h3>
                {(p.description || p.aiInferredSummary) && (
                  <p className="text-[12px] text-zinc-500 line-clamp-2 mt-0.5">
                    {p.description || p.aiInferredSummary}
                  </p>
                )}
              </div>
              {p.newFindingsSinceLastScan > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200 shrink-0 whitespace-nowrap">
                  {p.newFindingsSinceLastScan} new
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-400 font-mono">
              <span>
                {p.scan.frequency}
                {p.scan.time ? ` @ ${p.scan.time}` : ""}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
