import { buildShelf } from "../../../pipeline/shelf";
import { currentShelfDate } from "../../../lib/shelf";
import { env } from "../../../lib/env";

export const dynamic = "force-dynamic";
// 300 is the ceiling the Hobby plan will deploy - a larger value fails the
// build, not just the request. Two model calls, one searching the web and one
// writing four thousand words, can outrun even that, which is why
// .github/workflows/weekly-shelf.yml is the path that actually works. This
// route is for platforms with a longer ceiling, for a `written` piece (no
// model call, so it finishes in milliseconds), and for triggering by hand.
export const maxDuration = 300;

/** The weekly job, as an HTTP endpoint for a platform scheduler. */
export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const built = await buildShelf(currentShelfDate(), { freeze: true });
    if (!built) {
      return Response.json(
        { ok: false, ms: Date.now() - started, error: "nothing to build" },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, ms: Date.now() - started, shelf: built });
  } catch (err) {
    return Response.json(
      { ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
