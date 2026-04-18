import { NavLink } from "react-router-dom";
import { useProjects } from "@/lib/api";

export function Sidebar() {
  const projects = useProjects();

  return (
    <aside className="w-60 border-r border-zinc-200 bg-zinc-50 min-h-screen flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-200">
        <NavLink to="/" className="text-lg font-semibold text-zinc-900">
          Sidescan
        </NavLink>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `block rounded px-2 py-1 text-sm ${
              isActive
                ? "bg-zinc-200 text-zinc-900 font-medium"
                : "text-zinc-700 hover:bg-zinc-100"
            }`
          }
        >
          All projects
        </NavLink>
        <NavLink
          to="/across"
          className={({ isActive }) =>
            `block rounded px-2 py-1 text-sm ${
              isActive
                ? "bg-zinc-200 text-zinc-900 font-medium"
                : "text-zinc-700 hover:bg-zinc-100"
            }`
          }
        >
          Across projects
        </NavLink>

        <div className="pt-3 pb-1 px-2 text-[11px] uppercase tracking-wide text-zinc-500">
          Projects
        </div>

        {projects.isLoading && (
          <div className="px-2 py-1 text-sm text-zinc-400">Loading…</div>
        )}
        {projects.isError && (
          <div className="px-2 py-1 text-sm text-red-600">
            Failed to load projects
          </div>
        )}
        {projects.data?.projects.length === 0 && (
          <div className="px-2 py-1 text-sm text-zinc-400">
            None configured
          </div>
        )}
        {projects.data?.projects.map((p) => (
          <NavLink
            key={p.slug}
            to={`/projects/${p.slug}`}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded px-2 py-1 text-sm truncate ${
                isActive
                  ? "bg-zinc-200 text-zinc-900 font-medium"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`
            }
            title={p.name}
          >
            <span className="truncate flex-1">{p.name}</span>
            {p.newFindingsSinceLastScan > 0 && (
              <span className="text-[9px] uppercase tracking-wide font-medium px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 whitespace-nowrap">
                {p.newFindingsSinceLastScan}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-2 text-[11px] text-zinc-400 border-t border-zinc-200">
        <kbd className="px-1 py-0.5 bg-zinc-200 text-zinc-600 rounded text-[10px]">⌘K</kbd>{" "}
        for command palette
      </div>
    </aside>
  );
}
