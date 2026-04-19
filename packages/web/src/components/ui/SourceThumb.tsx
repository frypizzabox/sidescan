import { SOURCE_META, type FeedKind, extractDomain } from "./source-meta";

interface Item {
  source?: FeedKind | string;
  url: string;
  thumbnailUrl?: string | null;
  domain?: string | null;
}

const TONE_BG: Record<string, string> = {
  orange: "bg-orange-500",
  red: "bg-red-500",
  sky: "bg-sky-600",
  zinc: "bg-zinc-700",
  purple: "bg-purple-600",
  violet: "bg-violet-600",
};

export function SourceThumb({
  item,
  size = 52,
}: {
  item: Item;
  size?: number;
}) {
  const kind = (item.source ?? "web") as FeedKind;
  const meta = SOURCE_META[kind] ?? SOURCE_META.web;

  // Future: when thumbnailUrl is a real og:image URL, render <img>.
  if (item.thumbnailUrl && /^https?:/.test(item.thumbnailUrl)) {
    return (
      <img
        src={item.thumbnailUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-md object-cover bg-zinc-100 ring-1 ring-inset ring-zinc-200"
        style={{ width: size, height: size }}
      />
    );
  }

  if (kind === "hn") {
    return (
      <div
        style={{ width: size, height: size }}
        className="shrink-0 rounded-md bg-orange-500 flex items-center justify-center text-white font-bold text-[20px] leading-none"
      >
        Y
      </div>
    );
  }
  if (kind === "ph") {
    return (
      <div
        style={{ width: size, height: size }}
        className="shrink-0 rounded-md bg-red-500 flex items-center justify-center text-white font-bold text-[18px] leading-none"
      >
        P
      </div>
    );
  }

  const domain = item.domain ?? extractDomain(item.url);
  const letter = domain.charAt(0).toUpperCase() || "W";
  const toneBg = TONE_BG[meta.tone] ?? TONE_BG.zinc;

  return (
    <div
      style={{ width: size, height: size }}
      className="shrink-0 rounded-md bg-zinc-100 ring-1 ring-inset ring-zinc-200 overflow-hidden relative"
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "repeating-linear-gradient(45deg, transparent 0 6px, rgba(24,24,27,0.04) 6px 7px)",
        }}
      />
      <div className={`absolute top-1.5 left-1.5 w-4 h-4 rounded-sm ${toneBg}`} />
      <div className="absolute bottom-1 right-1.5 text-[14px] font-semibold text-zinc-500 leading-none">
        {letter}
      </div>
    </div>
  );
}
