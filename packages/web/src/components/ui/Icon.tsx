type IconProps = { className?: string };

export const Icon = {
  Ext: ({ className = "w-3 h-3" }: IconProps) => (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M10 3h3v3M13 3l-6 6M6 4H3v9h9v-3" />
    </svg>
  ),
  Commit: ({ className = "w-4 h-4" }: IconProps) => (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="8" cy="8" r="2.5" />
      <path d="M2 8h3.5M10.5 8H14" />
    </svg>
  ),
  Release: ({ className = "w-4 h-4" }: IconProps) => (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M8 2l1.8 3.7L14 6.3l-3 2.9.7 4.1L8 11.4 4.3 13.3 5 9.2 2 6.3l4.2-.6z" />
    </svg>
  ),
  Issue: ({ className = "w-4 h-4" }: IconProps) => (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v4M8 11v.01" strokeLinecap="round" />
    </svg>
  ),
  Pr: ({ className = "w-4 h-4" }: IconProps) => (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M4 5.5v5M12 10.5V7a2 2 0 00-2-2H7.5" />
    </svg>
  ),
  Star: ({ className = "w-3.5 h-3.5" }: IconProps) => (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor">
      <path d="M8 1.5l2 4.3 4.5.5-3.4 3.1.9 4.6L8 11.7 3.9 14l.9-4.6L1.5 6.3 6 5.8z" />
    </svg>
  ),
  Check: ({ className = "w-3 h-3" }: IconProps) => (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" />
    </svg>
  ),
  Chevron: ({ className = "w-3 h-3" }: IconProps) => (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" />
    </svg>
  ),
  Dismiss: ({ className = "w-3 h-3" }: IconProps) => (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  ),
  Sparkle: ({ className = "w-3.5 h-3.5" }: IconProps) => (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor">
      <path d="M8 1l1.2 4.3L13.5 6.5 9.2 7.7 8 12 6.8 7.7 2.5 6.5 6.8 5.3z" />
    </svg>
  ),
};
