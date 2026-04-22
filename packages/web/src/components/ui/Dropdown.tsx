import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface DropdownOption<V extends string> {
  value: V;
  label: string;
}

export function Dropdown<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: DropdownOption<V>[];
  onChange: (v: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium text-ink-2 bg-surface-raised ring-1 ring-inset ring-hairline hover:ring-hairline-strong"
      >
        {label}
        <Icon.Chevron
          className={`w-3 h-3 ${open ? "rotate-90" : ""} transition-transform`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[160px] bg-surface-raised rounded-md shadow-lg ring-1 ring-hairline py-1 z-20">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-surface flex items-center gap-2 ${
                value === o.value
                  ? "text-ink-1 font-medium"
                  : "text-ink-2"
              }`}
            >
              {value === o.value ? (
                <Icon.Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <span className="w-3" />
              )}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
