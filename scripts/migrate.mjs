// One-time (idempotent) schema migration. Requires SUPABASE_DB_URL in .env (Postgres connection string).
// Usage: node scripts/migrate.mjs
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('SUPABASE_DB_URL not set'); process.exit(1); }

const sql = readFileSync(join(here, '..', 'supabase', 'schema.sql'), 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query('select count(*)::int as n from chunks');
  console.log(`schema ok · chunks table has ${rows[0].n} rows`);
} catch (e) {
  console.error('migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
