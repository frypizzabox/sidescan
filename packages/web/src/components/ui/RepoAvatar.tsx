import { useState } from "react";

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h;
}

/**
 * Renders the GitHub owner avatar when available (via `https://github.com/{owner}.png`),
 * falling back to a deterministic 5x5 identicon derived from the seed.
 */
export function RepoAvatar({
  seed,
  owner,
  size = 40,
}: {
  seed: string;
  owner?: string | null;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);

  if (owner && !imgError) {
    return (
      <img
        src={`/api/avatar/${encodeURIComponent(owner)}?size=${size * 2}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setImgError(true)}
        className="shrink-0 rounded-md bg-surface-sunk ring-1 ring-inset ring-hairline object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const h = hash(seed);
  const hues = [14, 25, 200, 220, 260, 280, 340, 160, 190];
  const hue = hues[Math.abs(h) % hues.length];
  const color = `hsl(${hue}, 40%, 45%)`;
  const bg = `hsl(${hue}, 30%, 94%)`;
  const cells = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const bit = (h >> (y * 3 + x)) & 1;
      if (bit) {
        cells.push(
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} />,
        );
        if (x < 2) {
          cells.push(
            <rect
              key={`m-${x}-${y}`}
              x={4 - x}
              y={y}
              width="1"
              height="1"
              fill={color}
            />,
          );
        }
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      className="shrink-0 rounded-md"
      style={{ background: bg }}
    >
      {cells}
    </svg>
  );
}
