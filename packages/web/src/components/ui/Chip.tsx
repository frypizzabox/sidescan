import { TONE_CLASSES, type Tone } from "./source-meta";
import type { ReactNode } from "react";

export function Chip({
  tone = "zinc",
  children,
  className = "",
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-[14px] ring-1 ring-inset ${TONE_CLASSES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
