// D1 tables. Created on first use, so no manual migration step.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS owners (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, exp INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_links (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, exp INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT, provider TEXT DEFAULT 'square', merchant_id TEXT, sq_env TEXT,
    access_token TEXT, refresh_token TEXT, token_exp INTEGER, location_ids TEXT, currency TEXT DEFAULT 'CAD', timezone TEXT DEFAULT 'America/Vancouver',
    address TEXT, phone TEXT, website TEXT, booking_url TEXT, reply_email TEXT,
    fee_pct REAL DEFAULT 0.12, fee_min_cents INTEGER DEFAULT 500, fee_cap_cents INTEGER DEFAULT 50000,
    autopilot INTEGER DEFAULT 0, daily_cap INTEGER DEFAULT 60, terms_at INTEGER, list_confirmed_at INTEGER,
    sync_from INTEGER, synced_at INTEGER, sync_state TEXT, status TEXT DEFAULT 'connected', created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, biz_id TEXT NOT NULL, ext_id TEXT NOT NULL, first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
    provider_unsub INTEGER DEFAULT 0, visits INTEGER DEFAULT 0, first_visit INTEGER, last_visit INTEGER, cycle_days INTEGER,
    avg_cents INTEGER, total_cents INTEGER, segment TEXT, updated_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS customers_biz ON customers (biz_id, segment)`,
  `CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, biz_id TEXT NOT NULL, customer_id TEXT, at INTEGER NOT NULL, amount_cents INTEGER DEFAULT 0, source TEXT)`,
  `CREATE INDEX IF NOT EXISTS visits_cust ON visits (customer_id, at)`,
  `CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, biz_id TEXT NOT NULL, customer_id TEXT, start_at INTEGER NOT NULL, status TEXT, updated_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS bookings_cust ON bookings (customer_id, start_at)`,
  `CREATE TABLE IF NOT EXISTS campaigns (biz_id TEXT NOT NULL, kind TEXT NOT NULL, enabled INTEGER DEFAULT 0, offer TEXT, PRIMARY KEY (biz_id, kind))`,
  `CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY, biz_id TEXT NOT NULL, customer_id TEXT NOT NULL, campaign TEXT NOT NULL, holdout INTEGER DEFAULT 0,
    enrolled_at INTEGER NOT NULL, last_visit_before INTEGER, cycle_before INTEGER, step INTEGER DEFAULT 0, next_at INTEGER,
    status TEXT DEFAULT 'active', clicked_at INTEGER, returned_at INTEGER, return_cents INTEGER, fee_cents INTEGER, fee_month TEXT)`,
  `CREATE INDEX IF NOT EXISTS enr_due ON enrollments (status, next_at)`,
  `CREATE INDEX IF NOT EXISTS enr_cust ON enrollments (customer_id, enrolled_at)`,
  `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, biz_id TEXT NOT NULL, enrollment_id TEXT, customer_id TEXT, channel TEXT, step INTEGER, subject TEXT, sent_at INTEGER, ok INTEGER)`,
  `CREATE TABLE IF NOT EXISTS consents (id TEXT PRIMARY KEY, biz_id TEXT NOT NULL, customer_id TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL, source TEXT, wording TEXT, phone TEXT, ip TEXT, ua TEXT, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS consents_cust ON consents (customer_id, channel, at)`,
  `CREATE TABLE IF NOT EXISTS links (token TEXT PRIMARY KEY, enrollment_id TEXT, biz_id TEXT, customer_id TEXT, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, biz_id TEXT, kind TEXT, info TEXT, at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS events_biz ON events (biz_id, at)`,
];

let ready = false;
export async function tables(env) {
  if (ready) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  ready = true;
}

export async function logEvent(env, biz_id, kind, info = "", at = Date.now()) {
  try { await env.DB.prepare("INSERT INTO events (biz_id, kind, info, at) VALUES (?1, ?2, ?3, ?4)").bind(biz_id, kind, String(info).slice(0, 300), at).run(); } catch {}
}

// Latest consent per customer + channel ("opt_in" / "opt_out"), or null.
export async function consentOf(env, customer_id, channel) {
  const r = await env.DB.prepare("SELECT status FROM consents WHERE customer_id = ?1 AND channel = ?2 ORDER BY at DESC LIMIT 1").bind(customer_id, channel).first();
  return r ? r.status : null;
}
