import { NavLink } from "react-router-dom";

export interface Tab {
  label: string;
  to: string;
  end?: boolean;
}

export function TabNav({ tabs }: { tabs: Tab[] }) {
  return (
    <div className="border-b border-zinc-200">
      <nav className="flex gap-1 -mb-px">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 transition ${
                isActive
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
