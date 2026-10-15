import { log } from "../../../lib/log";
import { health } from "../../../pipeline/health";

export const dynamic = "force-dynamic";

/**
 * Liveness for an uptime pinger. 503 when the daily job has stopped working,
 * which is the failure this site cannot show on its own: the last edition is
 * frozen and looks exactly as final as it did the day it was cut.
 *
 * No secret: everything here is an aggregate, plus the slugs of failing feeds,
 * which are in the repo anyway. The one thing that is not public is what a
 * database error says about the connection, so that is logged and not returned.
 */
export async function GET(): Promise<Response> {
  try {
    const report = await health();
    return Response.json(report, {
      status: report.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    log.error("health check failed", err);
    return Response.json(
      { ok: false, problems: ["the health check could not reach the database"] },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
