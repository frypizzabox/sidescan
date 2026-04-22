import { useTheme, type ThemeMode } from "@/lib/theme";
import { Icon } from "@/components/ui/Icon";

const MODES: { mode: ThemeMode; label: string; render: React.ReactNode }[] = [
  {
    mode: "light",
    label: "Light",
    render: <Icon.Sun className="w-3.5 h-3.5" />,
  },
  {
    mode: "dark",
    label: "Dark",
    render: <Icon.Moon className="w-3.5 h-3.5" />,
  },
  {
    mode: "system",
    label: "System",
    render: <Icon.Desktop className="w-3.5 h-3.5" />,
  },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-md p-0.5 ring-1 ring-inset ring-hairline bg-surface"
    >
      {MODES.map((m) => {
        const active = mode === m.mode;
        return (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={m.label}
            title={m.label}
            onClick={() => setMode(m.mode)}
            className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
              active
                ? "bg-surface-raised text-ink-1 shadow-[var(--shadow-1)]"
                : "text-ink-4 hover:text-ink-2"
            }`}
          >
            {m.render}
          </button>
        );
      })}
    </div>
  );
}
