import { NavLink } from "react-router-dom";
import { useProjects } from "@/lib/api";
import { Kbd } from "@/components/ui/Kbd";

export function Sidebar() {
  const projects = useProjects();
  const totalUnread = (projects.data?.projects ?? []).reduce(
    (n, p) => n + p.newFindingsSinceLastScan,
    0,
  );

  return (
    <aside className="w-[220px] shrink-0 h-screen flex flex-col bg-zinc-50 border-r border-zinc-200 sticky top-0">
      <NavLink
        to="/"
        aria-label="Sidescan"
        className="px-4 py-4 flex items-center gap-2"
      >
        <div
          aria-hidden
          className="w-6 h-6 rounded-md bg-zinc-900 text-white flex items-center justify-center text-[11px] font-bold tracking-tight"
        >
          S
        </div>
        <div
          aria-hidden
          className="text-[14px] font-semibold text-zinc-900"
        >
          Sidescan
        </div>
      </NavLink>

      <nav className="px-2 space-y-0.5">
        <NavItem to="/" end label="All projects" count={totalUnread} />
        <NavItem to="/across" label="Across projects" />
      </nav>

      <div className="px-3 pt-5 pb-1 text-[10px] font-semibold tracking-wider uppercase text-zinc-400">
        Projects
      </div>

      <nav className="px-2 space-y-0.5 overflow-y-auto flex-1">
        {projects.isLoading && (
          <div className="px-2 py-1 text-[12px] text-zinc-400">Loading…</div>
        )}
        {projects.isError && (
          <div className="px-2 py-1 text-[12px] text-red-600">
            Failed to load projects
          </div>
        )}
        {projects.data?.projects.length === 0 && (
          <div className="px-2 py-1 text-[12px] text-zinc-400">
            None configured
          </div>
        )}
        {projects.data?.projects.map((p) => (
          <NavItem
            key={p.slug}
            to={`/projects/${p.slug}/feed`}
            label={p.name}
            count={p.newFindingsSinceLastScan}
          />
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-zinc-200">
        <button
          type="button"
          className="w-full inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-800"
        >
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <span className="ml-0.5">for command palette</span>
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  to,
  label,
  count,
  end,
}: {
  to: string;
  label: string;
  count?: number;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-[13px] text-left ${
          isActive
            ? "bg-zinc-900 text-white"
            : "text-zinc-700 hover:bg-zinc-100"
        }`
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          <span className="truncate flex-1">{label}</span>
          {count && count > 0 ? (
            <span
              className={`inline-flex items-center px-1 min-w-[18px] h-[16px] justify-center rounded text-[10px] font-semibold tabular-nums ${
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}
