import { Link } from "react-router-dom";
import { useProjects } from "@/lib/api";

export function ProjectList() {
  const { data, isLoading, isError } = useProjects();

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold mb-1">Projects</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Configure projects in <code className="text-zinc-700">config.yaml</code>.
      </p>

      {isLoading && <p className="text-zinc-500">Loading…</p>}
      {isError && (
        <p className="text-red-600">Failed to load projects from server.</p>
      )}
      {data?.projects.length === 0 && (
        <p className="text-zinc-500">
          No projects configured yet. Edit your config.yaml, then run{" "}
          <code>sidescan reload</code>.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data?.projects.map((p) => (
          <Link
            key={p.slug}
            to={`/projects/${p.slug}`}
            className="block rounded-lg border border-zinc-200 hover:border-zinc-300 hover:shadow-sm p-4 transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-zinc-900 truncate">{p.name}</div>
              {p.newFindingsSinceLastScan > 0 && (
                <span className="text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 whitespace-nowrap">
                  {p.newFindingsSinceLastScan} new
                </span>
              )}
            </div>
            {p.description && (
              <div className="text-sm text-zinc-600 mt-1 line-clamp-2">
                {p.description}
              </div>
            )}
            {p.aiInferredSummary && !p.description && (
              <div className="text-sm text-zinc-600 mt-1 line-clamp-2">
                {p.aiInferredSummary}
              </div>
            )}
            <div className="text-xs text-zinc-500 mt-2">
              {p.scan.frequency}
              {p.scan.time ? ` @ ${p.scan.time}` : ""}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
