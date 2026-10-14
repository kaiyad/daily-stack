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
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  enrichModel: process.env.ENRICH_MODEL || "claude-haiku-5-5",
  githubToken: process.env.GITHUB_TOKEN || "",
  redditClientId: process.env.REDDIT_CLIENT_ID || "",
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET || "",
  cronSecret: process.env.CRON_SECRET || "",
};
