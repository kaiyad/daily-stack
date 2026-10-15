import { atomFeed } from "../../lib/feed";
import { recentEditions } from "../../lib/editions";
import { env } from "../../lib/env";

// Cached like the pages, for the same reason: everything in it but today is
// frozen. A route handler is uncached by default, so this is the opt-in.
export const dynamic = "force-static";
export const revalidate = 300;

export async function GET(): Promise<Response> {
  const editions = await recentEditions(20);

  return new Response(
    atomFeed({
      siteUrl: env.siteUrl,
      title: "The Daily Stack",
      subtitle: "One dated edition a day of software and computer science.",
      editions,
    }),
    { headers: { "content-type": "application/atom+xml; charset=utf-8" } },
  );
}
