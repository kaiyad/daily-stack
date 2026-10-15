import fs from "node:fs";

// Next loads .env itself; the CLI entrypoints do not.
if (!process.env.DATABASE_URL && fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (copy .env.example to .env)`);
  return v;
}

export const env = {
  // A getter, not a value: importing this module for `editionTz` alone - as a
  // pure-logic test does - must not demand a database. Every real entry point
  // reaches it through `db.ts`, which still fails fast at import.
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  editionTz: process.env.EDITION_TZ || "UTC",
  freezeHour: Number(process.env.EDITION_FREEZE_HOUR ?? 6),
  // Absolute origin, needed by anything that has to name itself: the feed, the
  // sitemap, canonical URLs. Vercel sets the project variable on every deploy.
  get siteUrl(): string {
    const explicit = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) return explicit.replace(/\/+$/, "");
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return vercel ? `https://${vercel}` : "http://localhost:3000";
  },
  // The free Postgres tier this is sized for. `npm run doctor` warns against it.
  dbCapMb: Number(process.env.DB_CAP_MB ?? 500),
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  enrichModel: process.env.ENRICH_MODEL || "claude-haiku-5-5",
  // The shelf is one long piece a week, not nineteen blurbs a day, so it is
  // worth a far more capable model than enrichment uses.
  shelfModel: process.env.SHELF_MODEL || "claude-opus-5-5",
  shelfPublishHour: Number(process.env.SHELF_PUBLISH_HOUR ?? 21),
  shelfMaxSearches: Number(process.env.SHELF_MAX_SEARCHES ?? 14),
  // The free fallback, used only when no piece was written ahead of time and
  // there is no Anthropic key.
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  githubToken: process.env.GITHUB_TOKEN || "",
  redditClientId: process.env.REDDIT_CLIENT_ID || "",
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET || "",
  cronSecret: process.env.CRON_SECRET || "",
};
