import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { useProjects } from "@/lib/api";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data } = useProjects();

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  if (!open) return null;

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette">
          <div className="border-b border-zinc-200">
            <Command.Input
              placeholder="Jump to a project or view…"
              className="w-full px-4 py-3 text-sm outline-none placeholder:text-zinc-400"
              autoFocus
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-4 text-sm text-zinc-500">
              No results.
            </Command.Empty>

            <Command.Group heading="Navigation">
              <PaletteItem onSelect={() => go("/")}>All projects</PaletteItem>
              <PaletteItem onSelect={() => go("/across")}>
                Across all projects · new this week
              </PaletteItem>
            </Command.Group>

            {data?.projects && data.projects.length > 0 && (
              <Command.Group heading="Projects">
                {data.projects.map((p) => (
                  <PaletteItem
                    key={p.slug}
                    value={`${p.name} ${p.slug}`}
                    onSelect={() => go(`/projects/${p.slug}`)}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.newFindingsSinceLastScan > 0 && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        {p.newFindingsSinceLastScan} new
                      </span>
                    )}
                  </PaletteItem>
                ))}
              </Command.Group>
            )}
          </Command.List>
          <div className="border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 flex gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

function PaletteItem(props: {
  value?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={props.value}
      onSelect={props.onSelect}
      className="flex items-center px-3 py-2 text-sm rounded cursor-pointer text-zinc-800 data-[selected=true]:bg-zinc-100"
    >
      {props.children}
    </Command.Item>
  );
}
