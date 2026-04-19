import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1 min-w-[18px] h-[18px] justify-center text-[10px] font-medium text-zinc-500 bg-white ring-1 ring-inset ring-zinc-200 rounded-sm font-sans leading-none">
      {children}
    </kbd>
  );
}
