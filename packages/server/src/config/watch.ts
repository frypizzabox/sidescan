import { watch, type FSWatcher } from "node:fs";

/**
 * Watches a file and calls `onChange` (debounced 200ms) whenever it changes.
 * Returns a cleanup function.
 *
 * We use node's fs.watch rather than chokidar to avoid an extra dependency.
 * Trade-off: fs.watch is platform-dependent and occasionally fires twice per
 * edit; the debounce handles that.
 */
export function watchFile(path: string, onChange: () => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, 200);
  };

  let watcher: FSWatcher;
  try {
    watcher = watch(path, { persistent: true }, fire);
  } catch {
    // If the file doesn't exist at start, watch silently fails. We bail.
    return () => {};
  }

  return () => {
    watcher.close();
    if (timer) clearTimeout(timer);
  };
}
