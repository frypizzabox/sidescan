import { logger } from "@/lib/logger.js";

export interface PageMeta {
  thumbnailUrl: string | null;
  faviconUrl: string | null;
}

const FETCH_TIMEOUT_MS = 3_000;
const MAX_BYTES = 256_000; // Only need the <head>; cap to avoid streaming full pages.

/**
 * Fetches `url` and extracts og:image + favicon. Returns nulls on any failure.
 * Best-effort — no exceptions leak. Used as scan-time enrichment.
 */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "sidescan/0.1 (+https://github.com/frypizzabox/sidescan)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return { thumbnailUrl: null, faviconUrl: null };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return { thumbnailUrl: null, faviconUrl: null };

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let text = "";
    let bytes = 0;
    while (bytes < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      // Stop once we've seen </head>; og:image is always in head.
      if (/<\/head>/i.test(text)) break;
    }
    try {
      await reader.cancel();
    } catch {
      /* stream already closed */
    }

    const baseUrl = res.url || url;
    return {
      thumbnailUrl: extractOgImage(text, baseUrl),
      faviconUrl: extractFavicon(text, baseUrl),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug({ url, err: msg }, "og-image fetch failed");
    return { thumbnailUrl: null, faviconUrl: null };
  } finally {
    clearTimeout(timer);
  }
}

function extractOgImage(html: string, baseUrl: string): string | null {
  // Match <meta property="og:image" content="..."> in either attribute order.
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return resolveUrl(m[1], baseUrl);
  }
  return null;
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const patterns = [
    /<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut\s+)?icon["']/i,
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return resolveUrl(m[1], baseUrl);
  }
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Runs `task` over `items` with at most `concurrency` active. Preserves input
 * order in the result. Individual task failures become null and don't abort.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      const item = items[i]!;
      try {
        out[i] = await task(item, i);
      } catch {
        out[i] = null;
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  );
  await Promise.all(workers);
  return out;
}
