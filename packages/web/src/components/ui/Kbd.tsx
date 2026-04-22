import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1 min-w-[18px] h-[18px] justify-center text-[10px] font-medium text-ink-3 bg-surface-raised ring-1 ring-inset ring-hairline rounded-sm font-sans leading-none">
      {children}
    </kbd>
  );
}
