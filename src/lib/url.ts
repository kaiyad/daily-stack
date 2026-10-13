import { createHash } from "node:crypto";

const TRACKING_EXACT = new Set([
  "ref", "ref_src", "ref_url", "referrer", "source", "fbclid", "gclid", "gclsrc",
  "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "igsh", "spm", "scid",
  "_hsenc", "_hsmi", "hss_channel", "campaign_id", "cmp", "CMP", "ncid",
  "__twitter_impression", "guccounter", "guce_referrer", "guce_referrer_sig",
  "sh", "share", "share_id", "sourceid", "amp", "output", "outputType",
  "feature", "app", "ck_subscriber_id", "trk", "trkInfo", "originalSubdomain",
]);

const TRACKING_PREFIX = ["utm_", "at_", "pk_", "piwik_", "mtm_", "oly_", "vero_"];

function isTracking(key: string): boolean {
  const k = key.toLowerCase();
  return TRACKING_EXACT.has(key) || TRACKING_EXACT.has(k) ||
    TRACKING_PREFIX.some((p) => k.startsWith(p));
}

/** Hosts where the query string is the identity of the page, not decoration. */
const KEEP_PARAMS: Record<string, string[]> = {
  "news.ycombinator.com": ["id"],
  "youtube.com": ["v"],
  "lobste.rs": [],
  "stackoverflow.com": [],
};

function stripHostPrefix(host: string): string {
  return host.replace(/^(www|m|mobile|amp)\./, "");
}

/**
 * Collapse the many URLs that point at one story into a single key.
 * This is the step that does most of the de-duplication work; title
 * similarity in the clusterer only mops up what survives it.
 */
export function canonicalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return input.trim();
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return u.toString();

  u.protocol = "https:";
  u.hostname = stripHostPrefix(u.hostname.toLowerCase());
  u.port = "";
  u.hash = "";
  u.username = "";
  u.password = "";

  // youtu.be/ID -> youtube.com/watch?v=ID
  if (u.hostname === "youtu.be") {
    const id = u.pathname.slice(1);
    u = new URL(`https://youtube.com/watch?v=${id}`);
  }

  let path = u.pathname;

  // Strip AMP suffixes and .git, normalise trailing slash.
  path = path.replace(/\/amp\/?$/i, "/").replace(/\.git$/i, "");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  path = path.replace(/\/{2,}/g, "/");

  if (u.hostname === "github.com") {
    // A repo's tree/blob/issues views all canonicalise to the repo itself,
    // except issues and PRs, which are distinct stories.
    const m = path.match(/^\/([^/]+)\/([^/]+)(\/(tree|blob|commits?|releases|wiki|stargazers)(\/.*)?)?$/);
    if (m) path = `/${m[1]}/${m[2]}`;
  } else if (u.hostname === "reddit.com") {
    const m = path.match(/^\/r\/([^/]+)\/comments\/([^/]+)/);
    if (m) path = `/r/${m[1]}/comments/${m[2]}`;
  } else if (u.hostname === "arxiv.org") {
    const m = path.match(/^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/);
    if (m) path = `/abs/${m[1]}`;
  }

  u.pathname = path;

  const keep = KEEP_PARAMS[u.hostname];
  const params = [...u.searchParams.entries()]
    .filter(([k]) => (keep ? keep.includes(k) : !isTracking(k)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);

  return u.toString();
}

export function urlHash(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function domainOf(url: string): string {
  try {
    return stripHostPrefix(new URL(url).hostname.toLowerCase());
  } catch {
    return "unknown";
  }
}

/** Loose title key used to catch the same release written up by four outlets. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|is|are|to|of|for|and|in|on|with|new|now|how|why|your|you)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
