import fs from "node:fs";
import path from "node:path";
import { pool } from "../lib/db";
import { log } from "../lib/log";

const DIR = "db/migrations";

async function main(): Promise<void> {
  await pool.query(
    `create table if not exists schema_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const applied = new Set(
    (await pool.query<{ name: string }>(`select name from schema_migrations`)).rows.map((r) => r.name),
  );

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(`insert into schema_migrations (name) values ($1)`, [file]);
      await client.query("commit");
      log.info(`applied ${file}`);
      ran++;
    } catch (err) {
      await client.query("rollback");
      throw new Error(`migration ${file} failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      client.release();
    }
  }

  log.info(ran ? `${ran} migration(s) applied` : "schema up to date");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
