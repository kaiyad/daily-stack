import type { MetadataRoute } from "next";
import { frozenDates } from "../lib/editions";
import { env } from "../lib/env";
import { listConcepts } from "../pipeline/concepts";
import { listShelf } from "../pipeline/shelf";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;
  const [dates, units, shelf] = await Promise.all([
    frozenDates(),
    listConcepts(),
    listShelf(),
  ]);

  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/archive`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/cheatsheet`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/shelf`, changeFrequency: "weekly", priority: 0.8 },
    // A frozen edition never changes, so it is never worth recrawling.
    ...dates.map((date) => ({
      url: `${base}/${date}`,
      lastModified: new Date(`${date}T00:00:00Z`),
      changeFrequency: "never" as const,
      priority: 0.5,
    })),
    ...units.map((u) => ({
      url: `${base}/concepts/${u.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
    ...shelf.map((s) => ({
      url: `${base}/shelf/${s.slug}`,
      lastModified: new Date(`${s.shelf_date}T00:00:00Z`),
      changeFrequency: "never" as const,
      priority: 0.6,
    })),
  ];
}
