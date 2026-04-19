export function NewBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider leading-[12px] text-emerald-700 bg-emerald-100 ring-1 ring-inset ring-emerald-200 ${className}`}
    >
      NEW
    </span>
  );
}
