// Rebooked: brings past customers back to businesses on Square.
// Routes, owner sign-in, Square connect, public email links (book / unsubscribe / text opt-in), demo, and the cron.

import { html, json, redirect, cookie, setCookie, randomId, sha256, encrypt, isEmail, esc, DAY } from "./util.js";
import { tables, logEvent } from "./db.js";
import { page, simple } from "./ui.js";
import { home, terms, privacy } from "./pages.js";
import { dashboard, customers, preview, connectPage } from "./app.js";
import { authorizeUrl, exchange, sync, revoke } from "./square.js";
import { run, recompute, ensureCampaigns } from "./engine.js";
import { demoStep, resetDemo } from "./demo.js";
import { ownerEmail } from "./email.js";
import { CAMPAIGNS } from "./rhythm.js";

const SID = "rb_s";
const siteOf = (env, url) => (env.SITE_URL || url.origin).replace(/\/$/, "");
const secure = (env) => env.DEV !== "1";

/* ---------- owners & sessions ---------- */
async function currentOwner(env, req) {
  const t = cookie(req, SID);
  if (!t) return null;
  const s = await env.DB.prepare("SELECT o.* FROM sessions s JOIN owners o ON o.id = s.owner_id WHERE s.token_hash = ?1 AND s.exp > ?2").bind(await sha256(t), Date.now()).first();
  return s || null;
}
async function startSession(env, ownerId) {
  const t = randomId(24);
  await env.DB.prepare("INSERT INTO sessions (token_hash, owner_id, exp) VALUES (?1, ?2, ?3)").bind(await sha256(t), ownerId, Date.now() + 60 * DAY).run();
  return setCookie(SID, t, 60 * 86400, secure(env));
}
const bizOf = (env, ownerId) => env.DB.prepare("SELECT * FROM businesses WHERE owner_id = ?1 AND status = 'connected' ORDER BY created_at DESC LIMIT 1").bind(ownerId).first();
const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/app");

/* ---------- public email links ---------- */
async function linkCtx(env, token) {
  return env.DB.prepare(`SELECT l.*, b.name biz_name, b.booking_url, b.website, b.address, c.first_name, c.phone FROM links l
    JOIN businesses b ON b.id = l.biz_id JOIN customers c ON c.id = l.customer_id WHERE l.token = ?1`).bind(token).first();
}

async function handleLinks(env, req, p) {
  const m = p.match(/^\/(r|u|t)\/([a-f0-9]{32})$/);
  if (!m) return null;
  const [, kind, token] = m;
  const L = await linkCtx(env, token);
  if (!L) return html(simple("Link expired", `<h1 style="font-size:26px">This link has expired</h1><p class="muted">It may be old or already used.</p>`), 404);
  const ip = req.headers.get("cf-connecting-ip") || "", ua = (req.headers.get("user-agent") || "").slice(0, 200);

  if (kind === "r") { // tracked "Book your next visit"
    await env.DB.prepare("UPDATE enrollments SET clicked_at = COALESCE(clicked_at, ?2) WHERE id = ?1").bind(L.enrollment_id, Date.now()).run();
    const to = L.booking_url || L.website;
    return to ? redirect(to) : html(simple(L.biz_name, `<h1 style="font-size:26px">Book with ${esc(L.biz_name)}</h1><p class="muted">Call or visit ${esc(L.address || "")} to book your next visit.</p>`));
  }
  if (kind === "u") { // unsubscribe (GET shows a button; POST unsubscribes, incl. one-click from mail apps)
    if (req.method === "POST") {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO consents (id, biz_id, customer_id, channel, status, source, ip, ua, at) VALUES (?1, ?2, ?3, 'email', 'opt_out', 'unsubscribe_link', ?4, ?5, ?6)").bind(randomId(10), L.biz_id, L.customer_id, ip, ua, Date.now()),
        env.DB.prepare("UPDATE enrollments SET status = 'unsub', next_at = NULL WHERE customer_id = ?1 AND status IN ('active','done')").bind(L.customer_id),
      ]);
      await logEvent(env, L.biz_id, "unsub", "A customer unsubscribed");
      return html(simple("Unsubscribed", `<h1 style="font-size:26px">You're unsubscribed</h1><p class="muted">${esc(L.biz_name)} won't send you these emails anymore.</p>`));
    }
    return html(simple("Unsubscribe", `<h1 style="font-size:26px">Unsubscribe from ${esc(L.biz_name)}?</h1><p class="muted">You'll stop getting these emails right away.</p><form method="post"><button class="btn">Unsubscribe</button></form>`));
  }
  // kind === "t": text opt-in, the only way anyone gets texts
  const WORDING = `I agree to receive text messages from ${L.biz_name} about openings and offers, sent through Rebooked. Up to 4 messages a month. Message and data rates may apply. Reply STOP to opt out, HELP for help.`;
  if (req.method === "POST") {
    const f = await req.formData().catch(() => new FormData());
    const phone = String(f.get("phone") || "").replace(/[^\d+]/g, "");
    if (f.get("agree") !== "yes" || phone.replace(/\D/g, "").length < 10) {
      return html(simple("Get texts", `<h1 style="font-size:24px">Almost there</h1><p class="muted">Please enter a valid mobile number and tick the box.</p><p><a href="/t/${token}">Go back</a></p>`), 400);
    }
    await env.DB.prepare("INSERT INTO consents (id, biz_id, customer_id, channel, status, source, wording, phone, ip, ua, at) VALUES (?1, ?2, ?3, 'sms', 'opt_in', 'email_optin_page', ?4, ?5, ?6, ?7, ?8)")
      .bind(randomId(10), L.biz_id, L.customer_id, WORDING, phone, ip, ua, Date.now()).run();
    await logEvent(env, L.biz_id, "optin", "A customer opted in to texts");
    return html(simple("You're in", `<h1 style="font-size:26px">You're in</h1><p class="muted">${esc(L.biz_name)} can now text you about openings and offers. Reply STOP anytime to opt out.</p>`));
  }
  return html(simple(`Texts from ${L.biz_name}`, `<h1 style="font-size:26px">Get openings by text</h1><p class="muted" style="margin-bottom:18px">${esc(L.biz_name)} can text you when spots open up or there's an offer.</p>
    <form method="post"><label class="f" for="ph">Mobile number</label><input id="ph" type="tel" name="phone" autocomplete="tel" value="${esc(L.phone || "")}" required>
    <label style="display:flex;gap:10px;align-items:flex-start;margin:16px 0;font-size:14.5px;line-height:1.5"><input type="checkbox" name="agree" value="yes" required style="width:20px;height:20px;flex:none;margin-top:2px;accent-color:#2456F5"><span>${esc(WORDING)}</span></label>
    <button class="btn">Text me openings</button></form><p class="tiny muted" style="margin-top:14px">Optional. Not a condition of any purchase. <a href="/privacy">Privacy</a></p>`));
}

/* ---------- main fetch ---------- */
async function handle(req, env) {
  const url = new URL(req.url), p = url.pathname, site = siteOf(env, url);
  await tables(env);
  globalThis.__TEST_MODE = env.TEST_MODE === "1";

  if (req.method === "POST" && !p.startsWith("/u/")) { // same-origin check for every form post (one-click unsubscribe comes from mail apps)
    const o = req.headers.get("origin");
    if (o && o !== url.origin && o !== site) return html("Forbidden", 403);
  }

  if (p === "/") return html(home());
  if (p === "/terms") return html(terms());
  if (p === "/privacy") return html(privacy());
  if (p === "/health") return json({ ok: true });

  const link = await handleLinks(env, req, p);
  if (link) return link;

  /* demo */
  if (p === "/demo" || p.startsWith("/demo/")) {
    if (env.DEV === "1" && url.searchParams.get("count")) { // dev only: rebuild the demo and report D1 calls per request
      let calls = 0; const real = env.DB, per = [];
      const wrapS = (st) => ({ bind: (...a) => wrapS(st.bind(...a)), first: (...a) => { calls++; return st.first(...a); }, all: (...a) => { calls++; return st.all(...a); }, run: (...a) => { calls++; return st.run(...a); }, _st: st });
      const db = { prepare: (q) => wrapS(real.prepare(q)), batch: (arr) => { calls++; return real.batch(arr.map((x) => x._st || x)); } };
      await resetDemo(env);
      for (let i = 0; i < 20; i++) { calls = 0; const r = await demoStep({ ...env, DB: db }, site); per.push(calls); if (r.ready) break; }
      return json({ perRequest: per });
    }
    const { biz, ready } = await demoStep(env, site);
    if (!ready) return html(simple("Preparing the demo", `<h1 style="font-size:26px">Preparing the demo…</h1><p class="muted">Building 30 days of sample history. This page refreshes on its own.</p>`).replace("</head>", `<meta http-equiv="refresh" content="1"></head>`));
    if (p === "/demo") return html(await dashboard(env, biz, { demo: true, site }));
    if (p === "/demo/customers") return html(await customers(env, biz, url.searchParams.get("s"), true));
    const pm = p.match(/^\/demo\/preview\/(\w+)$/);
    if (pm) { const pg = await preview(env, biz, pm[1], true); if (pg) return html(pg); }
    return redirect("/demo");
  }

  /* sign in by email link */
  if (p === "/signin" && req.method === "GET") {
    const next = safeNext(url.searchParams.get("next"));
    return html(simple("Sign in · Rebooked", `<h1 style="font-size:28px;margin-bottom:6px">Sign in</h1><p class="muted" style="margin:0 0 18px">We'll email you a link. No password needed.</p>
      <form method="post" action="/signin"><input type="hidden" name="next" value="${esc(next)}"><label class="f" for="em">Work email</label><input id="em" type="email" name="email" autocomplete="email" required autofocus>
      <button class="btn" style="margin-top:14px;width:100%">Email me a sign-in link</button></form><p class="tiny muted" style="margin-top:14px">By continuing you agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.</p>`));
  }
  if (p === "/signin" && req.method === "POST") {
    const f = await req.formData().catch(() => new FormData());
    const email = String(f.get("email") || "").trim().toLowerCase();
    const next = safeNext(String(f.get("next") || "/app"));
    if (!isEmail(email)) return html(simple("Sign in", `<p>Please enter a valid email. <a href="/signin">Try again</a></p>`), 400);
    const t = randomId(24);
    await env.DB.prepare("INSERT INTO login_links (token_hash, email, exp) VALUES (?1, ?2, ?3)").bind(await sha256(t), email, Date.now() + 30 * 60000).run();
    const href = `${site}/auth?t=${t}&next=${encodeURIComponent(next)}`;
    if (env.RESEND_KEY) {
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: `Rebooked <${env.FROM_ADDRESS || "hello@send.rebooked.app"}>`, to: email, subject: "Your Rebooked sign-in link", html: ownerEmail("Sign in to Rebooked", "Tap the button to sign in. No password needed.", { text: "Sign in", href }), text: `Sign in to Rebooked: ${href}` }) });
    }
    const dev = (env.DEV === "1" || env.TEST_MODE === "1") && !env.RESEND_KEY ? `<p class="small" style="margin-top:14px">Test mode: <a href="${esc(href)}">open the sign-in link</a></p>` : "";
    return html(simple("Check your email", `<h1 style="font-size:26px">Check your email</h1><p class="muted">We sent a sign-in link to <b>${esc(email)}</b>. It works for 30 minutes.</p>${dev}`));
  }
  if (p === "/auth") {
    const t = url.searchParams.get("t") || "";
    const row = await env.DB.prepare("SELECT * FROM login_links WHERE token_hash = ?1 AND exp > ?2").bind(await sha256(t), Date.now()).first();
    if (!row) return html(simple("Link expired", `<h1 style="font-size:26px">That link has expired</h1><p><a href="/signin">Get a new one</a></p>`), 400);
    await env.DB.prepare("DELETE FROM login_links WHERE token_hash = ?1").bind(row.token_hash).run();
    let owner = await env.DB.prepare("SELECT * FROM owners WHERE email = ?1").bind(row.email).first();
    if (!owner) { owner = { id: randomId(10), email: row.email }; await env.DB.prepare("INSERT INTO owners (id, email, created_at) VALUES (?1, ?2, ?3)").bind(owner.id, owner.email, Date.now()).run(); }
    return redirect(safeNext(url.searchParams.get("next")), { "set-cookie": await startSession(env, owner.id) });
  }
  if (p === "/signout" && req.method === "POST") {
    const t = cookie(req, SID);
    if (t) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(t)).run();
    return redirect("/", { "set-cookie": setCookie(SID, "", 0, secure(env)) });
  }

  /* everything below needs a signed-in owner */
  const owner = await currentOwner(env, req);
  if (!owner) return redirect(`/signin?next=${encodeURIComponent(p)}`);

  if (p === "/square/connect") {
    const state = randomId(16);
    return redirect(authorizeUrl(env, site, state), { "set-cookie": setCookie("rb_oauth", state, 600, secure(env)) });
  }
  if (p === "/square/callback") {
    const state = url.searchParams.get("state"), code = url.searchParams.get("code");
    if (!code || !state || state !== cookie(req, "rb_oauth")) return html(simple("Square", `<h1 style="font-size:24px">Connection cancelled</h1><p class="muted">Square didn't connect. <a href="/app">Try again</a></p>`), 400);
    const info = await exchange(env, code, site);
    const existing = await env.DB.prepare("SELECT id FROM businesses WHERE owner_id = ?1 AND merchant_id = ?2").bind(owner.id, info.merchant_id).first();
    const id = existing?.id || randomId(10);
    const tokA = await encrypt(env, info.access_token), tokR = await encrypt(env, info.refresh_token);
    if (existing) {
      await env.DB.prepare("UPDATE businesses SET access_token = ?2, refresh_token = ?3, token_exp = ?4, status = 'connected', location_ids = ?5 WHERE id = ?1").bind(id, tokA, tokR, info.token_exp, info.location_ids).run();
    } else {
      await env.DB.prepare(`INSERT INTO businesses (id, owner_id, name, provider, merchant_id, sq_env, access_token, refresh_token, token_exp, location_ids, currency, timezone, address, phone, website, booking_url, reply_email, status, created_at)
        VALUES (?1, ?2, ?3, 'square', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 'connected', ?17)`)
        .bind(id, owner.id, info.name, info.merchant_id, env.SQUARE_ENV || "sandbox", tokA, tokR, info.token_exp, info.location_ids, info.currency, info.timezone, info.address, info.phone, info.website, info.booking_url, owner.email, Date.now()).run();
    }
    const biz = await env.DB.prepare("SELECT * FROM businesses WHERE id = ?1").bind(id).first();
    await ensureCampaigns(env, biz);
    await logEvent(env, id, "connected", "Connected to Square");
    try { await sync(env, biz); await recompute(env, await env.DB.prepare("SELECT * FROM businesses WHERE id = ?1").bind(id).first()); } catch (e) { await logEvent(env, id, "error", String(e.message || e)); }
    return redirect("/app?connected=1", { "set-cookie": setCookie("rb_oauth", "", 0, secure(env)) });
  }

  const biz = await bizOf(env, owner.id);
  if (p === "/app") {
    if (!biz) return html(connectPage(owner.email));
    const flash = url.searchParams.get("connected") ? "Square is connected. We've sorted your customers by their usual rhythm. Check the campaigns, then turn on autopilot when you're ready."
      : url.searchParams.get("saved") ? "Saved." : url.searchParams.get("ran") ? "Checked Square and sent anything that was due." : "";
    return html(await dashboard(env, biz, { flash, site }));
  }
  if (!biz) return redirect("/app");
  if (p === "/app/customers") return html(await customers(env, biz, url.searchParams.get("s"), false));
  const pm = p.match(/^\/app\/preview\/(\w+)$/);
  if (pm) { const pg = await preview(env, biz, pm[1], false); return pg ? html(pg) : redirect("/app"); }

  if (req.method === "POST") {
    const f = await req.formData().catch(() => new FormData());
    if (p === "/app/campaign") {
      const kind = String(f.get("kind")); if (!CAMPAIGNS[kind]) return redirect("/app");
      await env.DB.prepare("UPDATE campaigns SET enabled = ?3 WHERE biz_id = ?1 AND kind = ?2").bind(biz.id, kind, f.get("enabled") === "1" ? 1 : 0).run();
      return redirect("/app?saved=1");
    }
    if (p === "/app/offer") {
      const kind = String(f.get("kind")); if (!CAMPAIGNS[kind]) return redirect("/app");
      await env.DB.prepare("UPDATE campaigns SET offer = ?3 WHERE biz_id = ?1 AND kind = ?2").bind(biz.id, kind, String(f.get("offer") || "").slice(0, 140)).run();
      return redirect("/app?saved=1");
    }
    if (p === "/app/autopilot") {
      if (f.get("on") === "1") {
        if (!(f.get("list") && f.get("terms") && f.get("addr"))) return redirect("/app");
        if (!biz.address) return html(simple("Add your address", `<p>Please add your mailing address in Settings first. Every email must show it. <a href="/app">Back</a></p>`), 400);
        await env.DB.prepare("UPDATE businesses SET autopilot = 1, terms_at = COALESCE(terms_at, ?2), list_confirmed_at = ?2 WHERE id = ?1").bind(biz.id, Date.now()).run();
        const anyOn = await env.DB.prepare("SELECT COUNT(*) n FROM campaigns WHERE biz_id = ?1 AND enabled = 1").bind(biz.id).first();
        if (!anyOn.n) await env.DB.prepare("UPDATE campaigns SET enabled = 1 WHERE biz_id = ?1 AND kind = 'overdue'").bind(biz.id).run();
        await logEvent(env, biz.id, "autopilot", "Autopilot turned on");
      } else {
        await env.DB.prepare("UPDATE businesses SET autopilot = 0 WHERE id = ?1").bind(biz.id).run();
        await logEvent(env, biz.id, "autopilot", "Autopilot turned off");
      }
      return redirect("/app?saved=1");
    }
    if (p === "/app/settings") {
      const booking = String(f.get("booking_url") || "").trim(), reply = String(f.get("reply_email") || "").trim();
      await env.DB.prepare("UPDATE businesses SET booking_url = ?2, reply_email = ?3, address = ?4, daily_cap = ?5 WHERE id = ?1")
        .bind(biz.id, /^https?:\/\//.test(booking) ? booking : biz.booking_url, isEmail(reply) ? reply : biz.reply_email, String(f.get("address") || biz.address || "").slice(0, 200), Math.max(5, Math.min(300, Number(f.get("daily_cap")) || 60))).run();
      return redirect("/app?saved=1");
    }
    if (p === "/app/run") {
      await run(env, biz, site, { sync, force: env.DEV === "1" || env.TEST_MODE === "1" });
      return redirect("/app?ran=1");
    }
    if (p === "/app/disconnect") {
      await revoke(env, biz);
      await env.DB.prepare("UPDATE businesses SET status = 'disconnected', autopilot = 0, access_token = NULL, refresh_token = NULL WHERE id = ?1").bind(biz.id).run();
      await env.DB.prepare("UPDATE enrollments SET status = 'stopped', next_at = NULL WHERE biz_id = ?1 AND status = 'active'").bind(biz.id).run();
      return redirect("/app");
    }
    if (p === "/app/delete") {
      await revoke(env, biz);
      for (const t of ["customers", "visits", "enrollments", "messages", "links", "events", "campaigns", "consents"]) await env.DB.prepare(`DELETE FROM ${t} WHERE biz_id = ?1`).bind(biz.id).run();
      await env.DB.prepare("DELETE FROM businesses WHERE id = ?1").bind(biz.id).run();
      return html(simple("Deleted", `<h1 style="font-size:26px">All your data is deleted</h1><p class="muted">Square is disconnected and every customer record is gone.</p><p><a href="/">Home</a></p>`));
    }
  }
  return html(simple("Not found", `<h1 style="font-size:26px">Page not found</h1><p><a href="/">Home</a></p>`), 404);
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { console.error(e); return html(simple("Something went wrong", `<h1 style="font-size:24px">Something went wrong</h1><p class="muted">Please try again in a moment.</p>`), 500); }
  },
  // Every 30 minutes: for each connected business, sync Square, then enrol, send and match returns.
  async scheduled(event, env, ctx) {
    await tables(env);
    const site = (env.SITE_URL || "https://rebooked.app").replace(/\/$/, "");
    const list = (await env.DB.prepare("SELECT * FROM businesses WHERE status = 'connected'").all()).results;
    for (const biz of list) {
      try { await run(env, biz, site, { sync }); }
      catch (e) { await logEvent(env, biz.id, "error", String(e.message || e)); }
    }
  },
};
