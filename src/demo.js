// Public demo: a sample studio with simulated Square data and 30 days of real engine history.
// Built in small steps (a few days of history per request, inside Cloudflare's per-request limits),
// then kept current by shifting all its timestamps forward, so the demo always looks like "today".

import { DAY } from "./util.js";
import { sync } from "./square.js";
import { recompute, enroll, sendDue, matchReturns, ensureCampaigns } from "./engine.js";

const ID = "demo";
const HISTORY = 30;

const get = (env) => env.DB.prepare("SELECT * FROM businesses WHERE id = ?1").bind(ID).first();

export async function resetDemo(env) {
  await env.DB.batch(["customers", "visits", "enrollments", "messages", "links", "events", "campaigns", "consents"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE biz_id = ?1`).bind(ID)));
  await env.DB.prepare("DELETE FROM businesses WHERE id = ?1").bind(ID).run();
}

// Returns { biz, ready }. Call on every /demo request; does a bounded amount of work.
export async function demoStep(env, site) {
  let biz = await get(env);
  const mockEnv = { ...env, SQUARE_MOCK: "1", RESEND_KEY: "" };
  if (!biz) {
    const start = Date.now() - HISTORY * DAY;
    await env.DB.prepare(`INSERT INTO businesses (id, owner_id, name, provider, merchant_id, currency, timezone, address, phone, website, booking_url, autopilot, daily_cap, terms_at, list_confirmed_at, status, sync_state, created_at)
      VALUES (?1, 'demo', 'Kits Pilates Studio', 'square', 'DEMO', 'CAD', 'America/Vancouver', '2190 W 4th Ave, Vancouver, BC V6K 1N7', '(604) 555-0142', 'https://kitspilates.example', 'https://kitspilates.example/book', 1, 20, ?2, ?2, 'demo', '{}', ?2)`).bind(ID, start).run();
    biz = await get(env);
    await ensureCampaigns(env, biz);
    await env.DB.prepare("UPDATE campaigns SET enabled = 1 WHERE biz_id = ?1").bind(ID).run();
    await sync(mockEnv, biz); // imports the sample customers and 2 years of sales
    await env.DB.prepare("UPDATE businesses SET sync_state = ?2 WHERE id = ?1").bind(ID, JSON.stringify({ mockDone: true, day: HISTORY })).run();
    return { biz: await get(env), ready: false };
  }
  const st = JSON.parse(biz.sync_state || "{}");
  const demoNow = biz.created_at + HISTORY * DAY;
  if (!st.done) {
    // Replay up to 5 days per request: each day enrol a few overdue customers and send what's due.
    for (let k = 0; k < 5 && st.day >= 1; k++, st.day--) {
      const t = demoNow - st.day * DAY;
      if (st.day === HISTORY || st.day % 3 === 0) await recompute(env, biz, t);
      await enroll(env, biz, t);
      await sendDue(mockEnv, biz, site, t, true);
    }
    if (st.day < 1 && st.rday == null) { await sync(mockEnv, biz); st.rday = HISTORY - 1; } // simulated returns
    else if (st.rday != null) {
      // Match returns day by day (10 days per request) so they appear on the day they happened.
      for (let k = 0; k < 10 && st.rday >= 0; k++, st.rday--) await matchReturns(env, biz, demoNow - st.rday * DAY);
      if (st.rday < 0) {
        await recompute(env, biz, demoNow);
        await env.DB.prepare("UPDATE businesses SET synced_at = ?2 WHERE id = ?1").bind(ID, demoNow - 12 * 60000).run();
        st.done = true;
      }
    }
    await env.DB.prepare("UPDATE businesses SET sync_state = ?2 WHERE id = ?1").bind(ID, JSON.stringify(st)).run();
    return { biz: await get(env), ready: !!st.done };
  }
  // Keep it fresh: move every timestamp forward so the demo's "now" is the real now.
  const delta = Date.now() - demoNow;
  if (delta > 3600000) {
    const sh = (t, cols) => env.DB.prepare(`UPDATE ${t} SET ${cols.map((c) => `${c} = ${c} + ?2`).join(", ")} WHERE biz_id = ?1`).bind(ID, delta);
    await env.DB.batch([
      sh("visits", ["at"]),
      sh("customers", ["first_visit", "last_visit", "updated_at"]),
      sh("enrollments", ["enrolled_at", "next_at", "clicked_at", "returned_at", "last_visit_before"]),
      env.DB.prepare("UPDATE enrollments SET fee_month = strftime('%Y-%m', returned_at / 1000, 'unixepoch') WHERE biz_id = ?1 AND returned_at IS NOT NULL").bind(ID),
      sh("messages", ["sent_at"]),
      sh("consents", ["at"]),
      sh("links", ["created_at"]),
      sh("events", ["at"]),
      env.DB.prepare("UPDATE businesses SET created_at = created_at + ?2, synced_at = synced_at + ?2, terms_at = terms_at + ?2, list_confirmed_at = list_confirmed_at + ?2 WHERE id = ?1").bind(ID, delta),
    ]);
    biz = await get(env);
  }
  return { biz, ready: true };
}
