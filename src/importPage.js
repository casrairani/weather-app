// "Upload any export" page, plus the server side that saves the chunks the browser sends.
// The browser parses the file (importKit), the owner checks the columns, then rows go up in small JSON chunks.

import { page } from "./ui.js";
import { esc, json, DAY, plural, randomId, isEmail } from "./util.js";
import { importKit } from "./importer.js";
import { recompute, ensureCampaigns } from "./engine.js";
import { logEvent } from "./db.js";

const CSS = `<style>
.imp{max-width:860px;padding-top:34px;padding-bottom:80px}
.imp h1{font-size:34px;font-weight:750}.imp .lede{margin:8px 0 0;font-size:17px;color:var(--ink2);max-width:620px}
.step{margin-top:26px}.step h2{font-size:19px;margin:0 0 12px}
.drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;border:1.5px dashed #C9CFDA;border-radius:var(--r);background:#fff;padding:40px 20px;cursor:pointer;transition:border-color .15s,background .15s}
.drop:hover,.drop.on{border-color:var(--blue);background:#FAFBFF}.drop b{font:650 18px/1.3 var(--fd)}.drop span{font-size:14.5px;color:var(--muted)}
.drop input{position:absolute;width:1px;height:1px;opacity:0}
.drop:focus-within{outline:3px solid rgba(36,86,245,.35);outline-offset:2px}
.sys{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.sys span{font-size:12.5px;padding:5px 9px;border-radius:999px;background:#F1F2F4;color:var(--ink2)}
.found{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.found div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.found b{display:block;font:750 26px/1.1 var(--fd);letter-spacing:-.03em;font-variant-numeric:tabular-nums}.found span{font-size:13.5px;color:var(--muted)}
.map{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px 18px}.map>div{min-width:0}
.map label{display:block;font:600 13.5px/1.2 var(--f);margin-bottom:6px}.map .ex{font-size:12.5px;color:var(--muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:15px}
.map select{width:100%;font:500 15px/1.2 var(--f);padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}
.map .hit select{border-color:#B9C8FB;background:#FAFBFF}
.warn{border-radius:14px;padding:12px 14px;font-size:14.5px;background:var(--asoft);color:var(--amber);margin-top:12px}
.prog{height:10px;border-radius:9px;background:#EEF0F4;overflow:hidden;margin-top:14px}.prog i{display:block;height:100%;width:0;background:var(--blue);transition:width .2s}
.chkline{display:flex;gap:12px;align-items:flex-start;font-size:15px;margin:18px 0}.chkline input{width:20px;height:20px;flex:none;margin-top:2px;accent-color:var(--blue)}
@media (max-width:760px){.found{grid-template-columns:1fr 1fr}.map{grid-template-columns:1fr}.imp h1{font-size:28px}}
</style>`;

export function importPage({ biz, email }) {
  if (biz && biz.provider === "square") {
    return page({ title: "Upload · Rebooked", head: CSS, body: `<main class="wrap imp"><a class="small" href="/app">← Dashboard</a><h1 style="margin-top:8px">You're connected to Square</h1><p class="lede">Your customers and sales sync from Square automatically, so there's nothing to upload.</p></main>`, nav: "" });
  }
  const needBiz = !biz;
  const SYSTEMS = ["Mindbody", "Momence", "Mariana Tek", "Arketa", "Glofox", "Walla", "WellnessLiving", "Vagaro", "Fresha", "Jane", "Square", "Shopify", "Excel or Google Sheets"];
  const body = `<main class="wrap imp">
  ${biz ? `<a class="small" href="/app">← Dashboard</a>` : ""}
  <h1 style="margin-top:8px">${biz ? "Upload a fresh export" : "See what's leaking, from any system"}</h1>
  <p class="lede">${biz ? "Upload your latest export. We add new customers and visits, skip the ones we already have, and confirm who came back." : "Export your clients or sales from your booking system as a CSV file and drop it here. In about a minute you'll see who's overdue, who tried an intro and never joined, and what that's worth."}</p>

  <form id="f" onsubmit="return false">
  ${needBiz ? `<section class="step"><h2>Your studio</h2><div class="card"><div class="map">
    <div><label for="bn">Studio name</label><input id="bn" type="text" name="name" required maxlength="80" placeholder="Kits Pilates Studio"></div>
    <div><label for="bu">Booking link</label><input id="bu" name="booking_url" type="url" placeholder="https://your-booking-page"></div>
    <div style="grid-column:1/-1"><label for="ba">Mailing address <span class="muted" style="font-weight:500">(shown in every email; you can add it later)</span></label><input id="ba" type="text" name="address" maxlength="200" placeholder="2190 W 4th Ave, Vancouver, BC"></div>
  </div></div></section>` : ""}

  <section class="step"><h2>Your export</h2>
    <label class="drop" id="drop"><input type="file" id="file" accept=".csv,.txt,.tsv,text/csv,text/plain"><b id="dropT">Choose a CSV file or drop it here</b><span id="dropS">Client list, visit history or sales report. One row per customer or one row per visit both work.</span></label>
    <div class="sys" aria-label="Works with">${SYSTEMS.map((s) => `<span>${esc(s)}</span>`).join("")}</div>
    <p class="tiny muted" style="margin:10px 0 0">Excel file? Open it and choose File → Save As → CSV. The file is read in your browser; only the columns below are sent to Rebooked.</p>
    <div id="err" class="warn" hidden></div>
  </section>

  <section class="step" id="s2" hidden><h2>What we found</h2>
    <div class="found" id="found"></div>
    <div id="warns"></div>
  </section>

  <section class="step" id="s3" hidden><h2>Check the columns</h2>
    <p class="muted small" style="margin:-4px 0 14px">We matched these automatically. Fix any that look wrong; the numbers above update as you go.</p>
    <div class="card"><div class="map" id="map"></div></div>
    <label class="chkline"><input type="checkbox" id="ok" required><span>These are real customers of my business who bought from us or asked about our services in the last 2 years. Rebooked never emails anyone whose last purchase is older than that.</span></label>
    <button class="btn" id="go" type="button" disabled>Import and show my Leak Report</button>
    <div id="pw" hidden><div class="prog"><i id="pb"></i></div><p class="small muted" id="pt" style="margin:8px 0 0">Starting…</p></div>
  </section>
  </form>
  ${biz ? "" : `<p class="tiny muted" style="margin-top:40px">Signed in as ${esc(email)}. Nothing is emailed until you turn on autopilot. Using Square? <a href="/square/connect">Connect it instead</a> and it stays in sync on its own.</p>`}
</main>
<script>
var __name = (f) => f; // the Worker bundler may wrap functions in __name(); it's a no-op here
const kit = (${importKit.toString()})();
const NEED_BIZ = ${needBiz ? "true" : "false"};
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-CA");
const fmtD = (t) => new Date(t).toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });
const SHOW = ["full_name","first_name","last_name","email","phone","date","last_visit","first_visit","visit_count","amount","total_spent","item","status","marketing","customer_id"];
let P = null, M = null, N = null;

function readFile(file) {
  $("err").hidden = true;
  if (!file) return;
  if (/\\.(xlsx?|numbers)$/i.test(file.name)) return fail("That's a spreadsheet file. Open it and save it as CSV first (File → Save As → CSV).");
  if (file.size > 40 * 1024 * 1024) return fail("That file is over 40 MB. Try exporting a shorter date range, like the last 2 years.");
  $("dropT").textContent = file.name;
  $("dropS").textContent = "Reading…";
  const r = new FileReader();
  r.onload = () => {
    try {
      P = kit.parseCSV(r.result);
      if (!P.rows.length) return fail("We couldn't find any rows in that file. Is it the right export?");
      M = kit.detect(P.headers, P.rows);
      $("dropS").textContent = fmt(P.rows.length) + " rows · " + P.headers.length + " columns. Choose another file";
      drawMap(); update();
    } catch (e) { fail("We couldn't read that file. Make sure it's a CSV export."); }
  };
  r.readAsText(file);
}
function fail(msg) { $("err").textContent = msg; $("err").hidden = false; $("s2").hidden = $("s3").hidden = true; }

function drawMap() {
  const opts = (sel) => '<option value="">Not in this file</option>' + P.headers.map((h, i) => '<option value="' + i + '"' + (sel === i ? " selected" : "") + ">" + esc(h) + "</option>").join("");
  $("map").innerHTML = SHOW.map((k) => '<div class="' + (M[k] != null ? "hit" : "") + '"><label for="m_' + k + '">' + kit.LABEL[k] + '</label><select id="m_' + k + '" data-k="' + k + '">' + opts(M[k]) + '</select><div class="ex" id="x_' + k + '"></div></div>').join("");
  $("map").querySelectorAll("select").forEach((s) => s.onchange = () => { const k = s.dataset.k; if (s.value === "") delete M[k]; else M[k] = +s.value; s.parentElement.className = s.value === "" ? "" : "hit"; update(); });
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function update() {
  for (const k of SHOW) { const i = M[k]; const ex = i == null ? "" : [...new Set(P.rows.slice(0, 200).map((r) => r[i]).filter(Boolean))].slice(0, 3).join(" · "); $("x_" + k).textContent = ex ? "e.g. " + ex : ""; }
  N = kit.normalize(P.headers, P.rows, M);
  const s = kit.summary(N);
  $("found").innerHTML = [
    [fmt(s.customers), "customers"],
    [fmt(s.withEmail), "with an email"],
    [fmt(s.visits), N.shape === "customers" ? "visits (estimated)" : "visits and sales"],
    [s.from ? fmtD(s.from) + " – " + fmtD(s.to) : "–", "date range"],
  ].map(([b, l]) => "<div><b>" + b + "</b><span>" + l + "</span></div>").join("");
  const w = [];
  if (!N.shape) w.push("We can't find a date. Pick the column with the visit or sale date, or the last visit date.");
  if (M.email == null) w.push("No email column found. Rebooked contacts people by email, so pick the email column if there is one.");
  if (N.shape === "customers") w.push("This looks like a customer list, so we estimate each person's visit rhythm from their first visit, last visit and visit count. A visit or sales history gives sharper results.");
  if (s.intro) w.push(fmt(s.intro) + " people bought an intro or trial offer. We'll check which of them joined.");
  else if (s.hasItems) w.push("We didn't spot any intro or trial offers by name, so the Intro → member campaign stays hidden for now.");
  if (s.skipped) w.push(fmt(s.skipped) + " rows skipped (cancelled, no-shows, refunds, or no name or date).");
  $("warns").innerHTML = w.map((x) => '<div class="warn" style="background:var(--soft);color:var(--ink2)">' + esc(x) + "</div>").join("");
  $("s2").hidden = $("s3").hidden = false;
  $("go").disabled = !N.shape || !N.customers.length;
}

async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "Upload failed (" + r.status + ")");
  return j;
}
$("go").onclick = async () => {
  if (!$("ok").checked) { $("ok").focus(); $("ok").reportValidity(); return; }
  if (NEED_BIZ && !$("bn").value.trim()) { $("bn").focus(); $("bn").reportValidity(); return; }
  $("go").disabled = true; $("pw").hidden = false;
  const step = (done, total, msg) => { $("pb").style.width = Math.round((done / total) * 100) + "%"; $("pt").textContent = msg; };
  try {
    await post("/app/import/start", NEED_BIZ ? { name: $("bn").value, booking_url: $("bu").value, address: $("ba").value } : {});
    const C = 1000, V = 2000, cs = N.customers, vs = N.visits;
    const total = Math.ceil(cs.length / C) + Math.ceil(vs.length / V) + 1;
    let done = 0;
    for (let i = 0; i < cs.length; i += C) { await post("/app/import/chunk", { customers: cs.slice(i, i + C) }); step(++done, total, "Saving customers… " + fmt(Math.min(i + C, cs.length)) + " of " + fmt(cs.length)); }
    for (let i = 0; i < vs.length; i += V) { await post("/app/import/chunk", { visits: vs.slice(i, i + V) }); step(++done, total, "Saving visits… " + fmt(Math.min(i + V, vs.length)) + " of " + fmt(vs.length)); }
    step(done, total, "Working out everyone's rhythm…");
    const j = await post("/app/import/finish", { customers: cs.length, visits: vs.length });
    step(total, total, "Done");
    location.href = j.next;
  } catch (e) { $("pt").textContent = e.message + ". Nothing is lost; try again."; $("go").disabled = false; }
};
$("file").onchange = (e) => readFile(e.target.files[0]);
const d = $("drop");
["dragenter", "dragover"].forEach((t) => d.addEventListener(t, (e) => { e.preventDefault(); d.classList.add("on"); }));
["dragleave", "drop"].forEach((t) => d.addEventListener(t, (e) => { e.preventDefault(); d.classList.remove("on"); }));
d.addEventListener("drop", (e) => readFile(e.dataTransfer.files[0]));
</script>`;
  return page({ title: "Upload your export · Rebooked", head: CSS, body, nav: biz ? `<a class="btn sm ghost" href="/app">Dashboard</a>` : `<form method="post" action="/signout" style="margin:0"><button class="btn sm ghost">Sign out</button></form>` });
}

/* ---------- server side ---------- */
const str = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

export async function importApi(env, req, owner, biz, p) {
  const body = await req.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Bad request" }, 400);
  if (biz && biz.provider === "square") return json({ ok: false, error: "This account syncs from Square" }, 400);

  if (p === "/app/import/start") {
    if (biz) return json({ ok: true });
    const name = str(body.name, 80);
    if (!name) return json({ ok: false, error: "Please add your studio name" }, 400);
    const booking = str(body.booking_url, 300);
    const id = randomId(10);
    await env.DB.prepare(`INSERT INTO businesses (id, owner_id, name, provider, currency, timezone, address, booking_url, website, reply_email, status, sync_state, created_at)
      VALUES (?1, ?2, ?3, 'csv', 'CAD', 'America/Vancouver', ?4, ?5, ?5, ?6, 'connected', '{}', ?7)`)
      .bind(id, owner.id, name, str(body.address, 200), booking && /^https?:\/\//.test(booking) ? booking : null, owner.email, Date.now()).run();
    await ensureCampaigns(env, { id });
    await logEvent(env, id, "connected", "Started from an uploaded export");
    return json({ ok: true });
  }
  if (!biz) return json({ ok: false, error: "Start the import again" }, 400);

  if (p === "/app/import/chunk") {
    const now = Date.now();
    if (Array.isArray(body.customers)) {
      const rows = body.customers.slice(0, 2000).map((c) => ({ k: str(c.k, 120), f: str(c.f, 60), l: str(c.l, 60), e: isEmail(c.e || "") ? String(c.e).toLowerCase().slice(0, 200) : null, p: str(c.p, 20), u: c.u ? 1 : 0 })).filter((c) => c.k);
      await env.DB.prepare(`INSERT INTO customers (id, biz_id, ext_id, first_name, last_name, email, phone, provider_unsub, updated_at)
          SELECT ?1 || ':csv:' || json_extract(value, '$.k'), ?1, 'csv:' || json_extract(value, '$.k'), json_extract(value, '$.f'), json_extract(value, '$.l'),
                 json_extract(value, '$.e'), json_extract(value, '$.p'), json_extract(value, '$.u'), ?3
          FROM json_each(?2) WHERE true
          ON CONFLICT(id) DO UPDATE SET first_name = COALESCE(excluded.first_name, first_name), last_name = COALESCE(excluded.last_name, last_name),
            email = COALESCE(excluded.email, email), phone = COALESCE(excluded.phone, phone), provider_unsub = MAX(provider_unsub, excluded.provider_unsub)`)
        .bind(biz.id, JSON.stringify(rows), now).run();
      return json({ ok: true, n: rows.length });
    }
    if (Array.isArray(body.visits)) {
      const lo = now - 3650 * DAY, hi = now + DAY;
      const rows = body.visits.slice(0, 4000).map((v) => ({ i: str(v.i, 40), k: str(v.k, 120), a: Math.round(Number(v.a)), c: Math.max(0, Math.min(1e8, Math.round(Number(v.c) || 0))), t: str(v.t, 120) }))
        .filter((v) => v.i && v.k && v.a > lo && v.a < hi);
      await env.DB.prepare(`INSERT OR IGNORE INTO visits (id, biz_id, customer_id, at, amount_cents, source, item)
          SELECT ?1 || ':csv:' || json_extract(value, '$.k') || ':' || json_extract(value, '$.i'), ?1, ?1 || ':csv:' || json_extract(value, '$.k'),
                 json_extract(value, '$.a'), json_extract(value, '$.c'), 'csv', json_extract(value, '$.t')
          FROM json_each(?2)`).bind(biz.id, JSON.stringify(rows)).run();
      return json({ ok: true, n: rows.length });
    }
    return json({ ok: false, error: "Nothing to save" }, 400);
  }

  if (p === "/app/import/finish") {
    const fresh = await env.DB.prepare("SELECT * FROM businesses WHERE id = ?1").bind(biz.id).first();
    await recompute(env, fresh);
    await env.DB.prepare("UPDATE businesses SET synced_at = ?2 WHERE id = ?1").bind(biz.id, Date.now()).run();
    const n = (x) => (Number(x) || 0).toLocaleString("en-CA");
    await logEvent(env, biz.id, "sync", `Uploaded ${n(body.customers)} customers and ${n(body.visits)} visits`);
    return json({ ok: true, next: "/app?imported=1" });
  }
  return json({ ok: false, error: "Not found" }, 404);
}
