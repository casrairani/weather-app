// "Upload any export": reads a CSV from any booking or sales system, finds the columns by itself,
// and turns rows into customers + visits. Everything lives inside importKit() so the exact same code
// runs in the owner's browser (serialised into the import page) and in Node tests.
// The file is read in the browser; only the mapped fields are sent to the server, in small chunks.

export function importKit() {
  const DAY = 86400000;
  const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Field → header names seen in real exports (Mindbody, Momence, Mariana Tek, Arketa, Glofox, Square, Vagaro, Fresha, Jane, spreadsheets).
  // Order matters: specific fields claim their column before generic ones ("Last visit date" before "Date").
  const FIELDS = [
    ["email", "Email", ["email", "emailaddress", "clientemail", "customeremail", "memberemail", "primaryemail"]],
    ["phone", "Phone", ["phone", "mobile", "mobilephone", "cell", "cellphone", "phonenumber", "mobilenumber", "homephone", "telephone", "primaryphone"]],
    ["customer_id", "Customer ID", ["clientid", "customerid", "memberid", "studentid", "userid", "contactid", "patientid", "id", "referenceid", "barcodeid"]],
    ["first_name", "First name", ["firstname", "first", "givenname", "fname", "clientfirstname", "customerfirstname"]],
    ["last_name", "Last name", ["lastname", "last", "surname", "familyname", "lname", "clientlastname", "customerlastname"]],
    ["last_visit", "Last visit", ["lastvisit", "lastvisitdate", "lastclass", "lastclassdate", "lastseen", "lastbooking", "lastattended", "lastattendance", "lastpurchase", "lastpurchasedate", "lastorder", "lastorderdate", "lastactivity", "mostrecentvisit", "lastappointment", "lastcheckin"]],
    ["first_visit", "First visit", ["firstvisit", "firstvisitdate", "firstclass", "firstclassdate", "clientsince", "customersince", "membersince", "firstpurchase", "firstpurchasedate", "firstseen", "joindate", "datejoined", "signupdate", "creationdate", "datecreated", "created", "createdat", "firstappointment"]],
    ["visit_count", "Number of visits", ["visits", "totalvisits", "visitcount", "numberofvisits", "noofvisits", "classesattended", "totalclasses", "totalbookings", "bookingcount", "checkins", "totalcheckins", "totalorders", "ordercount", "numberoforders", "appointments", "totalappointments", "attendance"]],
    ["total_spent", "Total spent", ["totalspent", "lifetimevalue", "ltv", "totalspend", "totalsales", "totalrevenue", "amountspent", "lifetimespend", "lifetimesales", "clv"]],
    ["marketing", "Email marketing OK?", ["acceptsmarketing", "emailmarketing", "marketingoptin", "emailoptin", "emailsubscribed", "subscribed", "emailsubscription", "marketingemails", "sendmarketing", "marketingconsent", "optin", "emailmarketingconsent", "acceptsemailmarketing", "promotionalemails"]],
    ["status", "Status", ["status", "visitstatus", "bookingstatus", "attendancestatus", "paymentstatus", "orderstatus", "state"]],
    ["date", "Date", ["date", "visitdate", "saledate", "classdate", "purchasedate", "transactiondate", "orderdate", "datetime", "dateandtime", "datetimeofsale", "starttime", "startdate", "start", "bookingdate", "checkindate", "checkin", "appointmentdate", "paymentdate", "paidat", "time", "timestamp", "datepurchased", "servicedate"]],
    ["amount", "Amount paid", ["amount", "total", "price", "paid", "amountpaid", "saleamount", "subtotal", "revenue", "net", "netsales", "gross", "grosssales", "itemtotal", "totalpaid", "value", "payment", "paymentamount", "charged", "totalprice", "lineitemtotal", "collected"]],
    ["item", "Service or product", ["item", "service", "product", "pricingoption", "pricingoptionused", "serviceused", "description", "classname", "class", "package", "membership", "plan", "itemname", "servicename", "productname", "lineitem", "lineitemname", "sessiontype", "visittype", "type", "offering", "series", "pass", "passname", "purchase", "itemdescription"]],
    ["full_name", "Full name", ["name", "client", "clientname", "customer", "customername", "fullname", "member", "membername", "student", "studentname", "contact", "contactname", "patient", "patientname", "attendee"]],
  ];
  const LABEL = Object.fromEntries(FIELDS.map(([k, l]) => [k, l]));

  // ---------- CSV ----------
  function parseCSV(text) {
    text = String(text || "").replace(/^﻿/, "");
    const first = text.slice(0, 5000).split(/\r?\n/).slice(0, 12).join("\n");
    const count = (ch) => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
    const delim = [",", ";", "\t", "|"].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    const clean = rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
    // Some exports start with a report title or date range. The header is the row (in the first 10) that looks most like headers.
    let hi = 0, best = -1;
    for (let i = 0; i < Math.min(10, clean.length); i++) {
      const s = clean[i].reduce((a, h) => a + (FIELDS.some(([, , syn]) => syn.includes(norm(h))) ? 1 : 0), 0) + Math.min(clean[i].filter(Boolean).length, 6) * 0.01;
      if (s > best) { best = s; hi = i; }
    }
    const headers = (clean[hi] || []).map((h, i) => h || `Column ${i + 1}`);
    const data = clean.slice(hi + 1).filter((r) => !/^(grand\s*)?totals?:?$/i.test(r[0] || "") && r.length >= Math.min(2, headers.length));
    return { headers, rows: data, delimiter: delim };
  }

  // ---------- values ----------
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  // order: "mdy" or "dmy" for ambiguous dates like 03/04/2026. Returns ms (wall-clock time stored as UTC) or null.
  function parseDate(s, order = "mdy") {
    s = String(s || "").trim();
    if (!s) return null;
    const time = (rest) => {
      const t = String(rest || "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?m?\.?/i);
      if (!t) return 12 * 3600000;
      let h = +t[1]; const ap = (t[4] || "").toLowerCase();
      if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0;
      return h * 3600000 + +t[2] * 60000;
    };
    const ok = (y, m, d, rest) => {
      if (y < 100) y += 2000;
      if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
      return Date.UTC(y, m - 1, d) + time(rest);
    };
    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/))) return ok(+m[1], +m[2], +m[3], m[4]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(.*)$/))) return order === "dmy" ? ok(+m[3], +m[2], +m[1], m[4]) : ok(+m[3], +m[1], +m[2], m[4]);
    const mon = (w) => MONTHS[w.toLowerCase().slice(0, 4)] || MONTHS[w.toLowerCase().slice(0, 3)];
    if ((m = s.match(/^(?:[a-z]+,?\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(.*)$/i)) && mon(m[1])) return ok(+m[3], mon(m[1]), +m[2], m[4]);
    if ((m = s.match(/^(?:[a-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})(.*)$/i)) && mon(m[2])) return ok(+m[3], mon(m[2]), +m[1], m[4]);
    if (/^\d{5}(\.\d+)?$/.test(s)) { const n = +s; if (n > 30000 && n < 80000) return Math.round((n - 25569) * DAY); } // Excel serial date
    const t = Date.parse(s);
    return Number.isFinite(t) && t > Date.UTC(1990, 0, 1) ? t : null;
  }
  function dateOrder(values) {
    let a = 0, b = 0;
    for (const v of values) { const m = String(v).match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/); if (m) { if (+m[1] > 12) a++; if (+m[2] > 12) b++; } }
    return a > b ? "dmy" : "mdy";
  }
  function parseMoney(s) {
    s = String(s || "").trim();
    if (!s) return null;
    const neg = /^\(.*\)$/.test(s) || /^-|-\s*$|^[^\d]*-/.test(s);
    let x = s.replace(/[^\d.,]/g, "");
    if (!/\d/.test(x)) return null;
    if (/,\d{2}$/.test(x) && !/\.\d{2}$/.test(x)) x = x.replace(/\./g, "").replace(",", "."); else x = x.replace(/,/g, "");
    const n = parseFloat(x);
    return Number.isFinite(n) ? Math.round(n * 100) * (neg ? -1 : 1) : null;
  }
  const parseCount = (s) => { const n = parseInt(String(s || "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
  const isEmail = (s) => /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(String(s || "").trim());
  const NO = /^(no|n|false|0|unsubscribed|opted\s*out|opt\s*out|optout|never|declined|not subscribed|unsubscribe)$/i;
  const SKIP_STATUS = /cancel|no.?show|late.?cancel|refund|void|declin|fail|missed|deleted|reversed/i;

  // ---------- column detection ----------
  function detect(headers, rows) {
    const H = headers.map(norm);
    const sample = (i) => rows.slice(0, 300).map((r) => r[i]).filter((v) => v != null && String(v).trim() !== "");
    const rate = (i, fn) => { const v = sample(i); return v.length ? v.filter(fn).length / v.length : 0; };
    const order = {};
    const valid = {
      email: (i) => rate(i, isEmail) > 0.3,
      phone: (i) => rate(i, (v) => String(v).replace(/\D/g, "").length >= 7) > 0.5,
      last_visit: (i) => rate(i, (v) => parseDate(v, order[i] ||= dateOrder(sample(i))) != null) > 0.5,
      first_visit: (i) => rate(i, (v) => parseDate(v, order[i] ||= dateOrder(sample(i))) != null) > 0.5,
      date: (i) => rate(i, (v) => parseDate(v, order[i] ||= dateOrder(sample(i))) != null) > 0.6,
      amount: (i) => rate(i, (v) => parseMoney(v) != null) > 0.6,
      total_spent: (i) => rate(i, (v) => parseMoney(v) != null) > 0.6,
      visit_count: (i) => rate(i, (v) => /^\s*\d+\s*$/.test(v)) > 0.7,
      item: (i) => rate(i, (v) => /[a-z]/i.test(v)) > 0.5,
      full_name: (i) => rate(i, (v) => /[a-z]/i.test(v) && !isEmail(v)) > 0.6,
      first_name: (i) => rate(i, (v) => /[a-z]/i.test(v)) > 0.6,
      last_name: (i) => rate(i, (v) => /[a-z]/i.test(v)) > 0.5,
    };
    const used = new Set(), map = {};
    for (const [key, , syn] of FIELDS) {
      let best = -1, score = 0;
      H.forEach((h, i) => {
        if (used.has(i) || !h) return;
        // Exact name beats prefix/suffix beats contains; within each, names earlier in the list win ties.
        let s = 0;
        syn.forEach((w, j) => {
          const t = 1 - j / 1000;
          if (h === w) s = Math.max(s, 2 + t);
          else if (w.length >= 4 && (h.startsWith(w) || h.endsWith(w))) s = Math.max(s, 1 + t);
          else if (w.length >= 5 && h.includes(w)) s = Math.max(s, t);
        });
        if (s > score && (!valid[key] || valid[key](i))) { score = s; best = i; }
      });
      if (best >= 0) { map[key] = best; used.add(best); }
    }
    // Nothing called "email"? Use any column that's mostly email addresses.
    if (map.email == null) { const i = H.findIndex((_, i) => !used.has(i) && valid.email(i)); if (i >= 0) { map.email = i; used.add(i); } }
    if (map.date == null && map.last_visit == null) { const i = H.findIndex((_, i) => !used.has(i) && rate(i, (v) => parseDate(v) != null) > 0.8); if (i >= 0) { map.date = i; used.add(i); } }
    if (map.full_name != null && map.first_name != null && map.last_name != null) delete map.full_name;
    return map;
  }

  // Which shape is the file? One row per visit/sale, or one row per customer with a "last visit" column.
  const shapeOf = (map) => (map.date != null ? "visits" : map.last_visit != null ? "customers" : null);

  // Simple stable hash for row ids (so re-uploading the same file doesn't double count).
  function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }

  // ---------- rows → customers + visits ----------
  function normalize(headers, rows, map, now = Date.now()) {
    const shape = shapeOf(map);
    const out = { shape, customers: [], visits: [], skipped: 0, noContact: 0 };
    if (!shape) return out;
    const get = (r, k) => (map[k] != null ? String(r[map[k]] ?? "").trim() : "");
    const orders = {};
    for (const k of ["date", "last_visit", "first_visit"]) if (map[k] != null) orders[k] = dateOrder(rows.slice(0, 500).map((r) => r[map[k]]));
    const people = new Map();
    const seen = new Set();
    for (const r of rows) {
      if (map.status != null && SKIP_STATUS.test(get(r, "status"))) { out.skipped++; continue; }
      let first = get(r, "first_name"), last = get(r, "last_name");
      const full = get(r, "full_name");
      if (!first && !last && full) {
        if (full.includes(",")) { const [l, f] = full.split(","); first = (f || "").trim(); last = l.trim(); }
        else { const p = full.split(/\s+/); first = p.shift() || ""; last = p.join(" "); }
      }
      const email = isEmail(get(r, "email")) ? get(r, "email").toLowerCase() : "";
      const digits = get(r, "phone").replace(/\D/g, "");
      const phone = digits.length >= 10 ? (digits.length === 10 ? "+1" + digits : "+" + digits) : "";
      const id = get(r, "customer_id");
      const key = (id ? "id:" + id : email ? "e:" + email : phone ? "p:" + phone : (first || last) ? "n:" + (first + " " + last).toLowerCase().trim() : "").slice(0, 120);
      if (!key) { out.skipped++; continue; }
      const mk = get(r, "marketing");
      let c = people.get(key);
      if (!c) { c = { k: key, f: null, l: null, e: null, p: null, u: 0 }; people.set(key, c); }
      c.f ||= first.slice(0, 60) || null; c.l ||= last.slice(0, 60) || null; c.e ||= email || null; c.p ||= phone || null;
      if (mk && NO.test(mk)) c.u = 1;
      const item = get(r, "item").slice(0, 120) || null;
      const push = (at, cents, it) => {
        if (at == null || at > now + DAY) return;
        const vid = hash(`${key}|${at}|${cents}|${it || ""}`);
        if (seen.has(vid)) return; seen.add(vid);
        out.visits.push({ i: vid, k: key, a: at, c: Math.max(0, cents || 0), t: it });
      };
      if (shape === "visits") {
        const at = parseDate(get(r, "date"), orders.date);
        if (at == null) { out.skipped++; continue; }
        const cents = map.amount != null ? parseMoney(get(r, "amount")) : 0;
        if (cents != null && cents < 0) { out.skipped++; continue; } // refunds
        push(at, cents || 0, item);
      } else {
        const lastAt = parseDate(get(r, "last_visit"), orders.last_visit);
        if (lastAt == null) { out.skipped++; continue; }
        const firstAt = parseDate(get(r, "first_visit"), orders.first_visit);
        let n = parseCount(get(r, "visit_count"));
        if (n == null) n = firstAt != null && firstAt < lastAt - DAY ? 2 : 1;
        n = Math.max(1, Math.min(n, 60));
        const total = map.total_spent != null ? parseMoney(get(r, "total_spent")) || 0 : 0;
        const per = Math.round(Math.max(0, total) / n);
        // We only know the first and last visit and how many there were: spread the others evenly in between.
        const span = firstAt != null && firstAt < lastAt ? lastAt - firstAt : (n - 1) * 14 * DAY;
        for (let k = 0; k < n; k++) push(n === 1 ? lastAt : Math.round(lastAt - span + (span * k) / (n - 1)), per, item);
      }
    }
    out.customers = [...people.values()];
    out.noContact = out.customers.filter((c) => !c.e).length;
    return out;
  }

  // Summary shown before importing.
  function summary(n) {
    const ats = n.visits.map((v) => v.a);
    const TRIAL = /\b(intro|introductory|trial|new (client|student|member|customer)s?|first (class|visit|session|time)|starter|welcome|taster)\b/i;
    return {
      customers: n.customers.length, visits: n.visits.length, withEmail: n.customers.length - n.noContact, skipped: n.skipped,
      from: ats.length ? Math.min(...ats) : null, to: ats.length ? Math.max(...ats) : null,
      intro: new Set(n.visits.filter((v) => v.t && TRIAL.test(v.t)).map((v) => v.k)).size,
      hasItems: n.visits.some((v) => v.t),
    };
  }

  return { FIELDS, LABEL, parseCSV, parseDate, parseMoney, detect, shapeOf, normalize, summary, dateOrder };
}
