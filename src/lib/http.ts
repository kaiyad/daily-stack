const UA =
  "daily-stack/0.1 (+https://github.com/; personal software news aggregator)";

type Opts = {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
};

export async function fetchRaw(url: string, opts: Opts = {}): Promise<Response> {
  const { timeoutMs = 20_000, retries = 2, headers = {} } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        method: opts.method,
        body: opts.body,
        headers: { "user-agent": UA, accept: "*/*", ...headers },
        redirect: "follow",
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`fetch failed: ${url} (${String(lastErr)})`);
}

export async function fetchJson<T>(url: string, opts: Opts = {}): Promise<T> {
  const res = await fetchRaw(url, { ...opts, headers: { accept: "application/json", ...opts.headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: Opts = {}): Promise<string> {
  const res = await fetchRaw(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

/** Bounded-concurrency map. Keeps us polite to every host we touch. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
