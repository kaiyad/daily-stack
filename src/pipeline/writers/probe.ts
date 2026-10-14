import { fetchRaw, mapLimit } from "../../lib/http";
import { log } from "../../lib/log";
import { canonicalizeUrl } from "../../lib/url";
import type { ShelfLink } from "../../lib/shelf";

/**
 * The fallback for a writer that could not search: ask each proposed URL
 * whether it exists, and build the allowed set from the ones that answer.
 *
 * Weaker than a grounded search - a live page is not evidence the model read
 * it - but it does catch the invented URL, which is the failure that actually
 * reaches a reader. The rule is deliberately conservative: a link is dropped
 * only when we have proof it is gone, not merely because a host dislikes us.
 */
export async function probeUrls(links: ShelfLink[]): Promise<Map<string, string>> {
  const unique = [...new Map(links.map((l) => [canonicalizeUrl(l.url), l.url])).entries()];
  const alive = new Map<string, string>();

  await mapLimit(unique, 4, async ([canonical, url]) => {
    try {
      let res = await fetchRaw(url, { method: "HEAD", retries: 1, timeoutMs: 10_000 });
      // Plenty of hosts serve pages but refuse HEAD outright.
      if (res.status === 405 || res.status === 501) {
        res = await fetchRaw(url, { retries: 1, timeoutMs: 10_000 });
      }
      if (res.status === 404 || res.status === 410) {
        log.warn(`dropped dead link ${url} (${res.status})`);
        return;
      }
      alive.set(canonical, url);
    } catch {
      log.warn(`dropped unreachable link ${url}`);
    }
  });

  log.info(`${alive.size}/${unique.length} proposed links resolve`);
  return alive;
}
