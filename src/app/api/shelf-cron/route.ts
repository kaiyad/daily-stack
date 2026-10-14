import { buildShelf } from "../../../pipeline/shelf";
import { currentShelfDate } from "../../../lib/shelf";
import { env } from "../../../lib/env";

export const dynamic = "force-dynamic";
// Two model calls, one of them searching the web and one writing four thousand
// words: this runs for minutes, not seconds. Vercel's Hobby plan kills a
// function at 60s, so .github/workflows/weekly-shelf.yml is the path that
// works; this route is for platforms with a longer ceiling and for triggering
// a rebuild by hand.
export const maxDuration = 800;

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
