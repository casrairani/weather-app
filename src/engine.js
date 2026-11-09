// The engine: recompute rhythms, enrol overdue customers, send due emails, match verified returns, work out fees.

import { DAY, randomId, bucket, localParts, plural } from "./util.js";
import { profile, CAMPAIGNS, RULES } from "./rhythm.js";
import { logEvent } from "./db.js";
import { buildEmail, sendEmail, STEP_DAYS, DEFAULT_OFFERS } from "./email.js";

export const RETURN_WINDOW_DAYS = 30;
export const COOLDOWN_DAYS = 60;   // never enrol the same person twice within 60 days
export const HOLDOUT_PCT = 10;     // 10% of eligible people get no email: the honest comparison group

// 1) Recompute every customer's rhythm and segment from their visits. Only changed customers are written.
export async function recompute(env, biz, now = Date.now()) {
  const [vis, cur] = await env.DB.batch([
    env.DB.prepare("SELECT customer_id, at, amount_cents, item FROM visits WHERE biz_id = ?1 AND customer_id IS NOT NULL").bind(biz.id),
    env.DB.prepare("SELECT id, visits, last_visit, cycle_days, segment, total_cents FROM customers WHERE biz_id = ?1").bind(biz.id),
  ]);
  const by = new Map();
  for (const r of vis.results) { if (!by.has(r.customer_id)) by.set(r.customer_id, []); by.get(r.customer_id).push(r); }
  const stmts = [];
  for (const c of cur.results) {
    const p = by.has(c.id) ? profile(by.get(c.id), now) : { visits: 0, segment: "none", first: null, last: null, cycle: null, avg_cents: 0, total_cents: 0 };
    if (c.visits === p.visits && c.last_visit === p.last && c.segment === p.segment && c.cycle_days === p.cycle && c.total_cents === p.total_cents) continue;
    stmts.push(env.DB.prepare("UPDATE customers SET visits = ?2, first_visit = ?3, last_visit = ?4, cycle_days = ?5, avg_cents = ?6, total_cents = ?7, segment = ?8, updated_at = ?9 WHERE id = ?1")
      .bind(c.id, p.visits, p.first, p.last, p.cycle, p.avg_cents, p.total_cents, p.segment, now));
  }
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  return stmts.length;
}

// Who could be emailed right now for a campaign (before the daily cap and holdout).
export async function eligible(env, biz, kind, now = Date.now(), limit = 500) {
  const seg = CAMPAIGNS[kind].segment;
  return (await env.DB.prepare(`SELECT c.* FROM customers c
      WHERE c.biz_id = ?1 AND c.segment = ?2 AND c.email IS NOT NULL AND c.provider_unsub = 0
        AND c.last_visit > ?3
        AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.customer_id = c.id AND e.enrolled_at > ?4)
        AND NOT EXISTS (SELECT 1 FROM consents k WHERE k.customer_id = c.id AND k.channel = 'email' AND k.status = 'opt_out')
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = c.id AND b.start_at > ?6 AND b.status IN ('ACCEPTED','PENDING'))
      ORDER BY c.total_cents DESC LIMIT ?5`)
    .bind(biz.id, seg, now - RULES.maxAgeDays * DAY, now - COOLDOWN_DAYS * DAY, limit, now).all()).results;
}

// 2) Enrol eligible customers into switched-on campaigns, up to the daily cap.
export async function enroll(env, biz, now = Date.now()) {
  if (!biz.autopilot || !biz.terms_at) return 0;
  const today = (await env.DB.prepare("SELECT COUNT(*) n FROM enrollments WHERE biz_id = ?1 AND enrolled_at > ?2").bind(biz.id, now - DAY).first()).n;
  let room = Math.max(0, (biz.daily_cap || 60) - today);
  if (!room) return 0;
  const camps = (await env.DB.prepare("SELECT kind FROM campaigns WHERE biz_id = ?1 AND enabled = 1").bind(biz.id).all()).results.map((r) => r.kind);
  let n = 0;
  for (const kind of ["trial", "overdue", "one_timer", "lost"].filter((k) => camps.includes(k))) {
    if (!room) break;
    const people = await eligible(env, biz, kind, now, room);
    const stmts = [];
    for (const c of people) {
      const hold = (await bucket(`${biz.id}|${c.id}|${new Date(now).toISOString().slice(0, 7)}`)) < HOLDOUT_PCT ? 1 : 0;
      const id = randomId(10);
      stmts.push(env.DB.prepare(`INSERT INTO enrollments (id, biz_id, customer_id, campaign, holdout, enrolled_at, last_visit_before, cycle_before, step, next_at, status)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)`).bind(id, biz.id, c.id, kind, hold, now, c.last_visit, c.cycle_days, hold ? null : now, hold ? "held" : "active"));
      stmts.push(env.DB.prepare("INSERT INTO links (token, enrollment_id, biz_id, customer_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(randomId(16), id, biz.id, c.id, now));
      room--; n++;
    }
    for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  }
  if (n) await logEvent(env, biz.id, "enrolled", `${plural(n, "customer")} added to campaigns`, now);
  return n;
}

// Business hours for sending: 9am-6pm, Monday to Saturday, in the business's time zone.
export function inSendWindow(biz, now = Date.now()) {
  const { hour, weekday } = localParts(now, biz.timezone || "America/Vancouver");
  return weekday !== "Sun" && hour >= 9 && hour < 18;
}

// 3) Send every email that's due. Skips anyone who came back or unsubscribed. 2 reads + 1 batched write per run.
export async function sendDue(env, biz, site, now = Date.now(), force = false) {
  if (!force && !inSendWindow(biz, now)) return 0;
  const due = (await env.DB.prepare(`SELECT e.*, c.first_name, c.email, c.last_visit, l.token,
        EXISTS (SELECT 1 FROM consents k WHERE k.customer_id = e.customer_id AND k.channel = 'email' AND k.status = 'opt_out') unsub,
        EXISTS (SELECT 1 FROM visits v WHERE v.customer_id = e.customer_id AND v.at > e.enrolled_at AND v.at <= ?2) back,
        EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = e.customer_id AND b.start_at > ?2 AND b.status IN ('ACCEPTED','PENDING')) booked
      FROM enrollments e JOIN customers c ON c.id = e.customer_id JOIN links l ON l.enrollment_id = e.id
      WHERE e.biz_id = ?1 AND e.status = 'active' AND e.next_at <= ?2 ORDER BY e.next_at LIMIT 40`).bind(biz.id, now).all()).results;
  if (!due.length) return 0;
  const offers = Object.fromEntries((await env.DB.prepare("SELECT kind, offer FROM campaigns WHERE biz_id = ?1").bind(biz.id).all()).results.map((r) => [r.kind, r.offer]));
  const simulate = biz.id === "demo" || env.SQUARE_MOCK === "1"; // never email fake customers
  const writes = [];
  let sent = 0;
  for (const e of due) {
    if (e.unsub || e.back || e.booked || !e.email) { // booked or back: stop emailing; the paid visit is matched in matchReturns
      writes.push(env.DB.prepare("UPDATE enrollments SET status = ?2, next_at = NULL WHERE id = ?1").bind(e.id, e.unsub ? "unsub" : e.back || e.booked ? "done" : "stopped"));
      continue;
    }
    const links = { book: `${site}/r/${e.token}`, unsub: `${site}/u/${e.token}`, optin: `${site}/t/${e.token}` };
    const daysSince = Math.round((now - (e.last_visit || now)) / DAY);
    const m = buildEmail({ biz, customer: e, campaign: e.campaign, step: e.step, offer: offers[e.campaign] ?? DEFAULT_OFFERS[e.campaign], links, daysSince });
    const r = simulate ? { ok: true } : await sendEmail(env, { to: e.email, fromName: biz.name, replyTo: biz.reply_email, subject: m.subject, html: m.html, text: m.text, unsub: links.unsub });
    const nextStep = e.step + 1, more = nextStep < STEP_DAYS.length;
    writes.push(env.DB.prepare("INSERT INTO messages (id, biz_id, enrollment_id, customer_id, channel, step, subject, sent_at, ok) VALUES (?1, ?2, ?3, ?4, 'email', ?5, ?6, ?7, ?8)")
      .bind(randomId(10), biz.id, e.id, e.customer_id, e.step, m.subject, now, r.ok ? 1 : 0));
    // On a failed send, try again next run (same step).
    if (r.ok) writes.push(env.DB.prepare("UPDATE enrollments SET step = ?2, next_at = ?3, status = ?4 WHERE id = ?1")
      .bind(e.id, nextStep, more ? e.enrolled_at + STEP_DAYS[nextStep] * DAY : null, more ? "active" : "done"));
    if (r.ok) sent++;
  }
  for (let i = 0; i < writes.length; i += 80) await env.DB.batch(writes.slice(i, i + 80));
  if (sent) await logEvent(env, biz.id, "sent", `${plural(sent, "email")} sent`, now);
  return sent;
}

const monthOf = (ts) => new Date(ts).toISOString().slice(0, 7);

// 4) Verified returns: the first paid sale in Square within 30 days of enrolment. Fee only for emailed customers,
// capped per month. 2 reads + 1 batched write per run.
export async function matchReturns(env, biz, now = Date.now()) {
  const rows = (await env.DB.prepare(`SELECT e.id, e.holdout, v.at, v.amount_cents FROM enrollments e
      JOIN visits v ON v.customer_id = e.customer_id AND v.at > e.enrolled_at AND v.at <= MIN(?3, e.enrolled_at + ?4)
      WHERE e.biz_id = ?1 AND e.returned_at IS NULL AND e.status IN ('active','done','held','stopped') AND e.enrolled_at > ?2
      ORDER BY v.at`).bind(biz.id, now - (RETURN_WINDOW_DAYS + 2) * DAY, now, RETURN_WINDOW_DAYS * DAY).all()).results;
  const first = new Map();
  for (const r of rows) if (!first.has(r.id)) first.set(r.id, r);
  const writes = [];
  if (first.size) {
    const used = Object.fromEntries((await env.DB.prepare("SELECT fee_month m, COALESCE(SUM(fee_cents),0) s FROM enrollments WHERE biz_id = ?1 AND fee_month IS NOT NULL GROUP BY fee_month").bind(biz.id).all()).results.map((r) => [r.m, r.s]));
    for (const r of first.values()) {
      const month = monthOf(r.at);
      let fee = 0;
      if (!r.holdout) {
        fee = Math.max(biz.fee_min_cents ?? 500, Math.round((r.amount_cents || 0) * (biz.fee_pct ?? 0.12)));
        fee = Math.max(0, Math.min(fee, (biz.fee_cap_cents ?? 50000) - (used[month] || 0)));
        used[month] = (used[month] || 0) + fee;
      }
      writes.push(env.DB.prepare("UPDATE enrollments SET returned_at = ?2, return_cents = ?3, fee_cents = ?4, fee_month = ?5, status = ?6, next_at = NULL WHERE id = ?1")
        .bind(r.id, r.at, r.amount_cents || 0, fee, month, r.holdout ? "held_returned" : "returned"));
    }
  }
  // Window closed without a return.
  writes.push(env.DB.prepare("UPDATE enrollments SET status = 'expired', next_at = NULL WHERE biz_id = ?1 AND returned_at IS NULL AND status IN ('active','done','held','stopped') AND enrolled_at < ?2")
    .bind(biz.id, now - RETURN_WINDOW_DAYS * DAY));
  for (let i = 0; i < writes.length; i += 80) await env.DB.batch(writes.slice(i, i + 80));
  if (first.size) await logEvent(env, biz.id, "returned", `${plural(first.size, "customer")} came back and paid`, now);
  return first.size;
}

// Numbers for the dashboard.
export async function stats(env, biz, now = Date.now()) {
  const q = (sql, ...b) => env.DB.prepare(sql).bind(biz.id, ...b).first();
  const all = (sql, ...b) => env.DB.prepare(sql).bind(biz.id, ...b).all().then((r) => r.results);
  const month = monthOf(now);
  const seg = Object.fromEntries((await all("SELECT segment, COUNT(*) n, SUM(CASE WHEN email IS NOT NULL AND provider_unsub = 0 THEN 1 ELSE 0 END) reach FROM customers WHERE biz_id = ?1 GROUP BY segment"))
    .map((r) => [r.segment, { n: r.n, reach: r.reach }]));
  const t = await q(`SELECT
      SUM(CASE WHEN holdout = 0 THEN 1 ELSE 0 END) treated,
      SUM(CASE WHEN holdout = 0 AND returned_at IS NOT NULL THEN 1 ELSE 0 END) treated_back,
      SUM(CASE WHEN holdout = 1 THEN 1 ELSE 0 END) held,
      SUM(CASE WHEN holdout = 1 AND returned_at IS NOT NULL THEN 1 ELSE 0 END) held_back,
      SUM(CASE WHEN holdout = 0 THEN COALESCE(return_cents,0) ELSE 0 END) revenue,
      SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) clicks
    FROM enrollments WHERE biz_id = ?1`);
  const m = await q("SELECT COUNT(*) back, COALESCE(SUM(return_cents),0) revenue, COALESCE(SUM(fee_cents),0) fees FROM enrollments WHERE biz_id = ?1 AND holdout = 0 AND fee_month = ?2", month);
  const sent = (await q("SELECT COUNT(*) n FROM messages WHERE biz_id = ?1 AND ok = 1")).n;
  const bookedAhead = (await q("SELECT COUNT(DISTINCT customer_id) n FROM bookings WHERE biz_id = ?1 AND start_at > ?2 AND status IN ('ACCEPTED','PENDING')", now)).n;
  const rate = (a, b) => (b ? a / b : 0);
  return {
    seg, sent, month, bookedAhead,
    treated: t.treated || 0, treatedBack: t.treated_back || 0, held: t.held || 0, heldBack: t.held_back || 0,
    revenue: t.revenue || 0, clicks: t.clicks || 0,
    treatedRate: rate(t.treated_back || 0, t.treated || 0), heldRate: rate(t.held_back || 0, t.held || 0),
    monthBack: m.back, monthRevenue: m.revenue, monthFees: m.fees,
  };
}

// The Leak Report: a realistic yearly win-back from people who stopped coming or never joined.
// Deliberately conservative: assumes only a small share comes back (LEAK_RATES), so the number holds up in front of an owner.
export const LEAK_RATES = { trial: 0.10, overdue: 0.10, lost: 0.03, one_timer: 0.03 };
// Only counts people we're allowed to email (have an email, not unsubscribed, bought in the last 2 years).
// Overdue and lost regulars: what they used to spend in a year (average sale x visits per year).
// Intro buyers and one-time visitors: what a typical regular spends in a year, since that's what they'd be worth if they stayed.
export async function leak(env, biz) {
  const rows = (await env.DB.prepare(`SELECT segment, COUNT(*) n,
      SUM(CASE WHEN cycle_days > 0 THEN avg_cents * 365.0 / cycle_days ELSE 0 END) yearly
    FROM customers WHERE biz_id = ?1 AND email IS NOT NULL AND provider_unsub = 0 AND segment IN ('trial','overdue','lost','one_timer')
      AND NOT EXISTS (SELECT 1 FROM consents k WHERE k.customer_id = customers.id AND k.channel = 'email' AND k.status = 'opt_out')
    GROUP BY segment`).bind(biz.id).all()).results;
  const regs = (await env.DB.prepare("SELECT avg_cents * 365.0 / cycle_days v FROM customers WHERE biz_id = ?1 AND segment IN ('active','overdue') AND cycle_days > 0 AND avg_cents > 0").bind(biz.id).all()).results.map((r) => r.v).sort((a, b) => a - b);
  const dollars = (c) => Math.round(c / 100) * 100; // estimates: whole dollars only
  const typical = regs.length >= 5 ? dollars(regs[regs.length >> 1]) : 0;
  const by = Object.fromEntries(rows.map((r) => [r.segment, r]));
  const line = (k, own) => {
    const r = by[k] || { n: 0, yearly: 0 };
    const worth = Math.round(own ? r.yearly : r.n * typical); // what they spend(t) in a year as regulars
    return { k, n: r.n, worth, rate: LEAK_RATES[k], cents: dollars(worth * LEAK_RATES[k]) };
  };
  const lines = [line("trial", false), line("overdue", true), line("lost", true), line("one_timer", false)];
  const sum = (f) => lines.reduce((a, l) => a + f(l), 0);
  return { lines, total: sum((l) => l.cents), worth: sum((l) => l.worth), typical, people: sum((l) => l.n) };
}

export async function ensureCampaigns(env, biz) {
  await env.DB.batch(Object.keys(CAMPAIGNS).map((k) => env.DB.prepare("INSERT OR IGNORE INTO campaigns (biz_id, kind, enabled, offer) VALUES (?1, ?2, 0, ?3)").bind(biz.id, k, DEFAULT_OFFERS[k])));
}

// One full pass for one business (cron).
export async function run(env, biz, site, { sync, now = Date.now(), force = false } = {}) {
  if (sync && biz.provider === "square") await sync(env, biz);
  await recompute(env, biz, now);
  await matchReturns(env, biz, now);
  await enroll(env, biz, now);
  await sendDue(env, biz, site, now, force);
}
