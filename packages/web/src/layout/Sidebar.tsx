import { NavLink } from "react-router-dom";
import { useProjects } from "@/lib/api";
import { Kbd } from "@/components/ui/Kbd";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function Sidebar() {
  const projects = useProjects();
  const totalUnread = (projects.data?.projects ?? []).reduce(
    (n, p) => n + p.newFindingsSinceLastScan,
    0,
  );

  return (
    <aside className="w-[220px] shrink-0 h-screen flex flex-col bg-surface border-r border-hairline sticky top-0">
      <NavLink
        to="/"
        aria-label="Sidescan"
        className="px-4 py-4 flex items-center gap-2"
      >
        <div
          aria-hidden
          className="w-6 h-6 rounded-md bg-ink-1 text-canvas flex items-center justify-center text-[11px] font-bold tracking-tight"
        >
          S
        </div>
        <div
          aria-hidden
          className="text-[14px] font-semibold text-ink-1"
        >
          Sidescan
        </div>
      </NavLink>

      <nav className="px-2 space-y-0.5">
        <NavItem to="/" end label="All projects" count={totalUnread} />
        <NavItem to="/across" label="Across projects" />
      </nav>

      <div className="px-3 pt-5 pb-1 text-[10px] font-semibold tracking-wider uppercase text-ink-4">
        Projects
      </div>

      <nav className="px-2 space-y-0.5 overflow-y-auto flex-1">
        {projects.isLoading && (
          <div className="px-2 py-1 text-[12px] text-ink-4">Loading…</div>
        )}
        {projects.isError && (
          <div className="px-2 py-1 text-[12px] text-red-600 dark:text-red-400">
            Failed to load projects
          </div>
        )}
        {projects.data?.projects.length === 0 && (
          <div className="px-2 py-1 text-[12px] text-ink-4">
            None configured
          </div>
        )}
        {projects.data?.projects.map((p) => (
          <NavItem
            key={p.slug}
            to={`/projects/${p.slug}`}
            label={p.name}
            count={p.newFindingsSinceLastScan}
          />
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-hairline space-y-2">
        <ThemeToggle />
        <button
          type="button"
          className="w-full inline-flex items-center gap-1.5 text-[11px] text-ink-3 hover:text-ink-1"
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
            ? "bg-ink-1 text-canvas"
            : "text-ink-2 hover:bg-surface-sunk"
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
                  ? "bg-surface-raised/20 text-canvas"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
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
