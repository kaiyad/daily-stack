import { Pool } from "pg";
import type { QueryResultRow } from "pg";
import { env } from "./env";

const globalForDb = globalThis as unknown as { __dailyStackPool?: Pool };

export const pool: Pool =
  globalForDb.__dailyStackPool ??
  new Pool({ connectionString: env.databaseUrl, max: 8 });

globalForDb.__dailyStackPool = pool;

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params as never[]);
  return res.rows;
}

export async function one<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

export async function tx<T>(fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
