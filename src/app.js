// Owner dashboard: results, who's waiting, campaigns, settings. Also used read-only for /demo.

import { page, LOGO } from "./ui.js";
import { esc, money, ago, plural } from "./util.js";
import { CAMPAIGNS, SEGMENT_LABEL } from "./rhythm.js";
import { stats, leak } from "./engine.js";
import { buildEmail, DEFAULT_OFFERS } from "./email.js";

const APP_CSS = `<style>
.top{padding:34px 0 8px;display:flex;gap:16px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}
.top h1{font-size:34px;font-weight:750}.top p{margin:6px 0 0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:22px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:18px 20px}
.kpi .v{font:750 34px/1.05 var(--fd);letter-spacing:-.03em;margin-top:8px}.kpi .l{font:600 13.5px/1.2 var(--f);color:var(--muted)}
.kpi .s{font-size:13px;color:var(--muted);margin-top:6px}.kpi.hl{background:var(--ink);color:#fff;border-color:var(--ink)}.kpi.hl .l,.kpi.hl .s{color:#AEB4C0}
h2.sh{font-size:22px;margin:40px 0 14px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.waiting{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.wcard{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:20px}
.wcard .n{font:750 40px/1 var(--fd);letter-spacing:-.03em}.wcard h3{font-size:17px;margin:10px 0 4px}.wcard p{margin:0;font-size:14.5px;color:var(--muted)}
.wcard .bar{height:6px;border-radius:9px;background:#EEF0F4;margin-top:14px;overflow:hidden}.wcard .bar i{display:block;height:100%;background:var(--blue);border-radius:9px}
.excl{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.camp{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:20px;margin-bottom:12px}
.camp h3{font-size:18px}.camp p{margin:4px 0 0;font-size:15px;color:var(--muted)}
.camp form.offer{grid-column:1/-1;display:flex;gap:10px;margin:0}.camp form.offer input{flex:1}
.auto{display:flex;gap:18px;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:20px 22px;margin-top:22px}
.auto h3{font-size:19px}.auto p{margin:4px 0 0;font-size:15px;color:var(--muted)}
.feed li{list-style:none;padding:11px 0;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;font-size:15px}.feed{margin:0;padding:0}.feed li:first-child{border-top:0}
.two{display:grid;grid-template-columns:1.25fr 1fr;gap:14px}
.lift{display:flex;gap:10px;align-items:flex-end;margin-top:14px}.lift .col{flex:1}.lift .b{border-radius:10px 10px 4px 4px;background:var(--blue)}.lift .b.h{background:#C9CFDA}.lift .col div:last-child{font-size:13px;color:var(--muted);margin-top:8px}
.demo-bar{background:var(--ink);color:#fff;font-size:14.5px;padding:10px 0}.demo-bar .wrap{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}.demo-bar a{color:#fff;font-weight:600}
.setgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
dialog{border:0;border-radius:22px;padding:0;max-width:520px;width:calc(100% - 32px);box-shadow:0 40px 80px -20px rgba(0,0,0,.35)}dialog::backdrop{background:rgba(11,18,32,.45)}
.chk{display:flex;gap:12px;align-items:flex-start;padding:12px 0;font-size:15px;border-top:1px solid var(--line)}.chk input{width:20px;height:20px;margin-top:2px;flex:none;accent-color:var(--blue)}
.leak{margin-top:22px;padding:26px 26px 20px}
.lk-head{display:flex;gap:24px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
.lk-l{font:600 14px/1 var(--f);color:var(--blue)}
.lk-v{font:800 56px/1 var(--fd);letter-spacing:-.045em;margin:10px 0 0;font-variant-numeric:tabular-nums}.lk-v span{font:600 20px/1 var(--fd);letter-spacing:-.01em;color:var(--muted);margin-left:6px}
.lk-head p{margin:10px 0 0;max-width:470px;font-size:15.5px;color:var(--ink2)}
.lk-tenth{background:var(--soft);border-radius:14px;padding:16px 18px;min-width:210px}.lk-tenth div{font:600 13.5px/1.2 var(--f);color:var(--ink2)}.lk-tenth b{display:block;font:750 30px/1.1 var(--fd);letter-spacing:-.03em;color:var(--blue);margin-top:6px}.lk-tenth span{font-size:13px;color:var(--muted)}
.lk-rows{margin:22px 0 4px;border-top:1px solid var(--line)}
.lk-row{display:grid;grid-template-columns:minmax(150px,1.3fr) 90px 2fr 96px;gap:14px;align-items:center;padding:12px 2px;border-bottom:1px solid var(--line);color:var(--ink);font-size:15px}.lk-row:hover{text-decoration:none;background:#FAFBFF}
.lk-row .n{color:var(--muted);font-size:14px}.lk-row .amt{text-align:right;font-weight:650;font-variant-numeric:tabular-nums}
.lk-row .bar{height:8px;border-radius:9px;background:#EEF0F4;overflow:hidden}.lk-row .bar i{display:block;height:100%;border-radius:9px;background:var(--blue)}
.lk-foot{margin:12px 0 0;font-size:12.5px;color:var(--muted);line-height:1.5}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.waiting,.two,.setgrid{grid-template-columns:1fr !important}.top h1{font-size:28px}.lk-v{font-size:44px}.lk-row{grid-template-columns:1fr auto;gap:6px 12px}.lk-row .bar{grid-column:1/-1;order:3}.lk-row .n{display:none}}
</style>`;

const pct = (x) => `${Math.round(x * 100)}%`;

export async function dashboard(env, biz, { demo = false, flash = "", site = "" } = {}) {
  const s = await stats(env, biz);
  const camps = Object.fromEntries((await env.DB.prepare("SELECT kind, enabled, offer FROM campaigns WHERE biz_id = ?1").bind(biz.id).all()).results.map((r) => [r.kind, r]));
  const events = (await env.DB.prepare("SELECT kind, info, at FROM events WHERE biz_id = ?1 ORDER BY at DESC LIMIT 8").bind(biz.id).all()).results;
  const returns = (await env.DB.prepare(`SELECT e.returned_at, e.return_cents, e.fee_cents, e.campaign, c.first_name, c.last_name FROM enrollments e JOIN customers c ON c.id = e.customer_id
      WHERE e.biz_id = ?1 AND e.holdout = 0 AND e.returned_at IS NOT NULL ORDER BY e.returned_at DESC LIMIT 8`).bind(biz.id).all()).results;
  const cur = biz.currency || "CAD";
  const seg = (k) => s.seg[k] || { n: 0, reach: 0 };
  const lift = s.heldRate > 0 ? s.treatedRate / s.heldRate : null;
  const dis = demo ? "disabled" : "";
  const totalPeople = Object.values(s.seg).reduce((a, b) => a + b.n, 0);
  const csv = biz.provider === "csv";
  const src = csv ? "your sales data" : "Square";
  const base = demo ? "/demo" : "/app";
  const hasTrials = seg("trial").n > 0 || camps.trial?.enabled;

  // Leak Report: the first thing an owner sees after connecting or uploading.
  const L = await leak(env, biz);
  const LABEL = { trial: "Tried an intro, didn't join", overdue: "Overdue regulars", lost: "Lost regulars", one_timer: "Came once, never returned" };
  const maxL = Math.max(1, ...L.lines.map((l) => l.cents));
  const leakCard = L.total > 0 ? `<section class="card leak" aria-labelledby="lk">
    <div class="lk-head"><div><div class="lk-l" id="lk">Leak Report</div>
      <div class="lk-v">${money(L.total, cur)}<span>a year</span></div>
      <p>is a realistic amount to win back from ${plural(L.people, "past customer")} who stopped coming or never joined. Every one of them can still be emailed today.</p></div>
      <div class="lk-tenth"><div>Your typical regular</div><b>${money(L.typical, cur)}</b><span>a year</span></div></div>
    <div class="lk-rows">${L.lines.filter((l) => l.n > 0 || l.k === "overdue").map((l) => `<a class="lk-row" href="${base}/customers?s=${l.k}"><span>${LABEL[l.k]}</span><span class="n">${plural(l.n, "person", "people")}</span><span class="bar"><i style="width:${Math.max(2, Math.round((l.cents / maxL) * 100))}%"></i></span><span class="amt">${money(l.cents, cur)}</span></a>`).join("")}</div>
    <p class="lk-foot">An estimate, not a promise. It assumes only 1 in 10 overdue regulars and intro buyers come back, and 1 in 33 lost regulars and one-time visitors, each spending what they did before (intro and one-time visitors: what your typical regular spends). Counts only people with an email who bought in the last 2 years and haven't unsubscribed.</p>
  </section>` : "";

  const kpis = `<div class="kpis">
    <div class="kpi hl"><div class="l">Came back this month</div><div class="v">${s.monthBack}</div><div class="s">${money(s.monthRevenue, cur)} spent, verified in ${src}</div></div>
    <div class="kpi"><div class="l">Brought back so far</div><div class="v">${money(s.revenue, cur)}</div><div class="s">${plural(s.treatedBack, "returning customer")}</div></div>
    <div class="kpi"><div class="l">Your fee this month</div><div class="v">${money(s.monthFees, cur)}</div><div class="s">12% of returns · capped at ${money(biz.fee_cap_cents ?? 50000, cur)}</div></div>
    <div class="kpi"><div class="l">Return rate</div><div class="v">${s.treated ? pct(s.treatedRate) : "–"}</div><div class="s">${s.held ? `vs ${pct(s.heldRate)} with no email` : "Comparison group builds up over time"}</div></div>
  </div>`;

  const wcard = (k, title, blurb) => {
    const g = seg(k); const share = totalPeople ? Math.min(100, Math.round((g.n / totalPeople) * 100)) : 0;
    return `<div class="wcard"><div class="n">${g.n}</div><h3>${title}</h3><p>${blurb}</p><p style="margin-top:8px"><b style="color:var(--ink)">${g.reach}</b> reachable by email</p><div class="bar"><i style="width:${share}%"></i></div></div>`;
  };
  const waiting = `<h2 class="sh">Who's waiting to come back</h2>
  <div class="waiting" style="grid-template-columns:repeat(${hasTrials ? 4 : 3},1fr)">${hasTrials ? wcard("trial", "Tried, not joined", "Bought an intro offer, no membership yet.") : ""}${wcard("overdue", "Overdue regulars", "Late for their usual visit.")}${wcard("lost", "Lost regulars", "Used to come often, gone for months.")}${wcard("one_timer", "One-time visitors", "Came once, never returned.")}</div>
  <div class="excl"><span class="pill g"><span class="dot"></span>${seg("active").n} on track</span><span class="pill n">${seg("too_old").n} over 2 years: never contacted</span><span class="pill">${s.bookedAhead} already booked, so not emailed</span><span class="pill n">${seg("new").n} new this month</span><a class="pill" href="${base}/customers">See all customers →</a></div>`;

  const auto = `<div class="auto"><div><h3>Autopilot ${biz.autopilot ? `<span class="pill g" style="vertical-align:3px;margin-left:6px"><span class="dot"></span>On</span>` : `<span class="pill n" style="vertical-align:3px;margin-left:6px">Off</span>`}</h3>
    <p>${biz.autopilot ? `${csv ? "Emails" : "Checks Square every 30 minutes and emails"} the people in your campaigns during business hours (up to ${biz.daily_cap || 60} new people a day).` : "Turn on to start bringing customers back. Nothing is sent until you do."}</p></div>
    ${demo ? `<label class="switch"><input type="checkbox" checked disabled><span></span></label>` : biz.autopilot
      ? `<form method="post" action="/app/autopilot"><input type="hidden" name="on" value="0"><label class="switch" title="Turn off"><input type="checkbox" checked onchange="this.form.submit()"><span></span></label></form>`
      : `<button class="btn" onclick="document.getElementById('go').showModal()">Turn on</button>`}</div>`;

  const campRows = Object.entries(CAMPAIGNS).filter(([k]) => k !== "trial" || hasTrials).map(([k, c]) => {
    const r = camps[k] || {}; const g = seg(c.segment);
    return `<div class="camp"><div><h3>${c.name} <span class="muted small" style="font-weight:500">· ${g.reach} reachable</span></h3><p>${c.blurb} Three emails over 10 days, then we stop. <a href="${demo ? "/demo" : "/app"}/preview/${k}">Preview email</a></p></div>
    <form method="post" action="/app/campaign" style="margin:0"><input type="hidden" name="kind" value="${k}"><input type="hidden" name="enabled" value="${r.enabled ? 0 : 1}"><label class="switch"><input type="checkbox" ${r.enabled ? "checked" : ""} ${dis} onchange="this.form.submit()"><span></span></label></form>
    <form class="offer" method="post" action="/app/offer"><input type="hidden" name="kind" value="${k}"><input type="text" name="offer" maxlength="140" value="${esc(r.offer ?? DEFAULT_OFFERS[k])}" placeholder="Optional offer, e.g. Your next class is 20% off" ${dis} aria-label="Offer for ${c.name}"><button class="btn sm ghost" ${dis}>Save offer</button></form></div>`;
  }).join("");

  const maxRate = Math.max(s.treatedRate, s.heldRate, 0.01);
  const proof = !s.treated ? `<div class="card"><h3 style="font-size:18px">Did Rebooked cause it?</h3><p class="muted" style="margin:6px 0 0">Once emails go out, 1 in 10 people in each campaign get no email. Comparing the two groups shows how many returns Rebooked actually caused, not just who came back anyway.</p></div>`
  : `<div class="card"><h3 style="font-size:18px">Did Rebooked cause it?</h3><p class="muted small" style="margin:6px 0 0">1 in 10 people in each campaign get no email. If emailed customers return more often, the emails are working.</p>
    <div class="lift" style="height:150px"><div class="col"><div class="b" style="height:${Math.round((s.treatedRate / maxRate) * 110) + 6}px"></div><div><b style="color:var(--ink)">${pct(s.treatedRate)}</b> came back after our emails (${s.treatedBack}/${s.treated})</div></div>
    <div class="col"><div class="b h" style="height:${Math.round((s.heldRate / maxRate) * 110) + 6}px"></div><div><b style="color:var(--ink)">${pct(s.heldRate)}</b> came back on their own (${s.heldBack}/${s.held})</div></div></div>
    <p style="margin:16px 0 0;font-size:15px">${s.held < 30 ? `The comparison group has ${s.held} people so far. It becomes reliable at about 30.` : lift ? `<b>${lift.toFixed(1)}×</b> more customers came back when we emailed them.` : s.treatedBack > s.heldBack ? "Emailed customers are coming back; customers with no email haven't yet." : "Not enough difference yet. Give it a few more weeks."}</p></div>`;

  const retList = returns.length ? `<ul class="feed">${returns.map((r) => `<li><span><b>${esc(r.first_name || "Customer")} ${esc((r.last_name || "")[0] || "")}.</b> <span class="muted">· ${esc(CAMPAIGNS[r.campaign]?.name || "")} · ${ago(r.returned_at)}</span></span><span><b>${money(r.return_cents, cur)}</b> <span class="muted small">${r.fee_cents ? `fee ${money(r.fee_cents, cur)}` : "no fee (monthly cap)"}</span></span></li>`).join("")}</ul>`
    : `<p class="muted" style="margin:6px 0 0">${csv ? "Returns show up here when you upload a newer export with their visit." : "Returns show up here as soon as Square records the sale."}</p>`;
  const feed = `<div class="card"><h3 style="font-size:18px;margin-bottom:6px">Verified returns</h3>${retList}</div>`;

  const actLabel = { sync: "Synced", enrolled: "Added", sent: "Sent", returned: "Came back", connected: "Connected" };
  const activity = events.length ? `<ul class="feed">${events.map((e) => `<li><span>${esc(e.info)}</span><span class="muted small">${ago(e.at)}</span></li>`).join("")}</ul>` : `<p class="muted">Nothing yet.</p>`;

  const settings = demo ? "" : `<h2 class="sh">Settings</h2><form class="card" method="post" action="/app/settings">
    <div class="setgrid">
      <div><label class="f" for="bu">Booking link</label><input id="bu" type="url" name="booking_url" value="${esc(biz.booking_url || "")}" placeholder="https://your-booking-page"><p class="tiny muted">Where "Book your next visit" sends people.</p></div>
      <div><label class="f" for="re">Replies go to</label><input id="re" type="email" name="reply_email" value="${esc(biz.reply_email || "")}" placeholder="you@yourbusiness.com"><p class="tiny muted">Customers who reply to an email reach you here.</p></div>
      <div><label class="f" for="ad">Mailing address (shown in every email)</label><input id="ad" type="text" name="address" value="${esc(biz.address || "")}" required></div>
      <div><label class="f" for="dc">New people per day</label><input id="dc" type="number" min="5" max="300" name="daily_cap" value="${biz.daily_cap || 60}"></div>
    </div><div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn sm">Save settings</button></div></form>
    <div class="card" style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between"><span class="muted small">${csv ? `From your uploaded export · updated ${biz.synced_at ? ago(biz.synced_at) : "never"}. Upload a fresh export every week so we can confirm who came back.` : `Connected to Square · last checked ${biz.synced_at ? ago(biz.synced_at) : "never"}`}</span>
    <span style="display:flex;gap:10px;flex-wrap:wrap">${csv ? `<a class="btn sm" href="/app/import">Upload new export</a>` : ""}<form method="post" action="/app/run" style="margin:0"><button class="btn sm ghost">Check now</button></form>
    ${csv ? "" : `<form method="post" action="/app/disconnect" style="margin:0" onsubmit="return confirm('Disconnect Square and stop all emails?')"><button class="btn sm ghost">Disconnect Square</button></form>`}
    <form method="post" action="/app/delete" style="margin:0" onsubmit="return confirm('Delete all of your business data from Rebooked? This cannot be undone.')"><button class="btn sm ghost" style="color:var(--red)">Delete all data</button></form></span></div>`;

  const goDialog = demo ? "" : `<dialog id="go"><form method="post" action="/app/autopilot" style="padding:26px">
    <h2 style="font-size:24px;margin-bottom:6px">Turn on autopilot</h2><p class="muted" style="margin:0 0 14px">Rebooked will email the people in your switched-on campaigns, in your name. Please confirm:</p>
    <input type="hidden" name="on" value="1">
    <label class="chk"><input type="checkbox" name="list" required>The customers in my ${csv ? "uploaded list" : "Square account"} are real customers of my business who bought from us or asked about our services in the last 2 years.</label>
    <label class="chk"><input type="checkbox" name="terms" required>I agree to the <a href="/terms" target="_blank">terms</a>: 12% of verified returns, minimum $5, maximum $500 a month.</label>
    <label class="chk"><input type="checkbox" name="addr" required>My mailing address above is correct (it's shown in every email).</label>
    <div style="display:flex;gap:10px;margin-top:16px"><button class="btn">Turn on</button><button class="btn ghost" type="button" onclick="this.closest('dialog').close()">Cancel</button></div></form></dialog>`;

  const body = `${demo ? `<div class="demo-bar"><div class="wrap"><span>Live demo: a sample Pilates studio with simulated data. Return rates are illustrative, not a promise.</span><a href="/signin?next=/app">Try it with your data →</a></div></div>` : ""}
<main class="wrap">
  <div class="top"><div><h1>${esc(biz.name)}</h1><p class="muted">${totalPeople} customers from ${src}${biz.synced_at ? ` · updated ${ago(biz.synced_at)}` : ""}</p></div></div>
  ${flash ? `<div class="notice" style="margin-top:14px">${flash}</div>` : ""}
  ${leakCard}
  ${kpis}
  ${auto}
  ${waiting}
  <h2 class="sh">Campaigns</h2>${campRows}
  <h2 class="sh">Results</h2><div class="two">${feed}${proof}</div>
  <h2 class="sh">Activity</h2><div class="card">${activity}</div>
  ${settings}
</main>${goDialog}`;
  const nav = demo ? `<a class="btn sm" href="/signin?next=/app">Try with your data</a>` : `<form method="post" action="/signout" style="margin:0"><button class="btn sm ghost">Sign out</button></form>`;
  return page({ title: `${biz.name} · Rebooked`, head: APP_CSS, body, nav });
}

export async function customers(env, biz, segment, demo) {
  const segs = ["trial", "overdue", "lost", "one_timer", "active", "new", "too_old"];
  const sel = segs.includes(segment) ? segment : "overdue";
  const rows = (await env.DB.prepare(`SELECT c.*, (SELECT status FROM enrollments e WHERE e.customer_id = c.id ORDER BY enrolled_at DESC LIMIT 1) st
      FROM customers c WHERE c.biz_id = ?1 AND c.segment = ?2 ORDER BY c.last_visit DESC LIMIT 300`).bind(biz.id, sel).all()).results;
  const cur = biz.currency || "CAD";
  const STATUS = { active: ["Emailing", ""], done: ["Emailed", ""], held: ["Comparison group", "n"], returned: ["Came back ✓", "g"], held_returned: ["Came back (no email)", "g"], unsub: ["Unsubscribed", "n"], expired: ["Didn't return", "n"], stopped: ["Stopped", "n"] };
  const base = demo ? "/demo" : "/app";
  const tabs = segs.map((k) => `<a class="pill ${k === sel ? "" : "n"}" href="${base}/customers?s=${k}">${SEGMENT_LABEL[k]}</a>`).join(" ");
  const tr = rows.map((c) => {
    const st = STATUS[c.st];
    const name = demo ? `${esc(c.first_name || "")} ${esc((c.last_name || "")[0] || "")}.` : `${esc(c.first_name || "")} ${esc(c.last_name || "")}`;
    return `<tr><td><b>${name}</b><div class="tiny muted">${c.email ? (demo ? "email on file" : esc(c.email)) : "no email"}</div></td><td>${c.visits}</td><td>${c.cycle_days ? `every ${c.cycle_days} days` : "–"}</td><td>${c.last_visit ? ago(c.last_visit) : "–"}</td><td>${money(c.total_cents, cur)}</td><td>${st ? `<span class="pill ${st[1]}">${st[0]}</span>` : ""}</td></tr>`;
  }).join("");
  const body = `<main class="wrap"><div class="top"><div><a href="${base}" class="small">← Dashboard</a><h1 style="margin-top:8px">Customers</h1></div></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0">${tabs}</div>
  ${sel === "too_old" ? `<div class="notice" style="margin-bottom:14px">These customers last bought over 2 years ago. Under Canada's anti-spam law, Rebooked never contacts them.</div>` : ""}
  <div class="card" style="padding:6px 8px;overflow-x:auto"><table class="t"><thead><tr><th>Customer</th><th>Visits</th><th>Usual rhythm</th><th>Last visit</th><th>Total spent</th><th>Status</th></tr></thead><tbody>${tr || `<tr><td colspan="6" class="muted">Nobody here right now.</td></tr>`}</tbody></table></div></main>`;
  return page({ title: `Customers · ${biz.name}`, head: APP_CSS, body, nav: `<a class="btn sm ghost" href="${base}">Dashboard</a>` });
}

export async function preview(env, biz, kind, demo) {
  if (!CAMPAIGNS[kind]) return null;
  const r = await env.DB.prepare("SELECT offer FROM campaigns WHERE biz_id = ?1 AND kind = ?2").bind(biz.id, kind).first();
  const sample = { first_name: "Sara" };
  const links = { book: "#", unsub: "#", optin: "#" };
  const emails = [0, 1, 2].map((step) => buildEmail({ biz, customer: sample, campaign: kind, step, offer: r?.offer ?? DEFAULT_OFFERS[kind], links, daysSince: kind === "overdue" ? 49 : kind === "lost" ? 210 : kind === "trial" ? 9 : 45 }));
  const base = demo ? "/demo" : "/app";
  const body = `<main class="wrap" style="max-width:760px"><div class="top"><div><a href="${base}" class="small">← Dashboard</a><h1 style="margin-top:8px">${CAMPAIGNS[kind].name}</h1><p class="muted">Three emails: now, after 4 days, after 10 days. They stop as soon as the customer comes back or unsubscribes.</p></div></div>
  ${emails.map((m, i) => `<h2 class="sh" style="font-size:17px">Email ${i + 1} · <span class="muted" style="font-weight:500">“${esc(m.subject)}”</span></h2><iframe title="Email ${i + 1} preview" style="width:100%;height:560px;border:1px solid var(--line);border-radius:18px;background:#F4F5F7" srcdoc="${esc(m.html)}"></iframe>`).join("")}</main>`;
  return page({ title: `Preview · ${CAMPAIGNS[kind].name}`, body, nav: `<a class="btn sm ghost" href="${base}">Dashboard</a>` });
}

export function connectPage(email) {
  const opt = (href, title, text, cta, primary) => `<a class="card" href="${href}" style="display:flex;flex-direction:column;gap:8px;color:var(--ink);padding:26px">
    <h2 style="font-size:21px">${title}</h2><p class="muted" style="margin:0;font-size:15px;flex:1">${text}</p><span class="btn ${primary ? "" : "ghost"}" style="align-self:flex-start;margin-top:10px">${cta}</span></a>`;
  const body = `<main class="wrap" style="max-width:860px;padding-top:56px;padding-bottom:60px">
    <div style="margin-bottom:18px">${LOGO(44)}</div>
    <h1 style="font-size:34px;margin-bottom:10px">Where are your customers?</h1>
    <p class="muted" style="margin:0 0 26px;font-size:17px;max-width:600px">Rebooked reads your customers and visits to find who's overdue, who stopped coming and who tried an intro and never joined. It can't charge cards or change anything in your system.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
      ${opt("/app/import", "Upload an export", "From Mindbody, Momence, Mariana Tek, Arketa, Glofox, Vagaro, Fresha, Jane, a spreadsheet, anything. Drop in the CSV and see your Leak Report in about a minute.", "Upload a file", true)}
      ${opt("/square/connect", "Connect Square", "Customers, sales and Square Appointments sync on their own every 30 minutes. Read-only access.", "Connect with Square", false)}
    </div>
    <p class="tiny muted" style="margin:20px 0 0">Signed in as ${esc(email)}. Nothing is emailed until you turn on autopilot.</p>
  </main>`;
  return page({ title: "Get started · Rebooked", body, nav: `<form method="post" action="/signout" style="margin:0"><button class="btn sm ghost">Sign out</button></form>` });
}
