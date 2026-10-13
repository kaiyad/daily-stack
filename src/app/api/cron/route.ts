import { ingestAll } from "../../../ingest/index";
import { buildEdition } from "../../../pipeline/build";
import { currentEditionDate } from "../../../lib/dates";
import { env } from "../../../lib/env";

export const dynamic = "force-dynamic";
// Vercel's Hobby plan caps a function at 60s, and a full ingest of ~90 sources
// runs close to that. The GitHub Actions workflow is the reliable path; this
// route exists for platforms with a longer ceiling, and for triggering by hand.
export const maxDuration = 60;

/**
 * The daily job, as an HTTP endpoint for a platform scheduler.
 * Ingest everything, cut today's edition, freeze it.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const results = await ingestAll();
    const date = currentEditionDate();
    const built = await buildEdition(date, { freeze: true });

    return Response.json({
      ok: true,
      ms: Date.now() - started,
      sources: { ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length },
      failures: results.filter((r) => !r.ok).map((r) => ({ source: r.source, error: r.error })),
      edition: built,
    });
  } catch (err) {
    return Response.json(
      { ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
