// Square: "Connect with Square" (OAuth), token refresh, and syncing customers + sales into D1.
// SQUARE_ENV = "production" uses live Square; anything else uses the free Square sandbox.
// SQUARE_MOCK = "1" fakes everything (local testing and the demo), no Square account needed.

import { DAY, encrypt, decrypt, randomId, bucket } from "./util.js";
import { logEvent } from "./db.js";
import { mockData, MOCK_MERCHANT } from "./mock.js";

export const SCOPES = ["MERCHANT_PROFILE_READ", "CUSTOMERS_READ", "ORDERS_READ", "PAYMENTS_READ"];
const base = (env) => (env.SQUARE_ENV === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com");
const isMock = (env) => env.SQUARE_MOCK === "1";

export function authorizeUrl(env, site, state) {
  if (isMock(env)) return `${site}/square/callback?code=mock&state=${state}`;
  const q = new URLSearchParams({ client_id: env.SQUARE_APP_ID, scope: SCOPES.join(" "), session: "false", state, redirect_uri: `${site}/square/callback` });
  return `${base(env)}/oauth2/authorize?${q}`;
}

async function tokenCall(env, body) {
  const r = await fetch(`${base(env)}/oauth2/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: env.SQUARE_APP_ID, client_secret: env.SQUARE_APP_SECRET, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Square token error: " + (j.errors?.[0]?.detail || r.status));
  return j;
}

// Code from the OAuth redirect -> tokens + merchant profile. Returns fields for the businesses row.
export async function exchange(env, code, site) {
  if (isMock(env)) {
    return { merchant_id: "MOCK-" + randomId(4), access_token: "mock", refresh_token: "mock", token_exp: Date.now() + 30 * DAY, ...MOCK_MERCHANT, location_ids: '["MOCKLOC"]' };
  }
  const t = await tokenCall(env, { code, grant_type: "authorization_code", redirect_uri: `${site}/square/callback` });
  const biz = { merchant_id: t.merchant_id, access_token: t.access_token, refresh_token: t.refresh_token, token_exp: Date.parse(t.expires_at) || Date.now() + 30 * DAY };
  const tok = t.access_token;
  const get = (p) => fetch(`${base(env)}/v2${p}`, { headers: { authorization: `Bearer ${tok}` } }).then((r) => r.json());
  const [m, l] = await Promise.all([get("/merchants/me"), get("/locations")]);
  const locs = (l.locations || []).filter((x) => x.status === "ACTIVE");
  const main = locs[0] || {};
  const a = main.address || {};
  return {
    ...biz,
    name: m.merchant?.business_name || main.business_name || main.name || "Your business",
    currency: m.merchant?.currency || main.currency || "CAD",
    timezone: main.timezone || "America/Vancouver",
    address: [a.address_line_1, a.locality, a.administrative_district_level_1, a.postal_code].filter(Boolean).join(", ") || null,
    phone: main.phone_number || null,
    website: main.website_url || null,
    booking_url: main.website_url || null,
    location_ids: JSON.stringify(locs.map((x) => x.id)),
  };
}

// A valid access token for this business (refreshes when it's within 7 days of expiring).
async function accessToken(env, biz) {
  if (isMock(env)) return "mock";
  if (biz.token_exp && biz.token_exp - Date.now() > 7 * DAY) return decrypt(env, biz.access_token);
  const t = await tokenCall(env, { grant_type: "refresh_token", refresh_token: await decrypt(env, biz.refresh_token) });
  const exp = Date.parse(t.expires_at) || Date.now() + 30 * DAY;
  await env.DB.prepare("UPDATE businesses SET access_token = ?2, refresh_token = ?3, token_exp = ?4 WHERE id = ?1")
    .bind(biz.id, await encrypt(env, t.access_token), await encrypt(env, t.refresh_token || (await decrypt(env, biz.refresh_token))), exp).run();
  return t.access_token;
}

export async function revoke(env, biz) {
  if (isMock(env)) return;
  try {
    await fetch(`${base(env)}/oauth2/revoke`, { method: "POST", headers: { "content-type": "application/json", authorization: `Client ${env.SQUARE_APP_SECRET}` },
      body: JSON.stringify({ client_id: env.SQUARE_APP_ID, access_token: await decrypt(env, biz.access_token) }) });
  } catch {}
}

async function sq(env, tok, path, body) {
  const r = await fetch(`${base(env)}/v2${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Square ${path}: ${j.errors?.[0]?.detail || r.status}`);
  return j;
}

const custRow = (biz, c) => ({
  id: `${biz.id}:${c.ext_id}`, ext_id: c.ext_id, first_name: c.first_name || null, last_name: c.last_name || null,
  email: c.email ? String(c.email).toLowerCase().trim() : null, phone: c.phone || null, provider_unsub: c.provider_unsub ? 1 : 0,
});

async function saveCustomers(env, biz, list) {
  const stmts = list.map((c) => {
    const x = custRow(biz, c);
    return env.DB.prepare(`INSERT INTO customers (id, biz_id, ext_id, first_name, last_name, email, phone, provider_unsub, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(id) DO UPDATE SET first_name = ?4, last_name = ?5, email = ?6, phone = ?7, provider_unsub = ?8`)
      .bind(x.id, biz.id, x.ext_id, x.first_name, x.last_name, x.email, x.phone, x.provider_unsub, Date.now());
  });
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
}

async function saveVisits(env, biz, list) {
  // A visit = one paid sale. Keyed by order id; a later payment can fill in the customer.
  const stmts = list.map((o) => env.DB.prepare(`INSERT INTO visits (id, biz_id, customer_id, at, amount_cents, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(id) DO UPDATE SET customer_id = COALESCE(visits.customer_id, ?3)`)
    .bind(`${biz.id}:${o.id}`, biz.id, o.customer_ext ? `${biz.id}:${o.customer_ext}` : null, o.at, o.amount_cents || 0, o.source || "order"));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
}

// One sync pass. Pulls a limited number of pages per run (Worker limits), keeping cursors in sync_state,
// so the first full import of 2 years finishes over a few runs. Returns true when fully caught up.
export async function sync(env, biz, pagesPerRun = 12) {
  const state = JSON.parse(biz.sync_state || "{}");
  const now = Date.now();
  if (isMock(env)) return mockSync(env, biz, state);

  const tok = await accessToken(env, biz);
  let pages = 0;
  // 1) Customers (full list first time, then only recently updated).
  if (!state.custDone) {
    do {
      const j = await sq(env, tok, `/customers?limit=100${state.custCursor ? `&cursor=${encodeURIComponent(state.custCursor)}` : ""}`);
      await saveCustomers(env, biz, (j.customers || []).map(sqCustomer));
      state.custCursor = j.cursor || null; pages++;
    } while (state.custCursor && pages < pagesPerRun);
    if (!state.custCursor) { state.custDone = true; state.custSince = now; }
  } else if (pages < pagesPerRun) {
    const j = await sq(env, tok, "/customers/search", { limit: 100, query: { filter: { updated_at: { start_at: new Date(state.custSince - DAY).toISOString() } } } });
    await saveCustomers(env, biz, (j.customers || []).map(sqCustomer)); pages++;
    state.custSince = now;
  }
  // 2) Completed orders (visits), oldest first, from 2 years back.
  const locs = JSON.parse(biz.location_ids || "[]");
  state.ordFrom = state.ordFrom || now - 730 * DAY;
  for (let li = 0; li < locs.length && pages < pagesPerRun; li += 10) {
    let more = true;
    while (more && pages < pagesPerRun) {
      const j = await sq(env, tok, "/orders/search", {
        location_ids: locs.slice(li, li + 10), limit: 500, cursor: state.ordCursor || undefined, return_entries: false,
        query: { filter: { state_filter: { states: ["COMPLETED"] }, date_time_filter: { closed_at: { start_at: new Date(state.ordFrom).toISOString() } } }, sort: { sort_field: "CLOSED_AT", sort_order: "ASC" } },
      });
      await saveVisits(env, biz, (j.orders || []).map((o) => ({ id: o.id, customer_ext: o.customer_id || null, at: Date.parse(o.closed_at || o.created_at), amount_cents: o.total_money?.amount || 0 })));
      state.ordCursor = j.cursor || null; pages++; more = !!j.cursor;
    }
  }
  // 3) Payments, to attach customers to sales whose order had none.
  state.payFrom = state.payFrom || now - 730 * DAY;
  let payMore = pages < pagesPerRun;
  while (payMore && pages < pagesPerRun) {
    const j = await sq(env, tok, `/payments?sort_order=ASC&limit=100&begin_time=${encodeURIComponent(new Date(state.payFrom).toISOString())}${state.payCursor ? `&cursor=${encodeURIComponent(state.payCursor)}` : ""}`);
    const ps = (j.payments || []).filter((p) => p.status === "COMPLETED" && p.customer_id);
    await saveVisits(env, biz, ps.map((p) => ({ id: p.order_id || p.id, customer_ext: p.customer_id, at: Date.parse(p.created_at), amount_cents: p.amount_money?.amount || 0, source: "payment" })));
    state.payCursor = j.cursor || null; pages++; payMore = !!j.cursor;
  }
  const caughtUp = state.custDone && !state.ordCursor && !state.payCursor;
  if (caughtUp) { state.ordFrom = now - 3 * DAY; state.payFrom = now - 3 * DAY; } // next runs: just the last few days
  await env.DB.prepare("UPDATE businesses SET sync_state = ?2, synced_at = ?3 WHERE id = ?1").bind(biz.id, JSON.stringify(state), now).run();
  return caughtUp;
}

const sqCustomer = (c) => ({
  ext_id: c.id, first_name: c.given_name, last_name: c.family_name, email: c.email_address, phone: c.phone_number,
  provider_unsub: c.preferences?.email_unsubscribed ? 1 : 0,
});

// Mock: import the fake studio once, then simulate a share of contacted customers coming back.
async function mockSync(env, biz, state) {
  const now = Date.now();
  if (!state.mockDone) {
    const { customers, orders } = mockData(biz.created_at, 42);
    await saveCustomers(env, biz, customers);
    await saveVisits(env, biz, orders);
    state.mockDone = true;
    await logEvent(env, biz.id, "sync", `Imported ${customers.length} customers and ${orders.length} sales`);
  } else {
    // ~22% of contacted (and ~7% of held-back) customers come back 2-9 days after the first email.
    const enr = await env.DB.prepare("SELECT id, customer_id, enrolled_at, holdout FROM enrollments WHERE biz_id = ?1 AND status IN ('active','done','held','stopped')").bind(biz.id).all();
    const add = [];
    for (const e of enr.results) {
      const b = await bucket("ret2" + e.customer_id);
      const delay = (2 + (b % 8)) * DAY;
      if (b < (e.holdout ? 7 : 22) && now > e.enrolled_at + delay) {
        add.push({ id: "RET" + e.id, customer_ext: e.customer_id.split(":").pop(), at: e.enrolled_at + delay, amount_cents: [3200, 3500, 15900, 18900][b % 4] });
      }
    }
    if (add.length) await saveVisits(env, biz, add);
  }
  await env.DB.prepare("UPDATE businesses SET sync_state = ?2, synced_at = ?3 WHERE id = ?1").bind(biz.id, JSON.stringify(state), now).run();
  return true;
}
