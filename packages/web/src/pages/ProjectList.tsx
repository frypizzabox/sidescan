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
            <div className="font-medium text-zinc-900">{p.name}</div>
            {p.description && (
              <div className="text-sm text-zinc-600 mt-1">
                {p.description}
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
