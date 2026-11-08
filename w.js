// src/analyze.js
var AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "OAI-SearchBot"], strip = (s = "") => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(), attr = (tag, name) => {
  let m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? m[2] ?? m[3] ?? m[4] ?? "" : null;
}, metaContent = (html2, key) => {
  let tags = html2.match(/<meta\b[^>]*>/gi) || [];
  for (let t of tags)
    if ((attr(t, "name") || attr(t, "property") || "").toLowerCase() === key.toLowerCase()) return attr(t, "content");
  return null;
};
function botAllowed(robots, bot) {
  if (!robots) return !0;
  let groups = [], cur = null;
  for (let raw of robots.split(/\r?\n/)) {
    let line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    let [k, ...rest] = line.split(":"), key = k.trim().toLowerCase(), val = rest.join(":").trim();
    key === "user-agent" ? ((!cur || cur.rules.length) && (cur = { agents: [], rules: [] }, groups.push(cur)), cur.agents.push(val.toLowerCase())) : cur && (key === "disallow" || key === "allow") && cur.rules.push({ key, val });
  }
  let pick = groups.find((g) => g.agents.includes(bot.toLowerCase())) || groups.find((g) => g.agents.includes("*"));
  if (!pick) return !0;
  let blocked = pick.rules.some((r) => r.key === "disallow" && r.val === "/"), allowed = pick.rules.some((r) => r.key === "allow" && r.val === "/");
  return !blocked || allowed;
}
var G = "good", W = "warn", B = "bad";
function analyze(page2) {
  let { url, html: html2 = "", status = 200, ms = 0, headers = {}, robots = null, sitemap = !1, llms = !1, redirects = 0, speed = null } = page2, host2 = new URL(url).hostname.replace(/^www\./, ""), head2 = (html2.match(/<head[\s\S]*?<\/head>/i) || [html2])[0], body = (html2.match(/<body[\s\S]*<\/body>/i) || [html2])[0].replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "), text = strip(body), words = text ? text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0, title = strip((head2.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""), desc = metaContent(head2, "description") || "", h1s = (body.match(/<h1\b[\s\S]*?<\/h1>/gi) || []).map(strip).filter(Boolean), h2s = (body.match(/<h2\b/gi) || []).length, h3s = (body.match(/<h3\b/gi) || []).length, imgs = body.match(/<img\b[^>]*>/gi) || [], noAlt = imgs.filter((t) => {
    let a = attr(t, "alt");
    return a === null || a.trim() === "";
  }).length, links = (body.match(/<a\b[^>]*>/gi) || []).map((t) => attr(t, "href")).filter(Boolean), internal = 0, external = 0;
  for (let h of links)
    if (!/^(mailto:|tel:|javascript:|#)/i.test(h))
      try {
        new URL(h, url).hostname.replace(/^www\./, "") === host2 ? internal++ : external++;
      } catch {
      }
  let ldBlocks = html2.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [], schemaTypes = /* @__PURE__ */ new Set();
  for (let b of ldBlocks) {
    let json2 = b.replace(/<script[^>]*>|<\/script>/gi, "");
    for (let m of json2.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]*")/g))
      m[1].replace(/[\[\]"]/g, "").split(",").map((s) => s.trim()).filter(Boolean).forEach((t) => schemaTypes.add(t));
  }
  let robotsMeta = (metaContent(head2, "robots") || "").toLowerCase(), canonical = (head2.match(/<link\b[^>]*rel=["']?canonical[^>]*>/i) || [])[0], lang = attr((html2.match(/<html\b[^>]*>/i) || [""])[0], "lang"), ogTitle = metaContent(head2, "og:title"), ogImage = metaContent(head2, "og:image"), ogDesc = metaContent(head2, "og:description"), twCard = metaContent(head2, "twitter:card"), favicon = /<link\b[^>]*rel=["'][^"']*icon/i.test(head2), viewport = metaContent(head2, "viewport"), charset = /<meta\b[^>]*charset/i.test(head2), doctype = /^\s*<!doctype html/i.test(html2), kb = Math.round(new TextEncoder().encode(html2).length / 1024), gz = /gzip|br|zstd/i.test(headers["content-encoding"] || ""), hsts = !!headers["strict-transport-security"], aiBlocked = AI_BOTS.filter((b) => !botAllowed(robots, b)), hasFaq = [...schemaTypes].some((t) => /FAQPage|QAPage/i.test(t)), hasOrg = [...schemaTypes].some((t) => /Organization|LocalBusiness|Person|WebSite|Product|SoftwareApplication/i.test(t)), questions = (body.match(/<h[2-4][^>]*>[^<]*\?\s*<\/h[2-4]>/gi) || []).length, c = [], add = (cat, id, label, status2, value, fix, weight = 1) => c.push({ cat, id, label, status: status2, value, fix, weight });
  add(
    "onpage",
    "title",
    "Title tag",
    title ? title.length < 30 || title.length > 60 ? W : G : B,
    title ? `${title.length} chars` : "Missing",
    title ? "Keep the title between 30 and 60 characters so Google doesn't cut it." : "Add a <title> with your main keyword, 30\u201360 characters.",
    3
  ), add(
    "onpage",
    "desc",
    "Meta description",
    desc ? desc.length < 70 || desc.length > 160 ? W : G : B,
    desc ? `${desc.length} chars` : "Missing",
    "Write a 70\u2013160 character description that sells the click.",
    2
  ), add(
    "onpage",
    "h1",
    "One H1 heading",
    h1s.length === 1 ? G : h1s.length === 0 ? B : W,
    h1s.length === 1 ? "1 found" : h1s.length === 0 ? "Missing" : `${h1s.length} found`,
    h1s.length === 0 ? "Add exactly one H1 that says what you do." : "Keep only one H1; turn the others into H2s.",
    3
  ), add(
    "onpage",
    "headings",
    "H2/H3 structure",
    h2s >= 2 ? G : h2s === 1 ? W : B,
    `${h2s} H2 \xB7 ${h3s} H3`,
    "Break the page into sections with H2 headings.",
    1
  ), add(
    "onpage",
    "alt",
    "Image alt text",
    imgs.length === 0 ? W : noAlt === 0 ? G : noAlt / imgs.length > 0.3 ? B : W,
    imgs.length === 0 ? "No images" : noAlt === 0 ? `All ${imgs.length} have alt` : `${noAlt} of ${imgs.length} missing`,
    "Describe every image in its alt text.",
    1
  ), add(
    "onpage",
    "canonical",
    "Canonical URL",
    canonical ? G : W,
    canonical ? "Set" : "Missing",
    'Add <link rel="canonical"> so Google knows the main version of the page.',
    1
  ), add(
    "onpage",
    "internal",
    "Internal links",
    internal >= 10 ? G : internal >= 3 ? W : B,
    `${internal}`,
    "Link to your key pages from the homepage.",
    1
  ), add(
    "content",
    "words",
    "Content depth",
    words >= 600 ? G : words >= 250 ? W : B,
    `${words.toLocaleString("en-US")} words`,
    "Add more useful text \u2014 what you do, who it's for, proof, FAQ.",
    2
  ), add("content", "lang", "Language set", lang ? G : W, lang || "Missing", 'Add lang="en" (or your language) to the <html> tag.', 1), add("content", "external", "Outbound links", external >= 1 ? G : W, `${external}`, "Link to a couple of trusted sources.", 1), add(
    "technical",
    "https",
    "HTTPS",
    url.startsWith("https://") ? G : B,
    url.startsWith("https://") ? "Secure" : "Not secure",
    "Turn on HTTPS (free with Cloudflare).",
    3
  ), add(
    "technical",
    "status",
    "Page loads (status)",
    status === 200 ? G : status < 400 ? W : B,
    `${status}`,
    "Make sure the homepage returns 200.",
    3
  ), add(
    "technical",
    "ttfb",
    "Server response",
    ms <= 600 ? G : ms <= 1500 ? W : B,
    `${ms} ms`,
    "Speed up the server or put the site behind a CDN.",
    2
  ), add(
    "technical",
    "size",
    "Page weight (HTML)",
    kb <= 150 ? G : kb <= 400 ? W : B,
    `${kb} KB`,
    "Trim inline scripts and styles from the HTML.",
    1
  ), add(
    "technical",
    "compress",
    "Compression",
    gz ? G : W,
    gz ? headers["content-encoding"] : "Off",
    "Turn on gzip or Brotli compression.",
    1
  ), add("technical", "redirects", "Redirect hops", redirects <= 1 ? G : W, `${redirects}`, "Point straight to the final URL \u2014 fewer hops.", 1), add(
    "technical",
    "mobile",
    "Mobile viewport",
    viewport && /width=device-width/i.test(viewport) ? G : B,
    viewport ? "Set" : "Missing",
    'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    2
  ), add(
    "technical",
    "indexable",
    "Google can index it",
    /noindex/.test(robotsMeta) ? B : G,
    /noindex/.test(robotsMeta) ? "noindex!" : "Yes",
    "Remove the noindex tag \u2014 it hides your page from Google.",
    3
  ), add("technical", "sitemap", "Sitemap", sitemap ? G : W, sitemap ? "Found" : "Not found", "Publish /sitemap.xml and list it in robots.txt.", 1), add("technical", "robots", "robots.txt", robots !== null ? G : W, robots !== null ? "Found" : "Not found", "Add a robots.txt file.", 1), add(
    "technical",
    "doctype",
    "Doctype & charset",
    doctype && charset ? G : W,
    doctype && charset ? "OK" : "Incomplete",
    'Start with <!doctype html> and <meta charset="utf-8">.',
    1
  ), add("technical", "hsts", "HSTS security header", hsts ? G : W, hsts ? "On" : "Off", "Turn on HSTS in your host settings.", 1), speed && add(
    "technical",
    "lcp",
    "Real load speed (LCP)",
    speed.lcp <= 2.5 ? G : speed.lcp <= 4 ? W : B,
    `${speed.lcp.toFixed(1)} s`,
    "Shrink the hero image and defer heavy scripts.",
    3
  ), add(
    "ai",
    "aibots",
    "AI crawlers allowed",
    aiBlocked.length === 0 ? G : aiBlocked.length >= 3 ? B : W,
    aiBlocked.length === 0 ? "All allowed" : `Blocks ${aiBlocked.join(", ")}`,
    "Allow GPTBot, ClaudeBot and PerplexityBot in robots.txt so AI can recommend you.",
    3
  ), add("ai", "llms", "llms.txt", llms ? G : W, llms ? "Found" : "Not found", "Add /llms.txt \u2014 a short summary of your site for AI.", 1), add(
    "ai",
    "schema",
    "Structured data",
    schemaTypes.size ? G : B,
    schemaTypes.size ? [...schemaTypes].slice(0, 3).join(", ") : "None",
    "Add JSON-LD schema (Organization + WebSite at minimum).",
    2
  ), add("ai", "entity", "Who-you-are schema", hasOrg ? G : W, hasOrg ? "Yes" : "No", "Add Organization schema with name, logo and links.", 1), add(
    "ai",
    "faq",
    "Answers questions",
    hasFaq || questions >= 3 ? G : questions >= 1 ? W : B,
    hasFaq ? "FAQ schema" : `${questions} question headings`,
    "Add an FAQ section \u2014 AI answers love question-and-answer text.",
    2
  ), add(
    "social",
    "og",
    "Share preview (Open Graph)",
    ogTitle && ogImage ? G : ogTitle || ogImage ? W : B,
    ogTitle && ogImage ? "Title + image" : ogTitle ? "No image" : ogImage ? "No title" : "Missing",
    "Add og:title, og:description and a 1200\xD7630 og:image.",
    2
  ), add("social", "ogdesc", "Share description", ogDesc ? G : W, ogDesc ? "Set" : "Missing", "Add og:description.", 1), add("social", "twitter", "X/Twitter card", twCard ? G : W, twCard || "Missing", 'Add <meta name="twitter:card" content="summary_large_image">.', 1), add("social", "favicon", "Favicon", favicon ? G : W, favicon ? "Set" : "Missing", "Add a favicon so you look legit in tabs and Google.", 1);
  let pts = { good: 1, warn: 0.5, bad: 0 }, cats = {};
  for (let ch of c)
    cats[ch.cat] ??= { got: 0, max: 0 }, cats[ch.cat].got += pts[ch.status] * ch.weight, cats[ch.cat].max += ch.weight;
  let scores = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, Math.round(v.got / v.max * 100)])), totalGot = c.reduce((s, x) => s + pts[x.status] * x.weight, 0), totalMax = c.reduce((s, x) => s + x.weight, 0);
  return { host: host2, url, title, score: Math.round(totalGot / totalMax * 100), scores, checks: c };
}
function duel(a, b) {
  let winner = a.score === b.score ? null : a.score > b.score ? "a" : "b", rows = a.checks.map((ca) => {
    let cb = b.checks.find((x) => x.id === ca.id), rank = { good: 2, warn: 1, bad: 0 }, edge = cb ? rank[ca.status] > rank[cb.status] ? "a" : rank[ca.status] < rank[cb.status] ? "b" : null : null;
    return { id: ca.id, cat: ca.cat, label: ca.label, a: { status: ca.status, value: ca.value }, b: cb ? { status: cb.status, value: cb.value } : null, edge };
  }), order = { bad: 0, warn: 1 }, plan = a.checks.filter((x) => x.status !== "good").sort((x, y) => order[x.status] - order[y.status] || y.weight - x.weight).map((x) => ({ label: x.label, status: x.status, fix: x.fix, gain: Math.round((x.status === "bad" ? 1 : 0.5) * x.weight / a.checks.reduce((s, k) => s + k.weight, 0) * 100) })), winsA = rows.filter((r) => r.edge === "a").length, winsB = rows.filter((r) => r.edge === "b").length;
  return { a, b, winner, rows, winsA, winsB, plan };
}
function toMarkdown(d) {
  let L = [
    `# SEO duel: ${d.a.host} (${d.a.score}) vs ${d.b.host} (${d.b.score})`,
    "",
    `Winner: **${d.winner ? d[d.winner].host : "Tie"}**`,
    "",
    "## Fix list for " + d.a.host,
    ""
  ];
  return d.plan.forEach((p, i) => L.push(`${i + 1}. [${p.status === "bad" ? "CRITICAL" : "IMPROVE"}] ${p.label} \u2014 ${p.fix} (+${p.gain} pts)`)), L.push("", "## Side by side", "", `| Check | ${d.a.host} | ${d.b.host} |`, "|---|---|---|"), d.rows.forEach((r) => L.push(`| ${r.label} | ${r.a.value} | ${r.b ? r.b.value : "\u2014"} |`)), L.push("", '> Paste this into Claude Code or Cursor: "Apply every fix in this list to my site."'), L.join(`
`);
}

// src/battle.js
var STOP = new Set("a an and are as at be by for from has have home how in is it its of on or our page site that the this to was we welcome what when where who why will with you your new best free online official get more about us contact menu shop login sign".split(" ")), BIG = /(^|\.)(google|youtube|facebook|instagram|tiktok|twitter|x|linkedin|pinterest|reddit|wikipedia|amazon|yelp|quora|medium|apple|microsoft|tripadvisor|indeed|glassdoor)\./i, strip2 = (s = "") => s.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim(), host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
function keywordsFromHtml(html2, siteHost) {
  let brand = siteHost.split(".")[0].replace(/[-_]/g, " ").toLowerCase(), title = strip2((html2.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""), desc = (html2.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) || [])[1] || "", heads = (html2.match(/<h[12][^>]*>[\s\S]*?<\/h[12]>/gi) || []).map(strip2), sources = [[title, 3], [heads.join(" | "), 2], [desc, 1]], score = /* @__PURE__ */ new Map();
  for (let [text, w] of sources)
    for (let part of text.toLowerCase().split(/[|·•–—:,.!?()\[\]"]+/)) {
      let words = part.split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}&'-]/gu, "")).filter(Boolean);
      for (let n = 3; n >= 2; n--) for (let i = 0; i + n <= words.length; i++) {
        let g = words.slice(i, i + n);
        if (STOP.has(g[0]) || STOP.has(g[n - 1]) || g.join(" ").includes(brand)) continue;
        let k = g.join(" ");
        score.set(k, (score.get(k) || 0) + w * n);
      }
    }
  let out = [];
  for (let [k] of [...score].sort((a, b) => b[1] - a[1]))
    if (!out.some((o) => o.includes(k) || k.includes(o)) && (out.push(k), out.length === 10))
      break;
  return out;
}
async function serp(env, q, gl = "us") {
  let r = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": env.SERPER_KEY, "content-type": "application/json" },
    body: JSON.stringify({ q, gl, num: 100 })
  });
  if (!r.ok) throw new Error("search failed");
  return ((await r.json()).organic || []).map((o, i) => ({ pos: o.position || i + 1, host: host(o.link), url: o.link }));
}
async function battle(env, a, b, keywords, gl) {
  let rows = await Promise.all(keywords.slice(0, 10).map(async (kw) => {
    let res = await serp(env, kw, gl), find = (h) => res.find((r) => r.host === h || r.host.endsWith("." + h)), pa = find(a), pb = find(b), top = res[0];
    return {
      keyword: kw,
      a: pa ? pa.pos : null,
      b: pb ? pb.pos : null,
      aUrl: pa?.url || null,
      bUrl: pb?.url || null,
      leader: top ? top.host : null,
      edge: pa && (!pb || pa.pos < pb.pos) ? "a" : pb && (!pa || pb.pos < pa.pos) ? "b" : null
    };
  }));
  return { a, b, gl, rows, winsA: rows.filter((r) => r.edge === "a").length, winsB: rows.filter((r) => r.edge === "b").length, at: Date.now() };
}
async function findRivals(env, siteHost, keywords, gl) {
  let count = /* @__PURE__ */ new Map();
  for (let kw of keywords.slice(0, 5)) {
    let res = await serp(env, kw, gl);
    for (let r of res.slice(0, 20)) {
      if (!r.host || r.host === siteHost || r.host.endsWith("." + siteHost) || BIG.test(r.host + ".")) continue;
      let c = count.get(r.host) || { host: r.host, hits: 0, best: 99 };
      c.hits++, c.best = Math.min(c.best, r.pos), count.set(r.host, c);
    }
  }
  return [...count.values()].sort((x, y) => y.hits - x.hits || x.best - y.best).slice(0, 5);
}
async function checkLinks(pageUrl, html2, ua) {
  let seen = /* @__PURE__ */ new Set(), links = [];
  for (let m of html2.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (/^(mailto:|tel:|javascript:|data:)/i.test(m[1])) continue;
    let u;
    try {
      u = new URL(m[1], pageUrl).href;
    } catch {
      continue;
    }
    if (!seen.has(u) && (seen.add(u), links.push({ url: u, text: strip2(m[2]).slice(0, 60) || "(no text)", internal: host(u) === host(pageUrl) }), links.length >= 150))
      break;
  }
  let check = async (l) => {
    let ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8e3);
    try {
      let r = await fetch(l.url, { method: "HEAD", redirect: "manual", headers: { "user-agent": ua }, signal: ctl.signal });
      (r.status === 405 || r.status === 403) && (r = await fetch(l.url, { method: "GET", redirect: "manual", headers: { "user-agent": ua }, signal: ctl.signal }));
      let loc = r.headers.get("location");
      return { ...l, status: r.status, to: loc ? new URL(loc, l.url).href : null, kind: r.status >= 400 ? "broken" : r.status >= 300 ? "redirect" : "ok" };
    } catch {
      return { ...l, status: 0, to: null, kind: "broken" };
    } finally {
      clearTimeout(t);
    }
  }, out = [];
  for (let i = 0; i < links.length; i += 6) out.push(...await Promise.all(links.slice(i, i + 6).map(check)));
  let order = { broken: 0, redirect: 1, ok: 2 };
  return out.sort((x, y) => order[x.kind] - order[y.kind]), { url: pageUrl, total: out.length, broken: out.filter((x) => x.kind === "broken").length, redirects: out.filter((x) => x.kind === "redirect").length, links: out };
}

// src/template.html
var template_default = `<title>__TITLE__</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="__DESC__">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
<style>
/* Layout: a fight-night "tale of the tape" \u2014 red corner (you) vs blue corner (rival), centered ring, everything reads left-vs-right. */
:root {
  --bg: #f4f5f8;
  --surface: #ffffff;
  --ink: #0d1017;
  --muted: #5d6474;
  --line: #e1e4ec;
  --red: #e0263a;
  --red-soft: #fde8ea;
  --blue: #2457f5;
  --blue-soft: #e6ecff;
  --gold: #b88716;
  --good: #1a9a5a; --warn: #c98a06; --bad: #d9283b;
  --shadow: 0 1px 2px rgba(13,16,23,.05), 0 12px 32px -12px rgba(13,16,23,.14);
  --f-display: "Big Shoulders Display", "Arial Narrow", Impact, sans-serif;
  --f-body: "Geist", ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
  --f-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0b0d13; --surface: #141823; --ink: #f2f4f8; --muted: #9aa2b4; --line: #252a38;
  --red: #ff4d5e; --red-soft: #3a1219; --blue: #5b84ff; --blue-soft: #121c3d; --gold: #e2b23e;
  --good: #3ccf86; --warn: #f0b429; --bad: #ff5a6a;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 16px 40px -16px rgba(0,0,0,.7);
  color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0b0d13; --surface: #141823; --ink: #f2f4f8; --muted: #9aa2b4; --line: #252a38;
  --red: #ff4d5e; --red-soft: #3a1219; --blue: #5b84ff; --blue-soft: #121c3d; --gold: #e2b23e;
  --good: #3ccf86; --warn: #f0b429; --bad: #ff5a6a;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 16px 40px -16px rgba(0,0,0,.7);
  color-scheme: dark }

* { box-sizing: border-box }
body { background: var(--bg); color: var(--ink); font: 400 16px/1.55 var(--f-body); -webkit-font-smoothing: antialiased }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg) }
.wrap { max-width: 1120px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)) }
a { color: inherit }
h1, h2, h3 { text-wrap: balance; margin: 0 }
.eyebrow { font: 600 12px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted) }
.display { font-family: var(--f-display); font-weight: 900; text-transform: uppercase; letter-spacing: .005em; line-height: .9 }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: 8px }

/* header */
header.top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 9; background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: saturate(1.6) blur(14px); -webkit-backdrop-filter: saturate(1.6) blur(14px); border-bottom: 1px solid var(--line) }
header.top .wrap { display: flex; align-items: center; gap: 24px; height: 60px }
.logo { display: flex; align-items: center; gap: 8px; font: 900 24px/1 var(--f-display); text-transform: uppercase; text-decoration: none; letter-spacing: .02em }
.logo i { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(90deg, var(--red) 50%, var(--blue) 50%); display: block; transform: rotate(45deg) scale(.78) }
nav.links { display: flex; gap: 22px; margin-left: auto; font-size: 14px; color: var(--muted) }
nav.links a { text-decoration: none } nav.links a:hover { color: var(--ink) }
.btn { appearance: none; border: 0; cursor: pointer; font: 600 15px/1 var(--f-body); border-radius: 999px; padding: 12px 20px; background: var(--ink); color: var(--bg); text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: transform .15s ease, opacity .15s }
.btn:hover { transform: translateY(-1px) } .btn:active { transform: none; opacity: .85 }
.btn.ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1px var(--line) }
.btn.sm { padding: 9px 16px; font-size: 14px }
@media (max-width: 720px) { nav.links { display: none } header.top .btn { margin-left: auto } }

/* hero */
.hero { padding-block: 64px 32px; text-align: center }
.hero .live { display: inline-flex; gap: 8px; align-items: center; padding: 7px 12px; border-radius: 999px; background: var(--surface); box-shadow: var(--shadow); font: 500 13px/1 var(--f-body); color: var(--muted) }
.hero .live b { width: 8px; height: 8px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 4px var(--red-soft); animation: pulse 1.6s infinite }
@keyframes pulse { 50% { box-shadow: 0 0 0 7px transparent } }
.hero h1 { font-size: clamp(56px, 11vw, 132px); margin-top: 22px }
.hero h1 .r { color: var(--red) } .hero h1 .b { color: var(--blue) }
.hero p.lede { max-width: 560px; margin: 18px auto 0; color: var(--muted); font-size: 18px }

.ring { margin: 36px auto 0; max-width: 860px; display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; background: var(--surface); padding: 12px; border-radius: 26px; box-shadow: var(--shadow) }
.corner { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 12px 16px; border-radius: 16px; min-width: 0 }
.corner.red { background: var(--red-soft) } .corner.blue { background: var(--blue-soft) }
.corner label { font: 600 11px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase }
.corner.red label { color: var(--red) } .corner.blue label { color: var(--blue) }
.corner input { border: 0; background: transparent; font: 600 19px/1.3 var(--f-body); color: var(--ink); width: 100%; padding: 4px 0; outline: none }
.corner input::placeholder { color: color-mix(in srgb, var(--ink) 35%, transparent) }
.vs { align-self: center; font: 900 30px/1 var(--f-display); color: var(--muted); padding-inline: 4px }
.fight { grid-column: 1 / -1; justify-content: center; font: 900 26px/1 var(--f-display); text-transform: uppercase; letter-spacing: .04em; padding: 18px; border-radius: 16px; background: linear-gradient(90deg, var(--red), color-mix(in srgb, var(--red) 50%, var(--blue)), var(--blue)) ; color: #fff }
.fight[disabled] { opacity: .7; cursor: progress }
.proof { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; margin-top: 18px; font-size: 14px; color: var(--muted) }
.proof span::before { content: "\u2713"; color: var(--good); font-weight: 700; margin-right: 6px }
.err { color: var(--bad); margin-top: 14px; font-weight: 500 }
@media (max-width: 640px) { .ring { grid-template-columns: 1fr } .vs { justify-self: center; padding: 2px } }

/* results */
section { padding-block: 56px }
.sec-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px }
.sec-head h2 { font-size: clamp(40px, 6vw, 64px) }
.tag { font: 600 12px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 7px 10px; border-radius: 999px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted) }

.tape { background: var(--surface); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden }
.tape-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 32px 28px 24px }
.fighter { min-width: 0 } .fighter.b { text-align: right }
.fighter .corner-name { font: 600 11px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase }
.fighter.a .corner-name { color: var(--red) } .fighter.b .corner-name { color: var(--blue) }
.fighter .host { font: 700 clamp(16px, 2.4vw, 22px)/1.2 var(--f-body); margin-top: 8px; overflow-wrap: anywhere }
.fighter .score { font: 900 clamp(84px, 13vw, 150px)/.85 var(--f-display); margin-top: 10px; font-variant-numeric: tabular-nums }
.fighter.a .score { color: var(--red) } .fighter.b .score { color: var(--blue) }
.belt { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; padding: 6px 12px; border-radius: 999px; background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--gold); font: 700 12px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase }
.center-stat { text-align: center; font: 900 22px/1 var(--f-display); color: var(--muted) }
.center-stat small { display: block; font: 500 12px/1.4 var(--f-mono); letter-spacing: .06em; margin-top: 6px; text-transform: uppercase }

.rounds { border-top: 1px solid var(--line); padding: 8px 28px 20px }
.round { display: grid; grid-template-columns: 1fr 170px 1fr; align-items: center; gap: 14px; padding-block: 12px }
.round + .round { border-top: 1px dashed var(--line) }
.round .name { text-align: center; font: 600 13px/1.2 var(--f-body) }
.round .name small { display: block; font: 500 11px/1 var(--f-mono); color: var(--muted); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px }
.bar { height: 10px; border-radius: 999px; background: var(--line); position: relative; overflow: hidden }
.bar > i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; transition: width .9s cubic-bezier(.2,.8,.2,1) }
.bar.a { transform: scaleX(-1) } .bar.a > i { background: var(--red) } .bar.b > i { background: var(--blue) }
.round .val { font: 600 13px/1 var(--f-mono); font-variant-numeric: tabular-nums; display: flex; gap: 10px; align-items: center }
.round .val.a { flex-direction: row-reverse; justify-content: flex-start } .round .val.b { justify-content: flex-start }
.round .val .bar { flex: 1 }
.round .val.won { font-weight: 700 }
.round .val.a.won { color: var(--red) } .round .val.b.won { color: var(--blue) }
@media (max-width: 640px) { .tape-top { grid-template-columns: 1fr 1fr } .center-stat { grid-column: 1 / -1; order: 3 } .round { grid-template-columns: 1fr 96px 1fr; gap: 8px } .rounds { padding-inline: 16px } }

.actions { display: flex; flex-wrap: wrap; gap: 10px; padding: 18px 28px 26px; border-top: 1px solid var(--line) }

.grid2 { display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; margin-top: 20px; align-items: start }
@media (max-width: 900px) { .grid2 { grid-template-columns: 1fr } }
.panel { background: var(--surface); border-radius: 22px; box-shadow: var(--shadow); padding: 22px; min-width: 0 }
.panel h3 { font: 800 28px/1 var(--f-display); text-transform: uppercase; margin-bottom: 4px }
.panel .sub { color: var(--muted); font-size: 14px; margin: 0 0 14px }

.tbl-wrap { overflow-x: auto; margin-inline: -6px }
table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 460px }
th { font: 600 11px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .1em; color: var(--muted); text-align: left; padding: 10px 6px; border-bottom: 1px solid var(--line) }
td { padding: 9px 6px; border-bottom: 1px solid var(--line); vertical-align: middle }
td.v { font-family: var(--f-mono); font-size: 13px; font-variant-numeric: tabular-nums }
tr.cat td { font: 700 11px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .12em; color: var(--muted); padding-top: 18px; border-bottom: 0 }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: 1px }
.dot.good { background: var(--good) } .dot.warn { background: var(--warn) } .dot.bad { background: var(--bad) }
.edge { font: 700 11px/1 var(--f-mono); padding: 4px 7px; border-radius: 6px; white-space: nowrap }
.edge.a { background: var(--red-soft); color: var(--red) } .edge.b { background: var(--blue-soft); color: var(--blue) }
.new { font: 700 10px/1 var(--f-mono); letter-spacing: .08em; padding: 3px 6px; border-radius: 5px; background: color-mix(in srgb, var(--gold) 18%, transparent); color: var(--gold); margin-left: 6px; vertical-align: 1px }

.plan { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px }
.plan li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 14px; border-radius: 14px; background: var(--bg) }
.plan .sev { font: 700 10px/1 var(--f-mono); letter-spacing: .08em; padding: 5px 7px; border-radius: 6px; text-transform: uppercase; margin-top: 2px }
.sev.bad { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad) }
.sev.warn { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn) }
.plan b { display: block; font-weight: 600 } .plan p { margin: 2px 0 0; color: var(--muted); font-size: 14px }
.plan .gain { font: 700 14px/1 var(--f-mono); color: var(--good); white-space: nowrap; margin-top: 3px }
.watch { margin-top: 14px; padding: 16px; border-radius: 14px; box-shadow: inset 0 0 0 1px var(--line); display: grid; gap: 6px }
.watch p { margin: 0; color: var(--muted); font-size: 14px }
.wrow { display: flex; gap: 8px; margin-top: 4px } .wrow input { flex: 1; min-width: 0; border: 0; border-radius: 999px; padding: 10px 14px; background: var(--bg); color: var(--ink); font: 500 15px var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.seo-sum { color: var(--muted); max-width: 760px } .seo-sum h2 { font: 800 30px/1.1 var(--f-display); text-transform: uppercase; color: var(--ink); margin-bottom: 10px }
.board { display: grid; gap: 10px } .bout { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 16px 20px; border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); text-decoration: none }
.bout:hover { transform: translateY(-1px) } .bout .h { font-weight: 600; overflow-wrap: anywhere; min-width: 0 } .bout .h.b { text-align: right }
.bout .s { font: 900 34px/1 var(--f-display); font-variant-numeric: tabular-nums; display: flex; gap: 10px } .bout .s .ra { color: var(--red) } .bout .s .rb { color: var(--blue) } .bout .s i { font-style: normal; color: var(--muted); font-size: 20px; align-self: center }
.rivals-q { margin: 14px 0 0; color: var(--muted); font-size: 15px } .linkbtn { appearance: none; border: 0; background: none; color: var(--ink); font: 600 15px var(--f-body); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 0 }
.rival-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 12px } .rival-list button { border: 0; cursor: pointer; padding: 8px 14px; border-radius: 999px; background: var(--blue-soft); color: var(--blue); font: 600 14px var(--f-body) }
.ai-out { margin-top: 14px; padding: 16px; border-radius: 14px; background: var(--bg); font-size: 15px; white-space: pre-wrap; overflow-wrap: anywhere }
.agent { margin-top: 14px; padding: 16px; border-radius: 14px; background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)); display: flex; gap: 12px; align-items: center; flex-wrap: wrap }
.agent p { margin: 0; flex: 1 1 220px; font-size: 14px } .agent b { display: block; font-size: 15px }

/* features */
.feats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px }
.feat { padding: 22px; border-radius: 20px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line) }
.feat .k { font: 900 44px/1 var(--f-display); }
.feat h3 { font: 600 17px/1.3 var(--f-body); margin: 12px 0 6px }
.feat p { margin: 0; color: var(--muted); font-size: 15px }
.feat.hl { background: var(--ink); color: var(--bg); box-shadow: none } .feat.hl p { color: color-mix(in srgb, var(--bg) 70%, transparent) }
@media (max-width: 860px) { .feats { grid-template-columns: 1fr 1fr } } @media (max-width: 560px) { .feats { grid-template-columns: 1fr } }

.vs-table td:nth-child(2), .vs-table th:nth-child(2) { text-align: center; color: var(--muted) }
.vs-table td:nth-child(3), .vs-table th:nth-child(3) { text-align: center; font-weight: 600 }
.vs-table td:nth-child(3) { color: var(--ink) }
.vs-table th:nth-child(3) { color: var(--red) }

/* pricing */
.prices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: stretch }
.price { padding: 26px; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 14px; position: relative }
.price.pop { box-shadow: 0 0 0 2px var(--red), var(--shadow) }
.price .pill { position: absolute; top: -12px; left: 26px; background: var(--red); color: #fff; font: 700 11px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 6px 10px; border-radius: 999px }
.price h3 { font: 800 26px/1 var(--f-display); text-transform: uppercase }
.price .amt { font: 900 64px/.9 var(--f-display); font-variant-numeric: tabular-nums } .price .amt small { font: 500 15px var(--f-body); color: var(--muted); margin-left: 4px }
.price ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; font-size: 15px; flex: 1 }
.price li::before { content: "\u2713"; color: var(--good); font-weight: 700; margin-right: 8px }
.price .btn { justify-content: center }
.price.pop .btn { background: var(--red); color: #fff }
@media (max-width: 860px) { .prices { grid-template-columns: 1fr } }

details { background: var(--surface); border-radius: 16px; padding: 18px 20px; box-shadow: inset 0 0 0 1px var(--line) }
details + details { margin-top: 10px }
summary { cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px }
summary::after { content: "+"; font: 500 20px/1 var(--f-mono); color: var(--muted) } details[open] summary::after { content: "\u2013" }
details p { margin: 10px 0 0; color: var(--muted) }
footer { padding-block: 40px 56px; color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); margin-top: 32px }
footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px }

/* fight card modal */
.modal { position: fixed; inset: 0; z-index: 20; background: rgba(5,7,12,.72); backdrop-filter: blur(8px); display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)) }
.modal .box { background: var(--surface); border-radius: 24px; padding: 18px; display: grid; gap: 14px; max-height: 100%; overflow: auto; width: min(420px, 100%) }
.modal canvas { width: 100%; height: auto; border-radius: 14px; display: block; aspect-ratio: 9 / 16; max-width: 100% }
.modal .row { display: flex; gap: 8px; flex-wrap: wrap } .modal .row .btn { flex: 1; justify-content: center }
.toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 12px 18px; border-radius: 999px; font-weight: 600; font-size: 14px; z-index: 30 }
.loading .tape, .loading .grid2 { opacity: .45; filter: saturate(.4); transition: opacity .2s }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }
</style>

<header class="top"><div class="wrap">
  <a class="logo" href="/" aria-label="SEO Fight home"><i></i>SEO Fight</a>
  <nav class="links"><a href="/keywords-battle">Keyword Battle</a><a href="/tools">Free tools</a><a href="/fights">Biggest fights</a><a href="#pricing">Pricing</a></nav>
  <a class="btn sm" href="/#top">Start a fight</a>
</div></header>

<main id="top">
  <div class="wrap hero">
    <span class="live"><b></b>Live SEO fights \xB7 Google + ChatGPT</span>
    <h1 class="display">__H1__</h1>
    <p class="lede">__LEDE__</p>
    <form class="ring" id="duelForm" novalidate>
      <div class="corner red"><label for="a">Red corner \xB7 You</label><input id="a" name="a" inputmode="url" autocomplete="off" placeholder="yoursite.com" value="__A__"></div>
      <div class="vs" aria-hidden="true">VS</div>
      <div class="corner blue"><label for="b">Blue corner \xB7 Rival</label><input id="b" name="b" inputmode="url" autocomplete="off" placeholder="rival.com" value="__B__"></div>
      <button class="btn fight" id="fightBtn" type="submit">Fight</button>
    </form>
    <p class="rivals-q">Don't know your rival? <button type="button" class="linkbtn" id="rivalBtn">Find SEO rivals for me</button></p>
    <div class="rival-list" id="rivalList" hidden></div>
    <div class="err" id="err" hidden></div>
    <div class="proof"><span>31 ranking signals</span><span>Real page data, not estimates</span><span>Google + AI search</span></div>
  </div>

  <section id="fight"><div class="wrap" id="results">
    <div class="sec-head">
      <h2 class="display">Tale of the tape</h2>
      <span class="tag" id="modeTag">__MODE__</span>
    </div>

    <div class="tape">
      <div class="tape-top">
        <div class="fighter a"><div class="corner-name">Red corner</div><div class="host" id="hostA"></div><div class="score" id="scoreA">0</div><div id="beltA"></div></div>
        <div class="center-stat" id="center"></div>
        <div class="fighter b"><div class="corner-name">Blue corner</div><div class="host" id="hostB"></div><div class="score" id="scoreB">0</div><div id="beltB"></div></div>
      </div>
      <div class="rounds" id="rounds"></div>
      <div class="actions">
        <button class="btn" id="cardBtn" type="button">Make TikTok fight card</button>
        <button class="btn ghost" id="copyBtn" type="button">Export report (.md) for Claude Code</button>
        <button class="btn ghost" id="shareBtn" type="button">Copy link to this fight</button>
      </div>
    </div>

    <div class="grid2">
      <div class="panel">
        <h3>Every punch</h3>
        <p class="sub">Each check, side by side. The tag shows who took it.</p>
        <div class="tbl-wrap"><table id="checks"><thead><tr><th>Check</th><th id="thA">You</th><th id="thB">Rival</th><th></th></tr></thead><tbody></tbody></table></div>
      </div>
      <div class="panel">
        <h3>Your comeback plan</h3>
        <p class="sub" id="planSub"></p>
        <ol class="plan" id="plan"></ol>
        <form class="watch" id="watchForm" novalidate><b>Watch this rival for free</b><p>We re-run this fight every Monday and email you if the score changes.</p><div class="wrow"><input id="wemail" type="email" autocomplete="email" placeholder="you@email.com" aria-label="Your email"><button class="btn sm" type="submit">Watch</button></div></form>
        <div class="agent"><p><b>AI strategy</b>A full game plan to beat this rival: what to fix, what to write, in what order. Pro, 4 per month.</p><button class="btn sm" type="button" id="aiBtn">Get AI strategy</button></div>
        <div class="ai-out" id="aiOut" hidden></div>
      </div>
    </div>
  </div></section>

  __SUMMARY__
  <section id="why"><div class="wrap">
    <div class="sec-head"><h2 class="display">Built to win</h2></div>
    <div class="feats">
      <div class="feat hl"><div class="k">31</div><h3>Checks per site</h3><p>Title, headings, speed, schema, sitemap, share previews and more. Read live from the page, never guessed.</p></div>
      <div class="feat"><div class="k">AI</div><h3>AI search round</h3><p>Can ChatGPT, Claude and Perplexity read you? We check AI crawler access, llms.txt, schema and answer-ready content.</p></div>
      <div class="feat"><div class="k">9:16</div><h3>Fight cards</h3><p>Every result turns into a vertical card made for TikTok, Reels and Shorts. Post it, tag your rival.</p></div>
      <div class="feat"><div class="k">+pts</div><h3>Ranked fixes</h3><p>Each fix shows how many points it wins you, so you do the biggest move first.</p></div>
      <div class="feat"><div class="k">10</div><h3>Keyword Battle</h3><p>Pick 10 keywords. See who ranks higher on Google for each one, in any country.</p></div>
      <div class="feat"><div class="k">Mon</div><h3>Movement reports</h3><p>Every Monday we re-run your fights and email you what moved and who passed who.</p></div>
    </div>

    <div class="panel" style="margin-top:20px">
      <h3>SEO Fight vs the other duel tools</h3>
      <div class="tbl-wrap"><table class="vs-table"><thead><tr><th>What you get</th><th>Others</th><th>SEO Fight</th></tr></thead><tbody>
        <tr><td>Checks per site</td><td>14</td><td>31</td></tr>
        <tr><td>AI search (ChatGPT, Perplexity) round</td><td>\u2014</td><td>\u2713</td></tr>
        <tr><td>Pro price</td><td>$19\u201329/mo</td><td>$12/mo</td></tr>
        <tr><td>Points gained per fix</td><td>\u2014</td><td>\u2713</td></tr>
        <tr><td>Vertical share card for TikTok</td><td>\u2014</td><td>\u2713</td></tr>
        <tr><td>Free SEO tools</td><td>3</td><td>4 (adds llms.txt)</td></tr>
        <tr><td>AI crawler controls in robots.txt tool</td><td>\u2014</td><td>\u2713</td></tr>
        <tr><td>Lifetime deal</td><td>\u2014</td><td>\u2713</td></tr>
      </tbody></table></div>
    </div>
  </div></section>

  <section id="pricing"><div class="wrap">
    <div class="sec-head"><h2 class="display">Pick your weight class</h2><span class="tag">14-day money-back</span></div>
    <div class="prices">
      <div class="price"><h3>Free</h3><div class="amt">$0<small>forever</small></div>
        <ul><li>1 fight per week</li><li>1 of 10 keywords in Keyword Battle</li><li>Report export (watermarked)</li><li>TikTok fight cards</li><li>All free SEO tools</li></ul>
        <a class="btn ghost" href="#top">Start fighting</a></div>
      <div class="price pop"><span class="pill">Most picked</span><h3>Pro</h3><div class="amt">$12<small>/month</small></div>
        <ul><li>40 fights per month</li><li>AI strategy (4 per month)</li><li>4 Keyword Battles per month</li><li>All 10 keywords visible</li><li>Clean report export</li><li>Monday email movement reports</li><li>Any country</li><li>Priority support</li></ul>
        <a class="btn" href="__PRO__">Go Pro</a></div>
      <div class="price"><h3>Lifetime</h3><div class="amt">$79<small>once</small></div>
        <ul><li>Everything in Pro</li><li>Pay once, keep it forever</li><li>First 500 fighters only</li></ul>
        <a class="btn ghost" href="__LIFE__">Get lifetime</a></div>
    </div>
  </div></section>

  <section id="faq"><div class="wrap" style="max-width:780px">
    <div class="sec-head"><h2 class="display">Ringside questions</h2></div>
    <details><summary>Where does the data come from?</summary><p>We load both homepages live, the same way a browser does, plus their robots.txt, sitemap and llms.txt. No third-party guesses, no made-up traffic numbers.</p></details>
    <details><summary>What is the AI search round?</summary><p>More people now ask ChatGPT, Claude and Perplexity instead of Google. This round checks if those AIs are allowed to read your site and if your page is easy for them to quote.</p></details>
    <details><summary>Does a higher score mean I rank higher?</summary><p>It means your page does more of the things search engines and AIs reward. Rankings also depend on links and brand, which no honest tool can promise.</p></details>
    <details><summary>Why only 1 free fight a week?</summary><p>Every fight loads both sites live. One a week lets you try it properly. Pro gives you 40 a month, AI strategy and Keyword Battles.</p></details>
    <details><summary>How do I use the report?</summary><p>Export it and paste it into Claude Code, Cursor or ChatGPT. Ask it to apply every fix to your site.</p></details>
    <details><summary>Can I fight any website?</summary><p>Any public site. Pages behind a login or blocking bots will show as not reachable.</p></details>
  </div></section>
</main>

<footer><div class="wrap"><span>\xA9 2026 SEO Fight</span><span>Fight fair. Fix fast.</span></div></footer>

<div class="modal" id="modal" hidden>
  <div class="box">
    <canvas id="card" width="1080" height="1920" aria-label="Fight card image"></canvas>
    <div class="row"><button class="btn" id="dlBtn" type="button">Save image</button><button class="btn ghost" id="closeBtn" type="button">Close</button></div>
  </div>
</div>
<div class="toast" id="toast" hidden></div>

<script>
const DEMO = __DATA__;
const LIVE = __LIVE__;
const CATS = [["onpage","Round 1","On-page"],["content","Round 2","Content"],["technical","Round 3","Technical"],["ai","Round 4","AI search"],["social","Round 5","Social"]];
const NEW_IDS = new Set(["aibots","llms","entity","faq","ttfb","size","compress","redirects","hsts","canonical","lang","external","ogdesc","twitter","favicon","robots","headings"]);
let D = DEMO;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

function countUp(el, to) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 900;
  const step = t => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
  el.textContent = to; requestAnimationFrame(step);
}

function render(d, live) {
  $("#modeTag").textContent = live ? "Live result" : "Example fight";
  $("#hostA").textContent = d.a.host; $("#hostB").textContent = d.b.host;
  $("#thA").textContent = d.a.host; $("#thB").textContent = d.b.host;
  countUp($("#scoreA"), d.a.score); countUp($("#scoreB"), d.b.score);
  const belt = '<span class="belt">\u2605 Winner</span>';
  $("#beltA").innerHTML = d.winner === "a" ? belt : ""; $("#beltB").innerHTML = d.winner === "b" ? belt : "";
  const roundsA = CATS.filter(([k]) => d.a.scores[k] > d.b.scores[k]).length, roundsB = CATS.filter(([k]) => d.b.scores[k] > d.a.scores[k]).length;
  $("#center").innerHTML = \`\${roundsA}\u2013\${roundsB}<small>rounds won</small>\`;
  $("#rounds").innerHTML = CATS.map(([k, r, n]) => {
    const a = d.a.scores[k] ?? 0, b = d.b.scores[k] ?? 0;
    return \`<div class="round"><div class="val a \${a > b ? "won" : ""}"><div class="bar a"><i style="width:\${a}%"></i></div>\${a}</div><div class="name"><small>\${r}</small>\${n}</div><div class="val b \${b > a ? "won" : ""}"><div class="bar b"><i style="width:\${b}%"></i></div>\${b}</div></div>\`;
  }).join("");
  let html = "", last = "";
  for (const row of d.rows) {
    if (row.cat !== last) { last = row.cat; html += \`<tr class="cat"><td colspan="4">\${CATS.find(c => c[0] === row.cat)[2]}</td></tr>\`; }
    const edge = row.edge === "a" ? \`<span class="edge a">You</span>\` : row.edge === "b" ? \`<span class="edge b">Rival</span>\` : "";
    html += \`<tr><td>\${esc(row.label)}\${NEW_IDS.has(row.id) ? '<span class="new">NEW</span>' : ""}</td><td class="v"><span class="dot \${row.a.status}"></span>\${esc(row.a.value)}</td><td class="v"><span class="dot \${row.b ? row.b.status : "warn"}"></span>\${esc(row.b ? row.b.value : "\u2014")}</td><td>\${edge}</td></tr>\`;
  }
  $("#checks tbody").innerHTML = html;
  const top = d.plan.slice(0, 6), total = d.plan.reduce((s, p) => s + p.gain, 0);
  $("#planSub").textContent = d.plan.length ? \`\${d.plan.length} moves for \${d.a.host}. Do all of them for up to +\${total} points.\` : \`\${d.a.host} is flawless. Defend the belt.\`;
  $("#plan").innerHTML = top.map(p => \`<li><span class="sev \${p.status}">\${p.status === "bad" ? "Critical" : "Improve"}</span><div><b>\${esc(p.label)}</b><p>\${esc(p.fix)}</p></div><span class="gain">+\${p.gain}</span></li>\`).join("");
}

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }
async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(done); } catch { toast("Select and copy the text manually"); } ta.remove(); }
}

$("#duelForm").addEventListener("submit", async e => {
  e.preventDefault();
  const a = $("#a").value.trim(), b = $("#b").value.trim(), err = $("#err");
  err.hidden = true;
  if (!a || !b) { err.textContent = "Enter both websites to start the fight."; err.hidden = false; return; }
  const btn = $("#fightBtn"); btn.disabled = true; btn.textContent = "Fighting\u2026";
  document.body.classList.add("loading");
  document.getElementById("fight").scrollIntoView({ behavior: "smooth" });
  try {
    const r = await fetch(\`/api/duel?a=\${encodeURIComponent(a)}&b=\${encodeURIComponent(b)}\`);
    const j = await r.json();
    if (r.status === 429) { location.hash = "pricing"; }
    if (!r.ok) throw new Error(j.error || "Fight failed");
    D = j; render(D, true);
    try { if (j.slug) history.replaceState(null, "", \`/fight/\${j.slug}\`); } catch {}
  } catch (x) {
    err.textContent = x.message && x.message !== "Failed to fetch" && !/JSON/.test(x.message) ? x.message : "Live fights run on the real site. This preview shows the example fight.";
    err.hidden = false;
  } finally { btn.disabled = false; btn.textContent = "Fight"; document.body.classList.remove("loading"); }
});

$("#rivalBtn").addEventListener("click", async () => {
  const a = $("#a").value.trim(); if (!a) { toast("Enter your website first"); $("#a").focus(); return; }
  const btn = $("#rivalBtn"); btn.textContent = "Finding rivals\u2026";
  try {
    const r = await fetch(\`/api/rivals?site=\${encodeURIComponent(a)}\`); const j = await r.json(); if (!r.ok) throw new Error(j.error);
    const list = $("#rivalList");
    list.innerHTML = j.rivals.length ? j.rivals.map(x => \`<button type="button" data-h="\${esc(x.host)}">\${esc(x.host)}</button>\`).join("") : "<span>No clear rivals found. Try entering one.</span>";
    list.hidden = false;
    list.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { $("#b").value = b.dataset.h; $("#duelForm").requestSubmit(); }));
  } catch (x) { toast(x.message && !/fetch|JSON/.test(x.message) ? x.message : "Rival finder runs on the live site"); }
  finally { btn.textContent = "Find SEO rivals for me"; }
});
$("#aiBtn").addEventListener("click", async () => {
  const btn = $("#aiBtn"); btn.disabled = true; btn.textContent = "Thinking\u2026";
  try {
    const r = await fetch("/api/strategy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: D.a.host, b: D.b.host }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    $("#aiOut").textContent = j.strategy; $("#aiOut").hidden = false;
  } catch (x) { toast(x.message && !/fetch|JSON/.test(x.message) ? x.message : "AI strategy runs on the live site"); }
  finally { btn.disabled = false; btn.textContent = "Get AI strategy"; }
});
$("#copyBtn").addEventListener("click", () => copy(D.markdown, "Fix list copied. Paste it into Claude Code."));
$("#shareBtn").addEventListener("click", () => copy(\`\${location.origin}/fight/\${D.slug || (D.a.host + "-vs-" + D.b.host)}\`, "Fight link copied"));
$("#watchForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#wemail").value.trim();
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) { toast("Enter a valid email"); return; }
  try {
    const r = await fetch("/api/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, a: D.a.host, b: D.b.host }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    $("#watchForm").innerHTML = \`<b>Watching \${esc(D.b.host)}</b><p>We'll email \${esc(email)} every Monday the score moves.</p>\`;
  } catch (x) { toast(x.message && !/fetch|JSON/.test(x.message) ? x.message : "Watching works on the live site"); }
});

/* ---------- TikTok fight card (1080\xD71920) ---------- */
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
async function drawCard() {
  try { await document.fonts.load('900 100px "Big Shoulders Display"'); await document.fonts.load('600 40px "Geist"'); } catch {}
  const c = $("#card"), x = c.getContext("2d"), W = 1080, H = 1920, red = "#ff3b4e", blue = "#3d6bff", gold = "#f2c14e";
  const DF = '"Big Shoulders Display", Impact, sans-serif', BF = '"Geist", -apple-system, sans-serif', MF = '"Geist Mono", Menlo, monospace';
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0b0d13"); g.addColorStop(1, "#05060a"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const rg = x.createRadialGradient(0, 760, 0, 0, 760, 700); rg.addColorStop(0, "rgba(255,59,78,.35)"); rg.addColorStop(1, "rgba(255,59,78,0)"); x.fillStyle = rg; x.fillRect(0, 0, W, H);
  const bg = x.createRadialGradient(W, 760, 0, W, 760, 700); bg.addColorStop(0, "rgba(61,107,255,.35)"); bg.addColorStop(1, "rgba(61,107,255,0)"); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.textAlign = "center"; x.fillStyle = "rgba(255,255,255,.6)"; x.font = \`600 34px \${MF}\`; x.fillText("SEO FIGHT NIGHT", W / 2, 170);
  x.fillStyle = "#fff"; x.font = \`900 150px \${DF}\`; x.fillText("WHO WINS", W / 2, 330); x.fillText("ON GOOGLE?", W / 2, 470);
  const fitHost = (t, max) => { let s = 54; x.font = \`700 \${s}px \${BF}\`; while (x.measureText(t).width > max && s > 26) { s -= 2; x.font = \`700 \${s}px \${BF}\`; } };
  [[d => d.a, red, W * .27, "a"], [d => d.b, blue, W * .73, "b"]].forEach(([get, col, cx, side]) => {
    const s = get(D);
    x.fillStyle = col; x.font = \`600 30px \${MF}\`; x.fillText(side === "a" ? "RED CORNER" : "BLUE CORNER", cx, 640);
    x.fillStyle = "#fff"; fitHost(s.host, 440); x.fillText(s.host, cx, 715);
    x.fillStyle = col; x.font = \`900 300px \${DF}\`; x.fillText(String(s.score), cx, 1000);
    if (D.winner === side) { x.fillStyle = gold; x.font = \`800 44px \${DF}\`; x.fillText("\u2605 WINNER \u2605", cx, 1075); }
  });
  x.fillStyle = "rgba(255,255,255,.35)"; x.font = \`900 80px \${DF}\`; x.fillText("VS", W / 2, 900);
  CATS.forEach(([k, , n], i) => {
    const y = 1190 + i * 108, a = D.a.scores[k] ?? 0, b = D.b.scores[k] ?? 0, half = 360;
    x.fillStyle = "rgba(255,255,255,.75)"; x.font = \`600 30px \${BF}\`; x.fillText(n.toUpperCase(), W / 2, y - 22);
    x.fillStyle = "rgba(255,255,255,.1)"; x.fillRect(W / 2 - 40 - half, y, half, 22); x.fillRect(W / 2 + 40, y, half, 22);
    x.fillStyle = red; x.fillRect(W / 2 - 40 - half * a / 100, y, half * a / 100, 22);
    x.fillStyle = blue; x.fillRect(W / 2 + 40, y, half * b / 100, 22);
    x.font = \`600 28px \${MF}\`; x.fillStyle = a >= b ? "#fff" : "rgba(255,255,255,.5)"; x.textAlign = "right"; x.fillText(a, W / 2 - 52 - half, y + 21);
    x.fillStyle = b >= a ? "#fff" : "rgba(255,255,255,.5)"; x.textAlign = "left"; x.fillText(b, W / 2 + 52 + half, y + 21); x.textAlign = "center";
  });
  x.fillStyle = "#fff"; x.font = \`800 64px \${DF}\`; x.fillText("WHO WINS YOURS?", W / 2, 1790);
  x.fillStyle = "rgba(255,255,255,.65)"; x.font = \`600 36px \${MF}\`; x.fillText(/claude|localhost/.test(location.host) ? "seofight.app" : location.host.replace(/^www\\./, ""), W / 2, 1850);
}
$("#cardBtn").addEventListener("click", async () => { $("#modal").hidden = false; await drawCard(); });
$("#closeBtn").addEventListener("click", () => $("#modal").hidden = true);
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") $("#modal").hidden = true; });
$("#dlBtn").addEventListener("click", () => {
  $("#card").toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = \`seofight-\${D.a.host}-vs-\${D.b.host}.png\`; a.click(); toast("Saving image\u2026 if nothing happens, long-press the card to save it"); });
});

render(D, LIVE);
const q = new URLSearchParams(location.search); /* old ?a=&b= links still work */
if (q.get("a") && q.get("b")) { $("#a").value = q.get("a"); $("#b").value = q.get("b"); $("#duelForm").requestSubmit(); }
</script>
`;

// src/tools.html
var tools_default = `<title>__TITLE__</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="__DESC__">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
<style>

/* Layout: a fight-night "tale of the tape" \u2014 red corner (you) vs blue corner (rival), centered ring, everything reads left-vs-right. */
:root {
  --bg: #f4f5f8;
  --surface: #ffffff;
  --ink: #0d1017;
  --muted: #5d6474;
  --line: #e1e4ec;
  --red: #e0263a;
  --red-soft: #fde8ea;
  --blue: #2457f5;
  --blue-soft: #e6ecff;
  --gold: #b88716;
  --good: #1a9a5a; --warn: #c98a06; --bad: #d9283b;
  --shadow: 0 1px 2px rgba(13,16,23,.05), 0 12px 32px -12px rgba(13,16,23,.14);
  --f-display: "Big Shoulders Display", "Arial Narrow", Impact, sans-serif;
  --f-body: "Geist", ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
  --f-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0b0d13; --surface: #141823; --ink: #f2f4f8; --muted: #9aa2b4; --line: #252a38;
  --red: #ff4d5e; --red-soft: #3a1219; --blue: #5b84ff; --blue-soft: #121c3d; --gold: #e2b23e;
  --good: #3ccf86; --warn: #f0b429; --bad: #ff5a6a;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 16px 40px -16px rgba(0,0,0,.7);
  color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0b0d13; --surface: #141823; --ink: #f2f4f8; --muted: #9aa2b4; --line: #252a38;
  --red: #ff4d5e; --red-soft: #3a1219; --blue: #5b84ff; --blue-soft: #121c3d; --gold: #e2b23e;
  --good: #3ccf86; --warn: #f0b429; --bad: #ff5a6a;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 16px 40px -16px rgba(0,0,0,.7);
  color-scheme: dark }

* { box-sizing: border-box }
body { background: var(--bg); color: var(--ink); font: 400 16px/1.55 var(--f-body); -webkit-font-smoothing: antialiased }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg) }
.wrap { max-width: 1120px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)) }
a { color: inherit }
h1, h2, h3 { text-wrap: balance; margin: 0 }
.eyebrow { font: 600 12px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted) }
.display { font-family: var(--f-display); font-weight: 900; text-transform: uppercase; letter-spacing: .005em; line-height: .9 }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: 8px }

/* header */
header.top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 9; background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: saturate(1.6) blur(14px); -webkit-backdrop-filter: saturate(1.6) blur(14px); border-bottom: 1px solid var(--line) }
header.top .wrap { display: flex; align-items: center; gap: 24px; height: 60px }
.logo { display: flex; align-items: center; gap: 8px; font: 900 24px/1 var(--f-display); text-transform: uppercase; text-decoration: none; letter-spacing: .02em }
.logo i { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(90deg, var(--red) 50%, var(--blue) 50%); display: block; transform: rotate(45deg) scale(.78) }
nav.links { display: flex; gap: 22px; margin-left: auto; font-size: 14px; color: var(--muted) }
nav.links a { text-decoration: none } nav.links a:hover { color: var(--ink) }
.btn { appearance: none; border: 0; cursor: pointer; font: 600 15px/1 var(--f-body); border-radius: 999px; padding: 12px 20px; background: var(--ink); color: var(--bg); text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: transform .15s ease, opacity .15s }
.btn:hover { transform: translateY(-1px) } .btn:active { transform: none; opacity: .85 }
.btn.ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1px var(--line) }
.btn.sm { padding: 9px 16px; font-size: 14px }
@media (max-width: 720px) { nav.links { display: none } header.top .btn { margin-left: auto } }

/* hero */
.hero { padding-block: 64px 32px; text-align: center }
.hero .live { display: inline-flex; gap: 8px; align-items: center; padding: 7px 12px; border-radius: 999px; background: var(--surface); box-shadow: var(--shadow); font: 500 13px/1 var(--f-body); color: var(--muted) }
.hero .live b { width: 8px; height: 8px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 4px var(--red-soft); animation: pulse 1.6s infinite }
@keyframes pulse { 50% { box-shadow: 0 0 0 7px transparent } }
.hero h1 { font-size: clamp(56px, 11vw, 132px); margin-top: 22px }
.hero h1 .r { color: var(--red) } .hero h1 .b { color: var(--blue) }
.hero p.lede { max-width: 560px; margin: 18px auto 0; color: var(--muted); font-size: 18px }

.ring { margin: 36px auto 0; max-width: 860px; display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; background: var(--surface); padding: 12px; border-radius: 26px; box-shadow: var(--shadow) }
.corner { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 12px 16px; border-radius: 16px; min-width: 0 }
.corner.red { background: var(--red-soft) } .corner.blue { background: var(--blue-soft) }
.corner label { font: 600 11px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase }
.corner.red label { color: var(--red) } .corner.blue label { color: var(--blue) }
.corner input { border: 0; background: transparent; font: 600 19px/1.3 var(--f-body); color: var(--ink); width: 100%; padding: 4px 0; outline: none }
.corner input::placeholder { color: color-mix(in srgb, var(--ink) 35%, transparent) }
.vs { align-self: center; font: 900 30px/1 var(--f-display); color: var(--muted); padding-inline: 4px }
.fight { grid-column: 1 / -1; justify-content: center; font: 900 26px/1 var(--f-display); text-transform: uppercase; letter-spacing: .04em; padding: 18px; border-radius: 16px; background: linear-gradient(90deg, var(--red), color-mix(in srgb, var(--red) 50%, var(--blue)), var(--blue)) ; color: #fff }
.fight[disabled] { opacity: .7; cursor: progress }
.proof { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; margin-top: 18px; font-size: 14px; color: var(--muted) }
.proof span::before { content: "\u2713"; color: var(--good); font-weight: 700; margin-right: 6px }
.err { color: var(--bad); margin-top: 14px; font-weight: 500 }
@media (max-width: 640px) { .ring { grid-template-columns: 1fr } .vs { justify-self: center; padding: 2px } }

/* results */
section { padding-block: 56px }
.sec-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px }
.sec-head h2 { font-size: clamp(40px, 6vw, 64px) }
.tag { font: 600 12px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 7px 10px; border-radius: 999px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted) }

.tape { background: var(--surface); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden }
.tape-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 32px 28px 24px }
.fighter { min-width: 0 } .fighter.b { text-align: right }
.fighter .corner-name { font: 600 11px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase }
.fighter.a .corner-name { color: var(--red) } .fighter.b .corner-name { color: var(--blue) }
.fighter .host { font: 700 clamp(16px, 2.4vw, 22px)/1.2 var(--f-body); margin-top: 8px; overflow-wrap: anywhere }
.fighter .score { font: 900 clamp(84px, 13vw, 150px)/.85 var(--f-display); margin-top: 10px; font-variant-numeric: tabular-nums }
.fighter.a .score { color: var(--red) } .fighter.b .score { color: var(--blue) }
.belt { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; padding: 6px 12px; border-radius: 999px; background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--gold); font: 700 12px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase }
.center-stat { text-align: center; font: 900 22px/1 var(--f-display); color: var(--muted) }
.center-stat small { display: block; font: 500 12px/1.4 var(--f-mono); letter-spacing: .06em; margin-top: 6px; text-transform: uppercase }

.rounds { border-top: 1px solid var(--line); padding: 8px 28px 20px }
.round { display: grid; grid-template-columns: 1fr 170px 1fr; align-items: center; gap: 14px; padding-block: 12px }
.round + .round { border-top: 1px dashed var(--line) }
.round .name { text-align: center; font: 600 13px/1.2 var(--f-body) }
.round .name small { display: block; font: 500 11px/1 var(--f-mono); color: var(--muted); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px }
.bar { height: 10px; border-radius: 999px; background: var(--line); position: relative; overflow: hidden }
.bar > i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; transition: width .9s cubic-bezier(.2,.8,.2,1) }
.bar.a { transform: scaleX(-1) } .bar.a > i { background: var(--red) } .bar.b > i { background: var(--blue) }
.round .val { font: 600 13px/1 var(--f-mono); font-variant-numeric: tabular-nums; display: flex; gap: 10px; align-items: center }
.round .val.a { flex-direction: row-reverse; justify-content: flex-start } .round .val.b { justify-content: flex-start }
.round .val .bar { flex: 1 }
.round .val.won { font-weight: 700 }
.round .val.a.won { color: var(--red) } .round .val.b.won { color: var(--blue) }
@media (max-width: 640px) { .tape-top { grid-template-columns: 1fr 1fr } .center-stat { grid-column: 1 / -1; order: 3 } .round { grid-template-columns: 1fr 96px 1fr; gap: 8px } .rounds { padding-inline: 16px } }

.actions { display: flex; flex-wrap: wrap; gap: 10px; padding: 18px 28px 26px; border-top: 1px solid var(--line) }

.grid2 { display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; margin-top: 20px; align-items: start }
@media (max-width: 900px) { .grid2 { grid-template-columns: 1fr } }
.panel { background: var(--surface); border-radius: 22px; box-shadow: var(--shadow); padding: 22px; min-width: 0 }
.panel h3 { font: 800 28px/1 var(--f-display); text-transform: uppercase; margin-bottom: 4px }
.panel .sub { color: var(--muted); font-size: 14px; margin: 0 0 14px }

.tbl-wrap { overflow-x: auto; margin-inline: -6px }
table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 460px }
th { font: 600 11px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .1em; color: var(--muted); text-align: left; padding: 10px 6px; border-bottom: 1px solid var(--line) }
td { padding: 9px 6px; border-bottom: 1px solid var(--line); vertical-align: middle }
td.v { font-family: var(--f-mono); font-size: 13px; font-variant-numeric: tabular-nums }
tr.cat td { font: 700 11px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .12em; color: var(--muted); padding-top: 18px; border-bottom: 0 }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: 1px }
.dot.good { background: var(--good) } .dot.warn { background: var(--warn) } .dot.bad { background: var(--bad) }
.edge { font: 700 11px/1 var(--f-mono); padding: 4px 7px; border-radius: 6px; white-space: nowrap }
.edge.a { background: var(--red-soft); color: var(--red) } .edge.b { background: var(--blue-soft); color: var(--blue) }
.new { font: 700 10px/1 var(--f-mono); letter-spacing: .08em; padding: 3px 6px; border-radius: 5px; background: color-mix(in srgb, var(--gold) 18%, transparent); color: var(--gold); margin-left: 6px; vertical-align: 1px }

.plan { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px }
.plan li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 14px; border-radius: 14px; background: var(--bg) }
.plan .sev { font: 700 10px/1 var(--f-mono); letter-spacing: .08em; padding: 5px 7px; border-radius: 6px; text-transform: uppercase; margin-top: 2px }
.sev.bad { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad) }
.sev.warn { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn) }
.plan b { display: block; font-weight: 600 } .plan p { margin: 2px 0 0; color: var(--muted); font-size: 14px }
.plan .gain { font: 700 14px/1 var(--f-mono); color: var(--good); white-space: nowrap; margin-top: 3px }
.watch { margin-top: 14px; padding: 16px; border-radius: 14px; box-shadow: inset 0 0 0 1px var(--line); display: grid; gap: 6px }
.watch p { margin: 0; color: var(--muted); font-size: 14px }
.wrow { display: flex; gap: 8px; margin-top: 4px } .wrow input { flex: 1; min-width: 0; border: 0; border-radius: 999px; padding: 10px 14px; background: var(--bg); color: var(--ink); font: 500 15px var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.seo-sum { color: var(--muted); max-width: 760px } .seo-sum h2 { font: 800 30px/1.1 var(--f-display); text-transform: uppercase; color: var(--ink); margin-bottom: 10px }
.board { display: grid; gap: 10px } .bout { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 16px 20px; border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); text-decoration: none }
.bout:hover { transform: translateY(-1px) } .bout .h { font-weight: 600; overflow-wrap: anywhere; min-width: 0 } .bout .h.b { text-align: right }
.bout .s { font: 900 34px/1 var(--f-display); font-variant-numeric: tabular-nums; display: flex; gap: 10px } .bout .s .ra { color: var(--red) } .bout .s .rb { color: var(--blue) } .bout .s i { font-style: normal; color: var(--muted); font-size: 20px; align-self: center }
.rivals-q { margin: 14px 0 0; color: var(--muted); font-size: 15px } .linkbtn { appearance: none; border: 0; background: none; color: var(--ink); font: 600 15px var(--f-body); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 0 }
.rival-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 12px } .rival-list button { border: 0; cursor: pointer; padding: 8px 14px; border-radius: 999px; background: var(--blue-soft); color: var(--blue); font: 600 14px var(--f-body) }
.ai-out { margin-top: 14px; padding: 16px; border-radius: 14px; background: var(--bg); font-size: 15px; white-space: pre-wrap; overflow-wrap: anywhere }
.agent { margin-top: 14px; padding: 16px; border-radius: 14px; background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)); display: flex; gap: 12px; align-items: center; flex-wrap: wrap }
.agent p { margin: 0; flex: 1 1 220px; font-size: 14px } .agent b { display: block; font-size: 15px }

/* features */
.feats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px }
.feat { padding: 22px; border-radius: 20px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line) }
.feat .k { font: 900 44px/1 var(--f-display); }
.feat h3 { font: 600 17px/1.3 var(--f-body); margin: 12px 0 6px }
.feat p { margin: 0; color: var(--muted); font-size: 15px }
.feat.hl { background: var(--ink); color: var(--bg); box-shadow: none } .feat.hl p { color: color-mix(in srgb, var(--bg) 70%, transparent) }
@media (max-width: 860px) { .feats { grid-template-columns: 1fr 1fr } } @media (max-width: 560px) { .feats { grid-template-columns: 1fr } }

.vs-table td:nth-child(2), .vs-table th:nth-child(2) { text-align: center; color: var(--muted) }
.vs-table td:nth-child(3), .vs-table th:nth-child(3) { text-align: center; font-weight: 600 }
.vs-table td:nth-child(3) { color: var(--ink) }
.vs-table th:nth-child(3) { color: var(--red) }

/* pricing */
.prices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: stretch }
.price { padding: 26px; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 14px; position: relative }
.price.pop { box-shadow: 0 0 0 2px var(--red), var(--shadow) }
.price .pill { position: absolute; top: -12px; left: 26px; background: var(--red); color: #fff; font: 700 11px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 6px 10px; border-radius: 999px }
.price h3 { font: 800 26px/1 var(--f-display); text-transform: uppercase }
.price .amt { font: 900 64px/.9 var(--f-display); font-variant-numeric: tabular-nums } .price .amt small { font: 500 15px var(--f-body); color: var(--muted); margin-left: 4px }
.price ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; font-size: 15px; flex: 1 }
.price li::before { content: "\u2713"; color: var(--good); font-weight: 700; margin-right: 8px }
.price .btn { justify-content: center }
.price.pop .btn { background: var(--red); color: #fff }
@media (max-width: 860px) { .prices { grid-template-columns: 1fr } }

details { background: var(--surface); border-radius: 16px; padding: 18px 20px; box-shadow: inset 0 0 0 1px var(--line) }
details + details { margin-top: 10px }
summary { cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px }
summary::after { content: "+"; font: 500 20px/1 var(--f-mono); color: var(--muted) } details[open] summary::after { content: "\u2013" }
details p { margin: 10px 0 0; color: var(--muted) }
footer { padding-block: 40px 56px; color: var(--muted); font-size: 14px; border-top: 1px solid var(--line); margin-top: 32px }
footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px }

/* fight card modal */
.modal { position: fixed; inset: 0; z-index: 20; background: rgba(5,7,12,.72); backdrop-filter: blur(8px); display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)) }
.modal .box { background: var(--surface); border-radius: 24px; padding: 18px; display: grid; gap: 14px; max-height: 100%; overflow: auto; width: min(420px, 100%) }
.modal canvas { width: 100%; height: auto; border-radius: 14px; display: block; aspect-ratio: 9 / 16; max-width: 100% }
.modal .row { display: flex; gap: 8px; flex-wrap: wrap } .modal .row .btn { flex: 1; justify-content: center }
.toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 12px 18px; border-radius: 999px; font-weight: 600; font-size: 14px; z-index: 30 }
.loading .tape, .loading .grid2 { opacity: .45; filter: saturate(.4); transition: opacity .2s }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }

[data-tool] { display: none }
.tools-hero { padding-block: 56px 8px }
.tools-hero h1 { font-size: clamp(52px, 9vw, 104px) }
.tools-hero p { color: var(--muted); font-size: 18px; max-width: 620px; margin: 14px 0 0 }
.crumbs { font: 500 13px/1 var(--f-mono); color: var(--muted); margin-bottom: 18px; display: flex; gap: 8px; flex-wrap: wrap } .crumbs a { text-decoration: none } .crumbs a:hover { color: var(--ink) }
.hub { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px }
.tcard { display: grid; gap: 10px; padding: 24px; border-radius: 22px; background: var(--surface); box-shadow: var(--shadow); text-decoration: none; transition: transform .15s }
.tcard:hover { transform: translateY(-2px) } .tcard .eyebrow { color: var(--red) } .tcard:nth-child(even) .eyebrow { color: var(--blue) }
.tcard h2 { font: 800 32px/1 var(--f-display); text-transform: uppercase } .tcard p { margin: 0; color: var(--muted) } .tcard .go { font-weight: 600 }
@media (max-width: 760px) { .hub { grid-template-columns: 1fr } }
.tool { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start }
.tool.one { grid-template-columns: 1fr }
@media (max-width: 900px) { .tool { grid-template-columns: 1fr } }
.field { display: grid; gap: 6px } .field + .field { margin-top: 14px }
.field label, .lbl { font: 600 12px/1 var(--f-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted) }
.field input, .field select, .field textarea { width: 100%; border: 0; border-radius: 12px; padding: 12px 14px; background: var(--bg); color: var(--ink); font: 500 15px/1.4 var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.field textarea { min-height: 110px; resize: vertical; font-family: var(--f-mono); font-size: 13px }
.field small { color: var(--muted); font-size: 13px }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px } @media (max-width: 520px) { .row2 { grid-template-columns: 1fr } }
.seg { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line) }
.seg button { border: 0; background: transparent; color: var(--muted); font: 600 13px/1 var(--f-body); padding: 8px 12px; border-radius: 999px; cursor: pointer }
.seg button[aria-pressed="true"] { background: var(--ink); color: var(--bg) }
.bots { display: grid; gap: 8px; margin-top: 8px } .bot { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--bg) } .bot b { font-weight: 600 } .bot span { color: var(--muted); font-size: 13px; display: block }
pre.out { margin: 0; padding: 18px; border-radius: 16px; background: #0d1017; color: #e8ebf2; font: 13px/1.6 var(--f-mono); overflow-x: auto; white-space: pre; min-height: 160px }
.out-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 14px } .chip { font: 600 13px/1 var(--f-mono); padding: 8px 12px; border-radius: 999px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line) }
.chip.bad { color: var(--bad) } .chip.warn { color: var(--warn) } .chip.good { color: var(--good) }
td.url { max-width: 340px; overflow-wrap: anywhere; font-size: 13px } td.url small { display: block; color: var(--muted) }
.st { font: 700 12px/1 var(--f-mono); padding: 4px 7px; border-radius: 6px; white-space: nowrap }
.st.broken { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad) } .st.redirect { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn) } .st.ok { background: color-mix(in srgb, var(--good) 14%, transparent); color: var(--good) }
.locked td { filter: blur(5px); user-select: none } .lockbar { margin-top: 14px; padding: 16px; border-radius: 14px; background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)); display: flex; gap: 12px; align-items: center; flex-wrap: wrap } .lockbar p { margin: 0; flex: 1 1 220px }
.pos { font: 700 15px/1 var(--f-mono); font-variant-numeric: tabular-nums } .pos.a { color: var(--red) } .pos.b { color: var(--blue) } .pos.none { color: var(--muted); font-weight: 500 }
.mini-tape { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin-bottom: 14px } .mini-tape .s { font: 900 64px/.9 var(--f-display) } .mini-tape .s.a { color: var(--red) } .mini-tape .s.b { color: var(--blue); text-align: right } .mini-tape .c { font: 900 22px/1 var(--f-display); color: var(--muted) }
.muted { color: var(--muted) }
</style>
<style>__SHOW__</style>

<header class="top"><div class="wrap">
  <a class="logo" href="/" aria-label="SEO Fight home"><i></i>SEO Fight</a>
  <nav class="links"><a href="/keywords-battle">Keyword Battle</a><a href="/tools">Free tools</a><a href="/fights">Biggest fights</a><a href="/#pricing">Pricing</a></nav>
  <a class="btn sm" href="/">Start a fight</a>
</div></header>

<main class="wrap">
  <div class="tools-hero">
    <div class="crumbs">__CRUMBS__</div>
    <h1 class="display">__H1__</h1>
    <p>__LEDE__</p>
  </div>

  <!-- HUB -->
  <section data-tool="hub"><div class="hub">
    <a class="tcard" href="/tools/broken-link-checker"><span class="eyebrow">Technical SEO</span><h2>Broken link checker</h2><p>Scan any page for broken links, redirects and errors that cost you rankings.</p><span class="go">Use tool \u2192</span></a>
    <a class="tcard" href="/tools/robots-txt-generator"><span class="eyebrow">Technical SEO</span><h2>Robots.txt generator</h2><p>Build a correct robots.txt in seconds, with one-tap control over AI crawlers like GPTBot and ClaudeBot.</p><span class="go">Use tool \u2192</span></a>
    <a class="tcard" href="/tools/schema-markup-generator"><span class="eyebrow">Structured data</span><h2>Schema markup generator</h2><p>Make JSON-LD for 9 page types so Google can show rich results for you.</p><span class="go">Use tool \u2192</span></a>
    <a class="tcard" href="/tools/llms-txt-generator"><span class="eyebrow">AI search</span><h2>llms.txt generator</h2><p>Tell ChatGPT, Claude and Perplexity what your site is about, in the file they look for.</p><span class="go">Use tool \u2192</span></a>
  </div></section>

  <!-- BROKEN LINKS -->
  <section data-tool="broken"><div class="tool one">
    <form class="panel" id="blForm" novalidate>
      <div class="field"><label for="blUrl">Page to scan</label><div class="wrow"><input id="blUrl" inputmode="url" placeholder="yoursite.com/blog/post" autocomplete="off"><button class="btn" type="submit" id="blBtn">Scan links</button></div><small>Checks up to 150 links on the page: broken (4xx/5xx), redirects (3xx) and timeouts.</small></div>
      <div class="err" id="blErr" hidden></div>
    </form>
    <div class="panel" id="blOut" hidden>
      <div class="chips" id="blChips"></div>
      <div class="tbl-wrap"><table><thead><tr><th>Link</th><th>Status</th><th>Type</th></tr></thead><tbody id="blRows"></tbody></table></div>
    </div>
  </div></section>

  <!-- ROBOTS -->
  <section data-tool="robots"><div class="tool">
    <div class="panel">
      <div class="field"><span class="lbl">Search engines</span><div class="seg" id="rbAll"><button type="button" aria-pressed="true" data-v="allow">Allow all</button><button type="button" aria-pressed="false" data-v="block">Block all</button></div></div>
      <div class="field"><label for="rbSitemap">Sitemap URL</label><input id="rbSitemap" inputmode="url" placeholder="https://yoursite.com/sitemap.xml"></div>
      <div class="field"><label for="rbPaths">Hide these paths</label><textarea id="rbPaths" placeholder="/admin/&#10;/cart/&#10;/checkout/">/admin/
/cart/</textarea><small>One per line. These stay out of Google.</small></div>
      <div class="field"><label for="rbDelay">Crawl delay (seconds, optional)</label><input id="rbDelay" inputmode="numeric" placeholder="0"></div>
      <div class="field"><span class="lbl">AI crawlers</span><div class="bots" id="rbBots"></div></div>
    </div>
    <div class="panel"><div class="out-head"><h3>robots.txt</h3><button class="btn sm" type="button" data-copy="rbOut">Copy</button></div><pre class="out" id="rbOut"></pre><p class="muted" style="font-size:14px;margin:12px 0 0">Save this as <b>robots.txt</b> at the root of your site, like yoursite.com/robots.txt.</p></div>
  </div></section>

  <!-- SCHEMA -->
  <section data-tool="schema"><div class="tool">
    <div class="panel">
      <div class="field"><label for="scType">Schema type</label><select id="scType"></select></div>
      <div id="scFields"></div>
    </div>
    <div class="panel"><div class="out-head"><h3>JSON-LD</h3><button class="btn sm" type="button" data-copy="scOut">Copy</button></div><pre class="out" id="scOut"></pre>
      <p class="muted" style="font-size:14px;margin:12px 0 0">Paste it inside the <b>&lt;head&gt;</b> of the page. Then check it with <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener">Google's Rich Results Test</a>.</p></div>
  </div></section>

  <!-- LLMS.TXT -->
  <section data-tool="llms"><div class="tool">
    <div class="panel">
      <div class="field"><label for="llName">Site or company name</label><input id="llName" value="Crumb &amp; Co"></div>
      <div class="field"><label for="llSum">One-line summary</label><input id="llSum" value="Sourdough bakery in Vancouver, baking fresh every morning since 2019."></div>
      <div class="field"><label for="llAbout">More detail (optional)</label><textarea id="llAbout">We bake slow-fermented sourdough with BC-grown flour. Open daily 7am\u20133pm on Main Street. Online orders for pickup.</textarea></div>
      <div class="field"><label for="llLinks">Key pages</label><textarea id="llLinks">Menu | https://crumbandco.ca/menu | Breads, pastries and prices
Order online | https://crumbandco.ca/order | Pickup orders
About | https://crumbandco.ca/about | Our story and bakers</textarea><small>One per line: Title | URL | short note</small></div>
    </div>
    <div class="panel"><div class="out-head"><h3>llms.txt</h3><button class="btn sm" type="button" data-copy="llOut">Copy</button></div><pre class="out" id="llOut"></pre><p class="muted" style="font-size:14px;margin:12px 0 0">Save as <b>llms.txt</b> at your site's root. AI assistants read it to understand and quote you.</p></div>
  </div></section>

  <!-- KEYWORD BATTLE -->
  <section data-tool="battle"><div class="tool one">
    <form class="panel" id="kbForm" novalidate>
      <div class="row2">
        <div class="field"><label for="kbA" style="color:var(--red)">Your site</label><input id="kbA" inputmode="url" placeholder="yoursite.com" value="__KBA__"></div>
        <div class="field"><label for="kbB" style="color:var(--blue)">Rival</label><input id="kbB" inputmode="url" placeholder="rival.com" value="__KBB__"></div>
      </div>
      <div class="field"><label for="kbCountry">Country</label><select id="kbCountry">
        <option value="us">United States</option><option value="ca">Canada</option><option value="gb">United Kingdom</option><option value="au">Australia</option><option value="de">Germany</option><option value="fr">France</option><option value="es">Spain</option><option value="it">Italy</option><option value="nl">Netherlands</option><option value="in">India</option><option value="br">Brazil</option><option value="mx">Mexico</option></select><small>Choosing a country other than the US is a Pro feature.</small></div>
      <div class="field"><label for="kbKw">10 keywords to fight over</label><textarea id="kbKw" placeholder="One keyword per line"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" type="button" id="kbSuggest">Suggest keywords from my site</button></div></div>
      <div style="margin-top:16px"><button class="btn fight" type="submit" id="kbBtn" style="width:100%">Start keyword battle</button></div>
      <div class="err" id="kbErr" hidden></div>
    </form>
    <div class="panel" id="kbOut" hidden>
      <div class="mini-tape"><div><div class="eyebrow" style="color:var(--red)" id="kbHa"></div><div class="s a" id="kbSa">0</div></div><div class="c">KEYWORDS<br>WON</div><div style="text-align:right"><div class="eyebrow" style="color:var(--blue)" id="kbHb"></div><div class="s b" id="kbSb">0</div></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>Keyword</th><th>You</th><th>Rival</th><th>#1 on Google</th></tr></thead><tbody id="kbRows"></tbody></table></div>
      <div class="lockbar" id="kbLock" hidden><p><b>9 keywords are locked.</b> Pro shows all 10, any country, and emails you every time a position moves.</p><a class="btn sm" href="/#pricing">Unlock with Pro</a></div>
    </div>
  </div></section>

  <section class="seo-sum">__ABOUT__</section>
</main>

<footer><div class="wrap"><span>\xA9 2026 SEO Fight \xB7 <a href="/tools">Free SEO tools</a> \xB7 <a href="/keywords-battle">Keyword Battle</a> \xB7 <a href="/fights">Biggest fights</a></span><span>Fight fair. Fix fast.</span></div></footer>
<div class="toast" id="toast" hidden></div>

<script>
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Select the text and copy it"); } }
document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => copyText($("#" + b.dataset.copy).textContent)));
const liveErr = x => x && x.message && !/fetch|JSON/i.test(x.message) ? x.message : "This tool runs on the live site.";

/* ---- robots.txt ---- */
const BOTS = [["GPTBot","ChatGPT (OpenAI)"],["OAI-SearchBot","ChatGPT search"],["ClaudeBot","Claude (Anthropic)"],["PerplexityBot","Perplexity"],["Google-Extended","Gemini training"],["CCBot","Common Crawl"]];
const botState = Object.fromEntries(BOTS.map(([b]) => [b, b === "CCBot" ? "block" : "allow"]));
let rbAll = "allow";
$("#rbBots").innerHTML = BOTS.map(([b, n]) => \`<div class="bot"><div><b>\${b}</b><span>\${n}</span></div><div class="seg" data-bot="\${b}"><button type="button" data-v="allow" aria-pressed="\${botState[b]==="allow"}">Allow</button><button type="button" data-v="block" aria-pressed="\${botState[b]==="block"}">Block</button></div></div>\`).join("");
document.querySelectorAll("#rbBots .seg, #rbAll").forEach(seg => seg.addEventListener("click", e => {
  const v = e.target.dataset.v; if (!v) return;
  seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === v));
  if (seg.id === "rbAll") rbAll = v; else botState[seg.dataset.bot] = v; robots();
}));
function robots() {
  const L = ["# robots.txt made with SEO Fight", "User-agent: *"];
  if (rbAll === "block") L.push("Disallow: /"); else {
    const paths = $("#rbPaths").value.split("\\n").map(s => s.trim()).filter(Boolean);
    paths.length ? paths.forEach(p => L.push("Disallow: " + (p.startsWith("/") ? p : "/" + p))) : L.push("Allow: /");
  }
  const d = parseInt($("#rbDelay").value, 10); if (d > 0) L.push("Crawl-delay: " + d);
  for (const [b] of BOTS) { L.push("", "User-agent: " + b, botState[b] === "block" ? "Disallow: /" : "Allow: /"); }
  const sm = $("#rbSitemap").value.trim(); if (sm) L.push("", "Sitemap: " + sm);
  $("#rbOut").textContent = L.join("\\n");
}
["#rbSitemap","#rbPaths","#rbDelay"].forEach(s => $(s).addEventListener("input", robots)); robots();

/* ---- schema ---- */
const T = {
  Organization: [["name","Name","Crumb & Co"],["url","Website","https://crumbandco.ca"],["logo","Logo URL","https://crumbandco.ca/logo.png"],["sameAs","Social profiles (one per line)","https://instagram.com/crumbandco"],["email","Email",""],["telephone","Phone",""]],
  LocalBusiness: [["name","Business name","Crumb & Co"],["url","Website","https://crumbandco.ca"],["telephone","Phone","+1 604 555 0142"],["streetAddress","Street","2140 Main St"],["addressLocality","City","Vancouver"],["addressRegion","Province / state","BC"],["postalCode","Postal code","V5T 3C5"],["addressCountry","Country code","CA"],["openingHours","Hours","Mo-Su 07:00-15:00"],["priceRange","Price range","$$"],["image","Photo URL",""]],
  WebSite: [["name","Site name","Crumb & Co"],["url","URL","https://crumbandco.ca"],["search","Search URL (use {q})","https://crumbandco.ca/search?q={q}"]],
  Article: [["headline","Headline","How we bake sourdough"],["author","Author","Sam Lee"],["datePublished","Published (YYYY-MM-DD)","2026-11-01"],["image","Image URL",""],["publisher","Publisher","Crumb & Co"],["url","Article URL",""]],
  Product: [["name","Product name","Country Sourdough Loaf"],["description","Description","Slow-fermented 36 hours"],["image","Image URL",""],["brand","Brand","Crumb & Co"],["sku","SKU",""],["price","Price","9.50"],["priceCurrency","Currency","CAD"],["availability","In stock? (yes/no)","yes"],["ratingValue","Rating (1\u20135)",""],["reviewCount","Review count",""]],
  FAQPage: [["faq","Questions (Question | Answer, one per line)","Do you deliver? | Pickup only for now.\\nAre your breads vegan? | Yes, every sourdough is vegan."]],
  BreadcrumbList: [["crumbs","Breadcrumbs (Name | URL, one per line)","Home | https://crumbandco.ca\\nMenu | https://crumbandco.ca/menu"]],
  Person: [["name","Name",""],["jobTitle","Job title",""],["url","Website",""],["image","Photo URL",""],["sameAs","Social profiles (one per line)",""]],
  Event: [["name","Event name","Sourdough Workshop"],["startDate","Start (YYYY-MM-DDTHH:MM)","2026-12-05T10:00"],["endDate","End",""],["location","Venue name","Crumb & Co"],["address","Venue address","2140 Main St, Vancouver"],["url","Ticket URL",""],["price","Price","45"],["priceCurrency","Currency","CAD"]],
};
$("#scType").innerHTML = Object.keys(T).map(k => \`<option>\${k}</option>\`).join("");
function scFields() {
  const t = $("#scType").value;
  $("#scFields").innerHTML = T[t].map(([k, l, v]) => \`<div class="field"><label for="sc_\${k}">\${l}</label>\${/\\n|one per line/.test(l) ? \`<textarea id="sc_\${k}">\${esc(v)}</textarea>\` : \`<input id="sc_\${k}" value="\${esc(v)}">\`}</div>\`).join("");
  $("#scFields").querySelectorAll("input,textarea").forEach(i => i.addEventListener("input", schema)); schema();
}
const val = k => ($("#sc_" + k)?.value || "").trim();
const lines = k => val(k).split("\\n").map(s => s.trim()).filter(Boolean);
const clean = o => { for (const k in o) { if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) clean(o[k]); if (o[k] === "" || o[k] == null || (Array.isArray(o[k]) && !o[k].length) || (typeof o[k] === "object" && !Array.isArray(o[k]) && Object.keys(o[k]).length === 0)) delete o[k]; } return o; };
function schema() {
  const t = $("#scType").value; let o = { "@context": "https://schema.org", "@type": t };
  if (t === "Organization" || t === "Person") Object.assign(o, { name: val("name"), url: val("url"), logo: val("logo"), image: val("image"), jobTitle: val("jobTitle"), email: val("email"), telephone: val("telephone"), sameAs: lines("sameAs") });
  if (t === "LocalBusiness") Object.assign(o, { name: val("name"), url: val("url"), telephone: val("telephone"), image: val("image"), priceRange: val("priceRange"), openingHours: val("openingHours"), address: { "@type": "PostalAddress", streetAddress: val("streetAddress"), addressLocality: val("addressLocality"), addressRegion: val("addressRegion"), postalCode: val("postalCode"), addressCountry: val("addressCountry") } });
  if (t === "WebSite") Object.assign(o, { name: val("name"), url: val("url"), potentialAction: val("search") ? { "@type": "SearchAction", target: val("search").replace("{q}", "{search_term_string}"), "query-input": "required name=search_term_string" } : "" });
  if (t === "Article") Object.assign(o, { headline: val("headline"), author: { "@type": "Person", name: val("author") }, datePublished: val("datePublished"), image: val("image"), mainEntityOfPage: val("url"), publisher: { "@type": "Organization", name: val("publisher") } });
  if (t === "Product") Object.assign(o, { name: val("name"), description: val("description"), image: val("image"), sku: val("sku"), brand: val("brand") ? { "@type": "Brand", name: val("brand") } : "", offers: val("price") ? { "@type": "Offer", price: val("price"), priceCurrency: val("priceCurrency"), availability: /^n/i.test(val("availability")) ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" } : "", aggregateRating: val("ratingValue") ? { "@type": "AggregateRating", ratingValue: val("ratingValue"), reviewCount: val("reviewCount") } : "" });
  if (t === "FAQPage") o.mainEntity = lines("faq").map(l => { const [q, ...a] = l.split("|"); return { "@type": "Question", name: q.trim(), acceptedAnswer: { "@type": "Answer", text: a.join("|").trim() } }; });
  if (t === "BreadcrumbList") o.itemListElement = lines("crumbs").map((l, i) => { const [n, u] = l.split("|").map(s => (s || "").trim()); return { "@type": "ListItem", position: i + 1, name: n, item: u }; });
  if (t === "Event") Object.assign(o, { name: val("name"), startDate: val("startDate"), endDate: val("endDate"), location: { "@type": "Place", name: val("location"), address: val("address") }, offers: val("price") ? { "@type": "Offer", price: val("price"), priceCurrency: val("priceCurrency"), url: val("url") } : "" });
  $("#scOut").textContent = \`<script type="application/ld+json">\\n\${JSON.stringify(clean(o), null, 2)}\\n<\\/script>\`;
}
$("#scType").addEventListener("change", scFields); scFields();

/* ---- llms.txt ---- */
function llms() {
  const L = [\`# \${$("#llName").value.trim()}\`, "", \`> \${$("#llSum").value.trim()}\`];
  if ($("#llAbout").value.trim()) L.push("", $("#llAbout").value.trim());
  const links = $("#llLinks").value.split("\\n").map(s => s.split("|").map(x => x.trim())).filter(x => x[0] && x[1]);
  if (links.length) L.push("", "## Pages", "", ...links.map(([t, u, n]) => \`- [\${t}](\${u})\${n ? ": " + n : ""}\`));
  $("#llOut").textContent = L.join("\\n");
}
["#llName","#llSum","#llAbout","#llLinks"].forEach(s => $(s).addEventListener("input", llms)); llms();

/* ---- broken links ---- */
$("#blForm").addEventListener("submit", async e => {
  e.preventDefault(); const u = $("#blUrl").value.trim(); $("#blErr").hidden = true;
  if (!u) { $("#blErr").textContent = "Enter a page address to scan."; $("#blErr").hidden = false; return; }
  const btn = $("#blBtn"); btn.disabled = true; btn.textContent = "Scanning\u2026";
  try {
    const r = await fetch(\`/api/links?url=\${encodeURIComponent(u)}\`); const j = await r.json(); if (!r.ok) throw new Error(j.error);
    $("#blChips").innerHTML = \`<span class="chip">\${j.total} links</span><span class="chip bad">\${j.broken} broken</span><span class="chip warn">\${j.redirects} redirects</span><span class="chip good">\${j.total - j.broken - j.redirects} OK</span>\`;
    $("#blRows").innerHTML = j.links.map(l => \`<tr><td class="url">\${esc(l.url)}<small>\${esc(l.text)}\${l.to ? " \u2192 " + esc(l.to) : ""}</small></td><td><span class="st \${l.kind}">\${l.status || "Timeout"}</span></td><td class="muted">\${l.internal ? "Internal" : "External"}</td></tr>\`).join("");
    $("#blOut").hidden = false;
  } catch (x) { $("#blErr").textContent = liveErr(x); $("#blErr").hidden = false; }
  finally { btn.disabled = false; btn.textContent = "Scan links"; }
});

/* ---- keyword battle ---- */
$("#kbSuggest").addEventListener("click", async () => {
  const a = $("#kbA").value.trim(); if (!a) { toast("Enter your site first"); return; }
  try { const r = await fetch(\`/api/keywords?site=\${encodeURIComponent(a)}&rival=\${encodeURIComponent($("#kbB").value.trim())}\`); const j = await r.json(); if (!r.ok) throw new Error(j.error); $("#kbKw").value = j.keywords.join("\\n"); }
  catch (x) { toast(liveErr(x)); }
});
$("#kbForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#kbErr").hidden = true;
  const a = $("#kbA").value.trim(), b = $("#kbB").value.trim(), kw = $("#kbKw").value.split("\\n").map(s => s.trim()).filter(Boolean).slice(0, 10);
  if (!a || !b) { $("#kbErr").textContent = "Enter both sites."; $("#kbErr").hidden = false; return; }
  const btn = $("#kbBtn"); btn.disabled = true; btn.textContent = "Battling\u2026";
  try {
    const r = await fetch("/api/battle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a, b, keywords: kw, country: $("#kbCountry").value }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    $("#kbHa").textContent = j.a; $("#kbHb").textContent = j.b; $("#kbSa").textContent = j.winsA; $("#kbSb").textContent = j.winsB;
    const p = (v, s) => v ? \`<span class="pos \${s}">#\${v}</span>\` : \`<span class="pos none">100+</span>\`;
    $("#kbRows").innerHTML = j.rows.map(r => r.locked ? \`<tr class="locked"><td>locked keyword here</td><td>#00</td><td>#00</td><td>hidden.com</td></tr>\` : \`<tr><td>\${esc(r.keyword)}</td><td>\${p(r.a, "a")}</td><td>\${p(r.b, "b")}</td><td class="muted">\${esc(r.leader || "\u2014")}</td></tr>\`).join("");
    $("#kbLock").hidden = !j.rows.some(r => r.locked); $("#kbOut").hidden = false; $("#kbOut").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (x) { $("#kbErr").textContent = liveErr(x); $("#kbErr").hidden = false; }
  finally { btn.disabled = false; btn.textContent = "Start keyword battle"; }
});
</script>
`;

// demo.json
var demo_default = { a: { host: "crumbandco.ca", url: "https://crumbandco.ca/", title: "Fresh Sourdough Bakery in Vancouver | Crumb & Co", score: 69, scores: { onpage: 63, content: 88, technical: 90, ai: 28, social: 60 }, checks: [{ cat: "onpage", id: "title", label: "Title tag", status: "good", value: "48 chars", fix: "Keep the title between 30 and 60 characters so Google doesn't cut it.", weight: 3 }, { cat: "onpage", id: "desc", label: "Meta description", status: "warn", value: "6 chars", fix: "Write a 70\u2013160 character description that sells the click.", weight: 2 }, { cat: "onpage", id: "h1", label: "One H1 heading", status: "warn", value: "2 found", fix: "Keep only one H1; turn the others into H2s.", weight: 3 }, { cat: "onpage", id: "headings", label: "H2/H3 structure", status: "good", value: "2 H2 \xB7 0 H3", fix: "Break the page into sections with H2 headings.", weight: 1 }, { cat: "onpage", id: "alt", label: "Image alt text", status: "bad", value: "2 of 3 missing", fix: "Describe every image in its alt text.", weight: 1 }, { cat: "onpage", id: "canonical", label: "Canonical URL", status: "warn", value: "Missing", fix: 'Add <link rel="canonical"> so Google knows the main version of the page.', weight: 1 }, { cat: "onpage", id: "internal", label: "Internal links", status: "warn", value: "5", fix: "Link to your key pages from the homepage.", weight: 1 }, { cat: "content", id: "words", label: "Content depth", status: "good", value: "616 words", fix: "Add more useful text \u2014 what you do, who it's for, proof, FAQ.", weight: 2 }, { cat: "content", id: "lang", label: "Language set", status: "warn", value: "Missing", fix: 'Add lang="en" (or your language) to the <html> tag.', weight: 1 }, { cat: "content", id: "external", label: "Outbound links", status: "good", value: "1", fix: "Link to a couple of trusted sources.", weight: 1 }, { cat: "technical", id: "https", label: "HTTPS", status: "good", value: "Secure", fix: "Turn on HTTPS (free with Cloudflare).", weight: 3 }, { cat: "technical", id: "status", label: "Page loads (status)", status: "good", value: "200", fix: "Make sure the homepage returns 200.", weight: 3 }, { cat: "technical", id: "ttfb", label: "Server response", status: "warn", value: "840 ms", fix: "Speed up the server or put the site behind a CDN.", weight: 2 }, { cat: "technical", id: "size", label: "Page weight (HTML)", status: "good", value: "4 KB", fix: "Trim inline scripts and styles from the HTML.", weight: 1 }, { cat: "technical", id: "compress", label: "Compression", status: "good", value: "gzip", fix: "Turn on gzip or Brotli compression.", weight: 1 }, { cat: "technical", id: "redirects", label: "Redirect hops", status: "good", value: "0", fix: "Point straight to the final URL \u2014 fewer hops.", weight: 1 }, { cat: "technical", id: "mobile", label: "Mobile viewport", status: "good", value: "Set", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', weight: 2 }, { cat: "technical", id: "indexable", label: "Google can index it", status: "good", value: "Yes", fix: "Remove the noindex tag \u2014 it hides your page from Google.", weight: 3 }, { cat: "technical", id: "sitemap", label: "Sitemap", status: "warn", value: "Not found", fix: "Publish /sitemap.xml and list it in robots.txt.", weight: 1 }, { cat: "technical", id: "robots", label: "robots.txt", status: "good", value: "Found", fix: "Add a robots.txt file.", weight: 1 }, { cat: "technical", id: "doctype", label: "Doctype & charset", status: "good", value: "OK", fix: 'Start with <!doctype html> and <meta charset="utf-8">.', weight: 1 }, { cat: "technical", id: "hsts", label: "HSTS security header", status: "warn", value: "Off", fix: "Turn on HSTS in your host settings.", weight: 1 }, { cat: "ai", id: "aibots", label: "AI crawlers allowed", status: "warn", value: "Blocks GPTBot", fix: "Allow GPTBot, ClaudeBot and PerplexityBot in robots.txt so AI can recommend you.", weight: 3 }, { cat: "ai", id: "llms", label: "llms.txt", status: "warn", value: "Not found", fix: "Add /llms.txt \u2014 a short summary of your site for AI.", weight: 1 }, { cat: "ai", id: "schema", label: "Structured data", status: "bad", value: "None", fix: "Add JSON-LD schema (Organization + WebSite at minimum).", weight: 2 }, { cat: "ai", id: "entity", label: "Who-you-are schema", status: "warn", value: "No", fix: "Add Organization schema with name, logo and links.", weight: 1 }, { cat: "ai", id: "faq", label: "Answers questions", status: "bad", value: "0 question headings", fix: "Add an FAQ section \u2014 AI answers love question-and-answer text.", weight: 2 }, { cat: "social", id: "og", label: "Share preview (Open Graph)", status: "warn", value: "No image", fix: "Add og:title, og:description and a 1200\xD7630 og:image.", weight: 2 }, { cat: "social", id: "ogdesc", label: "Share description", status: "warn", value: "Missing", fix: "Add og:description.", weight: 1 }, { cat: "social", id: "twitter", label: "X/Twitter card", status: "warn", value: "Missing", fix: 'Add <meta name="twitter:card" content="summary_large_image">.', weight: 1 }, { cat: "social", id: "favicon", label: "Favicon", status: "good", value: "Set", fix: "Add a favicon so you look legit in tabs and Google.", weight: 1 }] }, b: { host: "loafandlevain.com", url: "https://loafandlevain.com/", title: "PyPI \xB7 The Python Package Index", score: 86, scores: { onpage: 92, content: 75, technical: 98, ai: 50, social: 100 }, checks: [{ cat: "onpage", id: "title", label: "Title tag", status: "good", value: "31 chars", fix: "Keep the title between 30 and 60 characters so Google doesn't cut it.", weight: 3 }, { cat: "onpage", id: "desc", label: "Meta description", status: "good", value: "96 chars", fix: "Write a 70\u2013160 character description that sells the click.", weight: 2 }, { cat: "onpage", id: "h1", label: "One H1 heading", status: "good", value: "1 found", fix: "Keep only one H1; turn the others into H2s.", weight: 3 }, { cat: "onpage", id: "headings", label: "H2/H3 structure", status: "good", value: "4 H2 \xB7 0 H3", fix: "Break the page into sections with H2 headings.", weight: 1 }, { cat: "onpage", id: "alt", label: "Image alt text", status: "bad", value: "15 of 16 missing", fix: "Describe every image in its alt text.", weight: 1 }, { cat: "onpage", id: "canonical", label: "Canonical URL", status: "good", value: "Set", fix: 'Add <link rel="canonical"> so Google knows the main version of the page.', weight: 1 }, { cat: "onpage", id: "internal", label: "Internal links", status: "good", value: "15", fix: "Link to your key pages from the homepage.", weight: 1 }, { cat: "content", id: "words", label: "Content depth", status: "warn", value: "296 words", fix: "Add more useful text \u2014 what you do, who it's for, proof, FAQ.", weight: 2 }, { cat: "content", id: "lang", label: "Language set", status: "good", value: "en", fix: 'Add lang="en" (or your language) to the <html> tag.', weight: 1 }, { cat: "content", id: "external", label: "Outbound links", status: "good", value: "40", fix: "Link to a couple of trusted sources.", weight: 1 }, { cat: "technical", id: "https", label: "HTTPS", status: "good", value: "Secure", fix: "Turn on HTTPS (free with Cloudflare).", weight: 3 }, { cat: "technical", id: "status", label: "Page loads (status)", status: "good", value: "200", fix: "Make sure the homepage returns 200.", weight: 3 }, { cat: "technical", id: "ttfb", label: "Server response", status: "good", value: "210 ms", fix: "Speed up the server or put the site behind a CDN.", weight: 2 }, { cat: "technical", id: "size", label: "Page weight (HTML)", status: "good", value: "27 KB", fix: "Trim inline scripts and styles from the HTML.", weight: 1 }, { cat: "technical", id: "compress", label: "Compression", status: "warn", value: "Off", fix: "Turn on gzip or Brotli compression.", weight: 1 }, { cat: "technical", id: "redirects", label: "Redirect hops", status: "good", value: "0", fix: "Point straight to the final URL \u2014 fewer hops.", weight: 1 }, { cat: "technical", id: "mobile", label: "Mobile viewport", status: "good", value: "Set", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', weight: 2 }, { cat: "technical", id: "indexable", label: "Google can index it", status: "good", value: "Yes", fix: "Remove the noindex tag \u2014 it hides your page from Google.", weight: 3 }, { cat: "technical", id: "sitemap", label: "Sitemap", status: "good", value: "Found", fix: "Publish /sitemap.xml and list it in robots.txt.", weight: 1 }, { cat: "technical", id: "robots", label: "robots.txt", status: "good", value: "Found", fix: "Add a robots.txt file.", weight: 1 }, { cat: "technical", id: "doctype", label: "Doctype & charset", status: "good", value: "OK", fix: 'Start with <!doctype html> and <meta charset="utf-8">.', weight: 1 }, { cat: "technical", id: "hsts", label: "HSTS security header", status: "good", value: "On", fix: "Turn on HSTS in your host settings.", weight: 1 }, { cat: "ai", id: "aibots", label: "AI crawlers allowed", status: "good", value: "All allowed", fix: "Allow GPTBot, ClaudeBot and PerplexityBot in robots.txt so AI can recommend you.", weight: 3 }, { cat: "ai", id: "llms", label: "llms.txt", status: "good", value: "Found", fix: "Add /llms.txt \u2014 a short summary of your site for AI.", weight: 1 }, { cat: "ai", id: "schema", label: "Structured data", status: "bad", value: "None", fix: "Add JSON-LD schema (Organization + WebSite at minimum).", weight: 2 }, { cat: "ai", id: "entity", label: "Who-you-are schema", status: "warn", value: "No", fix: "Add Organization schema with name, logo and links.", weight: 1 }, { cat: "ai", id: "faq", label: "Answers questions", status: "bad", value: "0 question headings", fix: "Add an FAQ section \u2014 AI answers love question-and-answer text.", weight: 2 }, { cat: "social", id: "og", label: "Share preview (Open Graph)", status: "good", value: "Title + image", fix: "Add og:title, og:description and a 1200\xD7630 og:image.", weight: 2 }, { cat: "social", id: "ogdesc", label: "Share description", status: "good", value: "Set", fix: "Add og:description.", weight: 1 }, { cat: "social", id: "twitter", label: "X/Twitter card", status: "good", value: "summary_large_image", fix: 'Add <meta name="twitter:card" content="summary_large_image">.', weight: 1 }, { cat: "social", id: "favicon", label: "Favicon", status: "good", value: "Set", fix: "Add a favicon so you look legit in tabs and Google.", weight: 1 }] }, winner: "b", rows: [{ id: "title", cat: "onpage", label: "Title tag", a: { status: "good", value: "48 chars" }, b: { status: "good", value: "31 chars" }, edge: null }, { id: "desc", cat: "onpage", label: "Meta description", a: { status: "warn", value: "6 chars" }, b: { status: "good", value: "96 chars" }, edge: "b" }, { id: "h1", cat: "onpage", label: "One H1 heading", a: { status: "warn", value: "2 found" }, b: { status: "good", value: "1 found" }, edge: "b" }, { id: "headings", cat: "onpage", label: "H2/H3 structure", a: { status: "good", value: "2 H2 \xB7 0 H3" }, b: { status: "good", value: "4 H2 \xB7 0 H3" }, edge: null }, { id: "alt", cat: "onpage", label: "Image alt text", a: { status: "bad", value: "2 of 3 missing" }, b: { status: "bad", value: "15 of 16 missing" }, edge: null }, { id: "canonical", cat: "onpage", label: "Canonical URL", a: { status: "warn", value: "Missing" }, b: { status: "good", value: "Set" }, edge: "b" }, { id: "internal", cat: "onpage", label: "Internal links", a: { status: "warn", value: "5" }, b: { status: "good", value: "15" }, edge: "b" }, { id: "words", cat: "content", label: "Content depth", a: { status: "good", value: "616 words" }, b: { status: "warn", value: "296 words" }, edge: "a" }, { id: "lang", cat: "content", label: "Language set", a: { status: "warn", value: "Missing" }, b: { status: "good", value: "en" }, edge: "b" }, { id: "external", cat: "content", label: "Outbound links", a: { status: "good", value: "1" }, b: { status: "good", value: "40" }, edge: null }, { id: "https", cat: "technical", label: "HTTPS", a: { status: "good", value: "Secure" }, b: { status: "good", value: "Secure" }, edge: null }, { id: "status", cat: "technical", label: "Page loads (status)", a: { status: "good", value: "200" }, b: { status: "good", value: "200" }, edge: null }, { id: "ttfb", cat: "technical", label: "Server response", a: { status: "warn", value: "840 ms" }, b: { status: "good", value: "210 ms" }, edge: "b" }, { id: "size", cat: "technical", label: "Page weight (HTML)", a: { status: "good", value: "4 KB" }, b: { status: "good", value: "27 KB" }, edge: null }, { id: "compress", cat: "technical", label: "Compression", a: { status: "good", value: "gzip" }, b: { status: "warn", value: "Off" }, edge: "a" }, { id: "redirects", cat: "technical", label: "Redirect hops", a: { status: "good", value: "0" }, b: { status: "good", value: "0" }, edge: null }, { id: "mobile", cat: "technical", label: "Mobile viewport", a: { status: "good", value: "Set" }, b: { status: "good", value: "Set" }, edge: null }, { id: "indexable", cat: "technical", label: "Google can index it", a: { status: "good", value: "Yes" }, b: { status: "good", value: "Yes" }, edge: null }, { id: "sitemap", cat: "technical", label: "Sitemap", a: { status: "warn", value: "Not found" }, b: { status: "good", value: "Found" }, edge: "b" }, { id: "robots", cat: "technical", label: "robots.txt", a: { status: "good", value: "Found" }, b: { status: "good", value: "Found" }, edge: null }, { id: "doctype", cat: "technical", label: "Doctype & charset", a: { status: "good", value: "OK" }, b: { status: "good", value: "OK" }, edge: null }, { id: "hsts", cat: "technical", label: "HSTS security header", a: { status: "warn", value: "Off" }, b: { status: "good", value: "On" }, edge: "b" }, { id: "aibots", cat: "ai", label: "AI crawlers allowed", a: { status: "warn", value: "Blocks GPTBot" }, b: { status: "good", value: "All allowed" }, edge: "b" }, { id: "llms", cat: "ai", label: "llms.txt", a: { status: "warn", value: "Not found" }, b: { status: "good", value: "Found" }, edge: "b" }, { id: "schema", cat: "ai", label: "Structured data", a: { status: "bad", value: "None" }, b: { status: "bad", value: "None" }, edge: null }, { id: "entity", cat: "ai", label: "Who-you-are schema", a: { status: "warn", value: "No" }, b: { status: "warn", value: "No" }, edge: null }, { id: "faq", cat: "ai", label: "Answers questions", a: { status: "bad", value: "0 question headings" }, b: { status: "bad", value: "0 question headings" }, edge: null }, { id: "og", cat: "social", label: "Share preview (Open Graph)", a: { status: "warn", value: "No image" }, b: { status: "good", value: "Title + image" }, edge: "b" }, { id: "ogdesc", cat: "social", label: "Share description", a: { status: "warn", value: "Missing" }, b: { status: "good", value: "Set" }, edge: "b" }, { id: "twitter", cat: "social", label: "X/Twitter card", a: { status: "warn", value: "Missing" }, b: { status: "good", value: "summary_large_image" }, edge: "b" }, { id: "favicon", cat: "social", label: "Favicon", a: { status: "good", value: "Set" }, b: { status: "good", value: "Set" }, edge: null }], winsA: 2, winsB: 13, plan: [{ label: "Structured data", status: "bad", fix: "Add JSON-LD schema (Organization + WebSite at minimum).", gain: 4 }, { label: "Answers questions", status: "bad", fix: "Add an FAQ section \u2014 AI answers love question-and-answer text.", gain: 4 }, { label: "Image alt text", status: "bad", fix: "Describe every image in its alt text.", gain: 2 }, { label: "One H1 heading", status: "warn", fix: "Keep only one H1; turn the others into H2s.", gain: 3 }, { label: "AI crawlers allowed", status: "warn", fix: "Allow GPTBot, ClaudeBot and PerplexityBot in robots.txt so AI can recommend you.", gain: 3 }, { label: "Meta description", status: "warn", fix: "Write a 70\u2013160 character description that sells the click.", gain: 2 }, { label: "Server response", status: "warn", fix: "Speed up the server or put the site behind a CDN.", gain: 2 }, { label: "Share preview (Open Graph)", status: "warn", fix: "Add og:title, og:description and a 1200\xD7630 og:image.", gain: 2 }, { label: "Canonical URL", status: "warn", fix: 'Add <link rel="canonical"> so Google knows the main version of the page.', gain: 1 }, { label: "Internal links", status: "warn", fix: "Link to your key pages from the homepage.", gain: 1 }, { label: "Language set", status: "warn", fix: 'Add lang="en" (or your language) to the <html> tag.', gain: 1 }, { label: "Sitemap", status: "warn", fix: "Publish /sitemap.xml and list it in robots.txt.", gain: 1 }, { label: "HSTS security header", status: "warn", fix: "Turn on HSTS in your host settings.", gain: 1 }, { label: "llms.txt", status: "warn", fix: "Add /llms.txt \u2014 a short summary of your site for AI.", gain: 1 }, { label: "Who-you-are schema", status: "warn", fix: "Add Organization schema with name, logo and links.", gain: 1 }, { label: "Share description", status: "warn", fix: "Add og:description.", gain: 1 }, { label: "X/Twitter card", status: "warn", fix: 'Add <meta name="twitter:card" content="summary_large_image">.', gain: 1 }], markdown: `# SEO duel: crumbandco.ca (69) vs loafandlevain.com (86)

Winner: **loafandlevain.com**

## Fix list for crumbandco.ca

1. [CRITICAL] Structured data \u2014 Add JSON-LD schema (Organization + WebSite at minimum). (+4 pts)
2. [CRITICAL] Answers questions \u2014 Add an FAQ section \u2014 AI answers love question-and-answer text. (+4 pts)
3. [CRITICAL] Image alt text \u2014 Describe every image in its alt text. (+2 pts)
4. [IMPROVE] One H1 heading \u2014 Keep only one H1; turn the others into H2s. (+3 pts)
5. [IMPROVE] AI crawlers allowed \u2014 Allow GPTBot, ClaudeBot and PerplexityBot in robots.txt so AI can recommend you. (+3 pts)
6. [IMPROVE] Meta description \u2014 Write a 70\u2013160 character description that sells the click. (+2 pts)
7. [IMPROVE] Server response \u2014 Speed up the server or put the site behind a CDN. (+2 pts)
8. [IMPROVE] Share preview (Open Graph) \u2014 Add og:title, og:description and a 1200\xD7630 og:image. (+2 pts)
9. [IMPROVE] Canonical URL \u2014 Add <link rel="canonical"> so Google knows the main version of the page. (+1 pts)
10. [IMPROVE] Internal links \u2014 Link to your key pages from the homepage. (+1 pts)
11. [IMPROVE] Language set \u2014 Add lang="en" (or your language) to the <html> tag. (+1 pts)
12. [IMPROVE] Sitemap \u2014 Publish /sitemap.xml and list it in robots.txt. (+1 pts)
13. [IMPROVE] HSTS security header \u2014 Turn on HSTS in your host settings. (+1 pts)
14. [IMPROVE] llms.txt \u2014 Add /llms.txt \u2014 a short summary of your site for AI. (+1 pts)
15. [IMPROVE] Who-you-are schema \u2014 Add Organization schema with name, logo and links. (+1 pts)
16. [IMPROVE] Share description \u2014 Add og:description. (+1 pts)
17. [IMPROVE] X/Twitter card \u2014 Add <meta name="twitter:card" content="summary_large_image">. (+1 pts)

## Side by side

| Check | crumbandco.ca | loafandlevain.com |
|---|---|---|
| Title tag | 48 chars | 31 chars |
| Meta description | 6 chars | 96 chars |
| One H1 heading | 2 found | 1 found |
| H2/H3 structure | 2 H2 \xB7 0 H3 | 4 H2 \xB7 0 H3 |
| Image alt text | 2 of 3 missing | 15 of 16 missing |
| Canonical URL | Missing | Set |
| Internal links | 5 | 15 |
| Content depth | 616 words | 296 words |
| Language set | Missing | en |
| Outbound links | 1 | 40 |
| HTTPS | Secure | Secure |
| Page loads (status) | 200 | 200 |
| Server response | 840 ms | 210 ms |
| Page weight (HTML) | 4 KB | 27 KB |
| Compression | gzip | Off |
| Redirect hops | 0 | 0 |
| Mobile viewport | Set | Set |
| Google can index it | Yes | Yes |
| Sitemap | Not found | Found |
| robots.txt | Found | Found |
| Doctype & charset | OK | OK |
| HSTS security header | Off | On |
| AI crawlers allowed | Blocks GPTBot | All allowed |
| llms.txt | Not found | Found |
| Structured data | None | None |
| Who-you-are schema | No | No |
| Answers questions | 0 question headings | 0 question headings |
| Share preview (Open Graph) | No image | Title + image |
| Share description | Missing | Set |
| X/Twitter card | Missing | summary_large_image |
| Favicon | Set | Set |

> Paste this into Claude Code or Cursor: "Apply every fix in this list to my site."` };

// src/worker.js
var SITE = "https://seofight.app", UA = "Mozilla/5.0 (compatible; SEOFightBot/1.0; +https://seofight.app/llms.txt)", LIMITS = {
  free: { fights: [1, "week"], battles: [1, "week"], strategy: [0, "month"] },
  pro: { fights: [40, "month"], battles: [4, "month"], strategy: [4, "month"] }
}, TOOL_LIMITS = { rivals: 3, keywords: 20, links: 10 }, esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), norm = (s) => {
  s = (s || "").trim(), /^https?:\/\//i.test(s) || (s = "https://" + s);
  let u = new URL(s);
  if (!u.hostname.includes(".")) throw 0;
  return u.origin + "/";
}, normPage = (s) => {
  s = (s || "").trim(), /^https?:\/\//i.test(s) || (s = "https://" + s);
  let u = new URL(s);
  if (!u.hostname.includes(".")) throw 0;
  return u.href;
}, hostOf = (u) => new URL(u).hostname.replace(/^www\./, "").toLowerCase(), slugOf = (a, b) => `${a}-vs-${b}`, json = (d, s = 200, h = {}) => Response.json(d, { status: s, headers: h }), ipOf = (req) => req.headers.get("cf-connecting-ip") || "anon", period = (p) => {
  let d = /* @__PURE__ */ new Date();
  if (p === "month") return d.toISOString().slice(0, 7);
  let day = Math.floor(d / 864e5);
  return "w" + Math.floor((day + 3) / 7);
}, WATERMARK = `

---
_Made with SEO Fight free \xB7 ${SITE} \xB7 Go Pro for clean reports, AI strategy and Keyword Battles._
`;
async function get(url, ms = 9e3) {
  let ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
function cookie(req, name) {
  let m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
async function member(req, env) {
  let key = cookie(req, "rf_key");
  return !key || !env.DB ? null : env.DB.prepare("SELECT * FROM members WHERE key=?1 AND active=1").bind(key).first();
}
async function canUse(env, who, what, plan) {
  let [max, per] = LIMITS[plan][what];
  return max === 0 ? !1 : env.LIMITS ? parseInt(await env.LIMITS.get(`u:${what}:${period(per)}:${who}`) || "0", 10) < max : !0;
}
async function spend(env, who, what, plan) {
  if (!env.LIMITS) return;
  let per = LIMITS[plan][what][1], k = `u:${what}:${period(per)}:${who}`, n = parseInt(await env.LIMITS.get(k) || "0", 10);
  await env.LIMITS.put(k, String(n + 1), { expirationTtl: per === "month" ? 32 * 86400 : 8 * 86400 });
}
async function toolUse(env, req, what) {
  if (!env.LIMITS) return !0;
  let k = `t:${what}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}:${ipOf(req)}`, n = parseInt(await env.LIMITS.get(k) || "0", 10);
  return n >= TOOL_LIMITS[what] ? !1 : (await env.LIMITS.put(k, String(n + 1), { expirationTtl: 9e4 }), !0);
}
async function fetchSite(url, env) {
  let t0 = Date.now(), res = await get(url), html2 = (await res.text()).slice(0, 2e6), ms = Date.now() - t0, finalUrl = res.url || url, origin = new URL(finalUrl).origin, [robots, sitemap, llms, speed] = await Promise.all([
    get(origin + "/robots.txt", 5e3).then((r) => r.ok ? r.text() : null).catch(() => null),
    get(origin + "/sitemap.xml", 5e3).then((r) => r.ok ? r.text().then((t) => /<(urlset|sitemapindex)/i.test(t)) : !1).catch(() => !1),
    get(origin + "/llms.txt", 5e3).then((r) => r.ok && !/html/i.test(r.headers.get("content-type") || "")).catch(() => !1),
    pagespeed(finalUrl, env).catch(() => null)
  ]);
  return { url: finalUrl, html: html2, status: res.status, ms, headers: Object.fromEntries(res.headers), robots, sitemap, llms, redirects: res.redirected ? 1 : 0, speed };
}
async function pagespeed(url, env) {
  if (!env.PSI_KEY) return null;
  let lcp = (await (await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&key=${env.PSI_KEY}`)).json())?.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
  return lcp ? { lcp: lcp / 1e3 } : null;
}
async function runFight(a, b, env) {
  let [pa, pb] = await Promise.all([fetchSite(a, env), fetchSite(b, env)]), d = duel(analyze(pa), analyze(pb));
  return d.slug = slugOf(d.a.host, d.b.host), d.at = Date.now(), d;
}
var withReport = (d, pro) => ({ ...d, markdown: toMarkdown(d) + (pro ? "" : WATERMARK) });
async function saveFight(env, d) {
  env.DB && await env.DB.prepare(
    `INSERT INTO fights (slug, a, b, a_score, b_score, winner, data, views, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)
     ON CONFLICT(slug) DO UPDATE SET a_score=?4, b_score=?5, winner=?6, data=?7, views=views+1, updated_at=?8`
  ).bind(d.slug, d.a.host, d.b.host, d.a.score, d.b.score, d.winner || "", JSON.stringify(d), d.at).run();
}
async function storedFight(env, slug) {
  let row = env.DB && await env.DB.prepare("SELECT data, updated_at FROM fights WHERE slug=?1").bind(slug).first();
  return row ? { d: JSON.parse(row.data), age: Date.now() - row.updated_at } : null;
}
function head(o) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="canonical" href="${SITE}${o.path || "/"}"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}"><meta property="og:url" content="${SITE}${o.path || "/"}"><meta property="og:type" content="website"><meta property="og:image" content="${SITE}/og.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M16 2 30 16 16 30 2 16Z' fill='%23e0263a'/%3E%3Cpath d='M16 2 30 16 16 30Z' fill='%232457f5'/%3E%3C/svg%3E">
<script type="application/ld+json">${JSON.stringify(o.ld || { "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "SEO Fight", url: SITE }, { "@type": "SoftwareApplication", name: "SEO Fight", applicationCategory: "BusinessApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }] }).replace(/</g, "\\u003c")}</script>
<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>
`;
}
var html = (body, o) => new Response(body, { status: o.status || 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": o.cache || "public, max-age=300" } });
function page(env, o) {
  let d = o.data || demo_default, fill = {
    __TITLE__: esc(o.title),
    __DESC__: esc(o.desc),
    __H1__: o.h1,
    __LEDE__: o.lede,
    __A__: esc(o.a ?? d.a.host),
    __B__: esc(o.b ?? d.b.host),
    __MODE__: esc(o.mode),
    __PRO__: esc(env.STRIPE_PRO_LINK || "#pricing"),
    __LIFE__: esc(env.STRIPE_LIFETIME_LINK || "#pricing"),
    __SUMMARY__: o.summary || "",
    __DATA__: JSON.stringify(withReport(d, !1)).replace(/</g, "\\u003c"),
    __LIVE__: o.live ? "true" : "false"
  };
  return html(head(o) + template_default.replace(/__(TITLE|DESC|H1|LEDE|A|B|MODE|PRO|LIFE|SUMMARY|DATA|LIVE)__/g, (m) => fill[m]), o);
}
var HOME = {
  title: "SEO Fight \xB7 Compare website SEO side by side",
  desc: "Compare your website's SEO against a competitor in seconds. 31 live checks across Google and AI search, a clear winner, and the exact fixes to win.",
  h1: 'Who wins<br>the <span class="r">SEO</span> <span class="b">fight?</span>',
  lede: "Enter your website and a competitor. 31 real checks, a clear winner, and the exact moves to take the belt.",
  mode: "Example fight"
};
function fightPage(env, d, path) {
  let w = d.winner ? d[d.winner].host : null, hi = Math.max(d.a.score, d.b.score), lo = Math.min(d.a.score, d.b.score), loser = d.winner === "a" ? d.b : d.a, title = `${d.a.host} vs ${d.b.host} SEO: ${w ? `${w} wins ${hi}\u2013${lo}` : "it's a tie"}`, rounds = [["onpage", "On-page"], ["content", "Content"], ["technical", "Technical"], ["ai", "AI search"], ["social", "Social"]], summary = `<section class="wrap seo-sum" aria-label="Fight summary"><h2>${esc(d.a.host)} vs ${esc(d.b.host)}: the result</h2>
<p>${w ? `<b>${esc(w)}</b> wins the SEO fight with ${hi} points against ${lo}.` : `It's a tie at ${d.a.score} points each.`}
Round scores: ${rounds.map(([k, n]) => `${n} ${d.a.scores[k]}\u2013${d.b.scores[k]}`).join(", ")}.
${d.plan.length ? `To win, ${esc(d.a.host)} should start with: ${d.plan.slice(0, 3).map((p) => esc(p.label.toLowerCase())).join(", ")}.` : ""}
Checked ${new Date(d.at || Date.now()).toISOString().slice(0, 10)}.</p></section>`;
  return page(env, {
    path,
    data: d,
    live: !0,
    mode: "Saved fight",
    title,
    summary,
    desc: `${d.a.host} scores ${d.a.score} and ${d.b.host} scores ${d.b.score} on 31 Google and AI search checks. See every round and how ${loser.host} can win.`,
    h1: `<span class="r">${esc(d.a.host)}</span><br>vs <span class="b">${esc(d.b.host)}</span>`,
    lede: w ? `${esc(w)} takes the belt, ${hi} to ${lo}. Run it again, or put your own site in the ring.` : "Dead even. Run it again, or put your own site in the ring.",
    ld: { "@context": "https://schema.org", "@type": "Article", headline: title, dateModified: new Date(d.at || Date.now()).toISOString(), publisher: { "@type": "Organization", name: "SEO Fight", url: SITE } }
  });
}
async function boardPage(env) {
  let rows = env.DB ? (await env.DB.prepare("SELECT slug,a,b,a_score,b_score FROM fights ORDER BY views DESC, updated_at DESC LIMIT 60").all()).results : [], list = rows.length ? rows.map((r) => `<a class="bout" href="/fight/${encodeURIComponent(r.slug)}"><span class="h">${esc(r.a)}</span><span class="s"><span class="ra">${r.a_score}</span><i>vs</i><span class="rb">${r.b_score}</span></span><span class="h b">${esc(r.b)}</span></a>`).join("") : '<p class="seo-sum">No fights yet. Start the first one above.</p>';
  return page(env, {
    path: "/fights",
    mode: "Example fight",
    title: "Biggest SEO fights \xB7 SEO Fight",
    desc: "The most-watched website SEO fights: brand vs brand, scored on 31 Google and AI search checks.",
    h1: 'Biggest<br><span class="r">SEO</span> <span class="b">fights</span>',
    lede: "Brand vs brand, scored on 31 live checks. Tap any fight to see every round.",
    summary: `<section class="wrap"><div class="sec-head"><h2 class="display">Main card</h2><span class="tag">${rows.length} fights</span></div><div class="board">${list}</div></section>`
  });
}
var TOOL_PAGES = {
  "/tools": {
    show: "hub",
    title: "Free SEO tools \xB7 SEO Fight",
    h1: 'Free <span class="r">SEO</span> <span class="b">tools</span>',
    desc: "Free SEO tools: broken link checker, robots.txt generator, schema markup generator and llms.txt generator. No sign-up.",
    lede: "Fix the technical stuff in minutes. Free, no sign-up.",
    crumbs: [],
    about: "<h2>About these tools</h2><p>Each tool does one job: find broken links, control which crawlers can read your site, add structured data for rich results, and tell AI assistants what your site is about. Run a free SEO fight to see which of these your site needs most.</p>"
  },
  "/tools/broken-link-checker": {
    show: "broken",
    title: "Free Broken Link Checker \xB7 SEO Fight",
    h1: "Broken link<br>checker",
    desc: "Free broken link checker. Scan any page for broken links, redirects and errors that hurt your SEO.",
    lede: "Scan any page for broken links, redirects and errors that could hurt your rankings.",
    crumbs: [["Tools", "/tools"]],
    about: "<h2>Why broken links matter</h2><p>Broken links waste Google's crawl time, leak link value and frustrate visitors. Redirect chains slow pages down. Fix broken links first, then point redirected links straight to their final address.</p>"
  },
  "/tools/robots-txt-generator": {
    show: "robots",
    title: "Free Robots.txt Generator \xB7 SEO Fight",
    h1: "Robots.txt<br>generator",
    desc: "Free robots.txt generator with AI crawler controls for GPTBot, ClaudeBot and PerplexityBot. Copy a correct file in seconds.",
    lede: "Build a correct robots.txt to control how search engines and AI crawlers read your site.",
    crumbs: [["Tools", "/tools"]],
    about: "<h2>What robots.txt does</h2><p>Robots.txt tells crawlers which parts of your site they may read. Blocking a path keeps it out of search. Blocking AI crawlers like GPTBot means ChatGPT can't learn about or recommend your site, so only block them on purpose.</p>"
  },
  "/tools/schema-markup-generator": {
    show: "schema",
    title: "Free Schema Markup Generator (JSON-LD) \xB7 SEO Fight",
    h1: "Schema markup<br>generator",
    desc: "Free JSON-LD schema markup generator for Organization, LocalBusiness, Product, FAQ, Article, Breadcrumb, Event and more.",
    lede: "Generate JSON-LD structured data to help Google show rich results for your pages.",
    crumbs: [["Tools", "/tools"]],
    about: "<h2>What schema markup does</h2><p>Schema markup describes your page in a format search engines and AI read directly: who you are, what you sell, your hours, your FAQs. It can earn rich results like stars, prices and FAQ dropdowns.</p>"
  },
  "/tools/llms-txt-generator": {
    show: "llms",
    title: "Free llms.txt Generator \xB7 SEO Fight",
    h1: "llms.txt<br>generator",
    desc: "Free llms.txt generator. Tell ChatGPT, Claude and Perplexity what your site is about so AI can recommend you.",
    lede: "Tell AI assistants what your site is about, in the file they look for.",
    crumbs: [["Tools", "/tools"]],
    about: "<h2>What llms.txt is</h2><p>llms.txt is a short Markdown file at your site's root that gives AI assistants a clean summary of who you are and your key pages, so they can quote and recommend you accurately.</p>"
  },
  "/keywords-battle": {
    show: "battle",
    title: "Keyword Battle: who ranks higher on Google? \xB7 SEO Fight",
    h1: '<span class="r">Keyword</span><br><span class="b">battle</span>',
    desc: "Pick 10 keywords and see who ranks higher on Google, you or your competitor. Any country. Weekly movement emails on Pro.",
    lede: "Pick 10 keywords. See who ranks higher on Google for each one, you or your rival.",
    crumbs: [],
    about: "<h2>How Keyword Battle works</h2><p>We search Google for each keyword in the country you pick and find where both sites appear in the top 100. Free shows 1 of 10 keywords. Pro shows all 10, any country, and emails you every Monday when positions move.</p>"
  }
};
function toolPage(env, path, url) {
  let t = TOOL_PAGES[path], crumbs = [["Home", "/"], ...t.crumbs].map(([n, h]) => `<a href="${h}">${n}</a><span>/</span>`).join("") + `<span>${t.h1.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}</span>`, fill = {
    __TITLE__: esc(t.title),
    __DESC__: esc(t.desc),
    __H1__: t.h1,
    __LEDE__: esc(t.lede),
    __CRUMBS__: crumbs,
    __SHOW__: `[data-tool="${t.show}"]{display:block}`,
    __ABOUT__: t.about,
    __KBA__: esc(url.searchParams.get("a") || ""),
    __KBB__: esc(url.searchParams.get("b") || "")
  }, ld = { "@context": "https://schema.org", "@type": "WebApplication", name: t.title.split(" \xB7 ")[0], url: SITE + path, applicationCategory: "BusinessApplication", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } };
  return html(head({ ...t, path, ld }) + tools_default.replace(/__(TITLE|DESC|H1|LEDE|CRUMBS|SHOW|ABOUT|KBA|KBB)__/g, (m) => fill[m]), {});
}
async function aiStrategy(env, d) {
  let r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENROUTER_KEY}`, "content-type": "application/json", "HTTP-Referer": SITE, "X-Title": "SEO Fight" },
    body: JSON.stringify({
      model: env.AI_MODEL || "anthropic/claude-sonnet-4.5",
      messages: [
        { role: "system", content: "You are a blunt, practical SEO coach. Write in plain, simple English for a small business owner. No jargon without a short explanation. Use short headings and bullet points." },
        { role: "user", content: `Here is an SEO comparison of my site (${d.a.host}) against my competitor (${d.b.host}).

${toMarkdown(d)}

Write my game plan to beat them: 1) why they're ahead (or why I'm ahead), 2) the 5 moves to make this week in order, 3) 5 pages or topics I should write to steal their traffic, 4) one thing to do for AI search (ChatGPT/Perplexity). Keep it under 400 words.` }
      ]
    })
  });
  if (!r.ok) throw new Error("ai");
  return (await r.json()).choices?.[0]?.message?.content || "";
}
async function verifyStripe(req, secret) {
  let sig = req.headers.get("stripe-signature") || "", body = await req.text(), t = (sig.match(/t=(\d+)/) || [])[1], v1 = [...sig.matchAll(/v1=([a-f0-9]+)/g)].map((m) => m[1]);
  if (!t || !v1.length || Math.abs(Date.now() / 1e3 - Number(t)) > 600) return null;
  let key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, !1, ["sign"]), mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1.includes(mac) ? JSON.parse(body) : null;
}
async function sendEmail(env, to, subject, body) {
  return env.RESEND_KEY ? (await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL || "SEO Fight <fights@seofight.app>", to, subject, html: body })
  })).ok : !1;
}
async function weekly(env) {
  if (!env.DB) return;
  let watches = (await env.DB.prepare("SELECT w.* FROM watches w JOIN members m ON m.email = w.email AND m.active = 1 WHERE w.active = 1 LIMIT 500").all()).results;
  for (let w of watches)
    try {
      let d = await runFight(norm(w.a), norm(w.b), env);
      if (await saveFight(env, d), d.a.score !== w.last_a || d.b.score !== w.last_b) {
        let passed = w.last_a >= w.last_b && d.b.score > d.a.score;
        await sendEmail(
          env,
          w.email,
          passed ? `\u{1F6A8} ${d.b.host} just passed you (${d.b.score} vs ${d.a.score})` : `This week: ${d.a.host} ${d.a.score} vs ${d.b.host} ${d.b.score}`,
          `<p><b>${esc(d.a.host)}</b>: ${w.last_a} \u2192 ${d.a.score}<br><b>${esc(d.b.host)}</b>: ${w.last_b} \u2192 ${d.b.score}</p><p>Top fix: ${esc(d.plan[0]?.label || "none, you're clean")}</p><p><a href="${SITE}/fight/${encodeURIComponent(d.slug)}">See the full fight</a></p><p style="color:#888;font-size:12px"><a href="${SITE}/api/unwatch?id=${w.id}&t=${w.token}">Stop these emails</a></p>`
        );
      }
      await env.DB.prepare("UPDATE watches SET last_a=?1, last_b=?2, checked_at=?3 WHERE id=?4").bind(d.a.score, d.b.score, Date.now(), w.id).run();
    } catch {
    }
  let battles = (await env.DB.prepare("SELECT b.* FROM battles b JOIN members m ON m.key = b.member_key AND m.active = 1 LIMIT 300").all()).results;
  for (let bt of battles)
    try {
      let res = await battle(env, bt.a, bt.b, JSON.parse(bt.keywords), bt.gl), prev = Object.fromEntries(JSON.parse(bt.last || "[]").map((r) => [r.keyword, r])), moves = res.rows.filter((r) => prev[r.keyword] && (prev[r.keyword].a !== r.a || prev[r.keyword].b !== r.b));
      if (moves.length) {
        let f = (v) => v ? "#" + v : "100+";
        await sendEmail(
          env,
          bt.email,
          `${moves.length} keyword${moves.length > 1 ? "s" : ""} moved: ${bt.a} vs ${bt.b}`,
          `<table cellpadding="6"><tr><th align="left">Keyword</th><th>You</th><th>Rival</th></tr>${moves.map((r) => `<tr><td>${esc(r.keyword)}</td><td>${f(prev[r.keyword].a)} \u2192 ${f(r.a)}</td><td>${f(prev[r.keyword].b)} \u2192 ${f(r.b)}</td></tr>`).join("")}</table><p><a href="${SITE}/keywords-battle?a=${encodeURIComponent(bt.a)}&b=${encodeURIComponent(bt.b)}">Open Keyword Battle</a></p>`
        );
      }
      await env.DB.prepare("UPDATE battles SET last=?1, checked_at=?2 WHERE id=?3").bind(JSON.stringify(res.rows), Date.now(), bt.id).run();
    } catch {
    }
}
var worker_default = {
  async fetch(req, env, ctx) {
    let u = new URL(req.url);
    SITE = env.SITE_URL || u.origin;
    let p = u.pathname.replace(/\/+$/, "") || "/";
    if (p === "/api/duel") {
      let a, b;
      try {
        a = norm(u.searchParams.get("a")), b = norm(u.searchParams.get("b"));
      } catch {
        return json({ error: "Enter two valid websites, like shop.com and rival.com." }, 400);
      }
      if (hostOf(a) === hostOf(b)) return json({ error: "Pick two different websites." }, 400);
      let m = await member(req, env), slug = slugOf(hostOf(a), hostOf(b)), old = await storedFight(env, slug);
      if (old && old.age < 36e5)
        return ctx.waitUntil(env.DB.prepare("UPDATE fights SET views=views+1 WHERE slug=?1").bind(slug).run()), json(withReport(old.d, !!m));
      let who = m ? m.key : ipOf(req), plan = m ? "pro" : "free";
      if (!await canUse(env, who, "fights", plan))
        return json({ error: m ? "You've used your 40 fights this month. They reset on the 1st." : "You've used your free fight this week. Go Pro for 40 fights a month." }, 429);
      try {
        let d = await runFight(a, b, env);
        return ctx.waitUntil(Promise.all([saveFight(env, d), spend(env, who, "fights", plan)])), json(withReport(d, !!m));
      } catch {
        return json({ error: "Couldn't reach one of the sites. Check the address and try again." }, 502);
      }
    }
    if (p === "/api/rivals") {
      if (!env.SERPER_KEY) return json({ error: "Rival finder isn't switched on yet." }, 503);
      if (!await toolUse(env, req, "rivals")) return json({ error: "You've used the rival finder 3 times today. Try again tomorrow." }, 429);
      try {
        let site = norm(u.searchParams.get("site")), pg = await get(site), kws = keywordsFromHtml(await pg.text(), hostOf(site));
        return kws.length ? json({ rivals: await findRivals(env, hostOf(site), kws, u.searchParams.get("gl") || "us"), keywords: kws }) : json({ rivals: [] });
      } catch {
        return json({ error: "Couldn't read that site. Check the address." }, 502);
      }
    }
    if (p === "/api/keywords") {
      if (!await toolUse(env, req, "keywords")) return json({ error: "Too many tries today. Type your keywords instead." }, 429);
      try {
        let site = norm(u.searchParams.get("site")), kws = keywordsFromHtml(await (await get(site)).text(), hostOf(site)), rival = u.searchParams.get("rival");
        if (kws.length < 10 && rival) {
          let r = norm(rival);
          kws = [...kws, ...keywordsFromHtml(await (await get(r)).text(), hostOf(r)).filter((k) => !kws.includes(k))].slice(0, 10);
        }
        return json({ keywords: kws });
      } catch {
        return json({ error: "Couldn't read that site. Check the address." }, 502);
      }
    }
    if (p === "/api/battle" && req.method === "POST") {
      if (!env.SERPER_KEY) return json({ error: "Keyword Battle isn't switched on yet." }, 503);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let a, b;
      try {
        a = hostOf(norm(body.a)), b = hostOf(norm(body.b));
      } catch {
        return json({ error: "Enter two valid websites." }, 400);
      }
      let kws = [...new Set((body.keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 10);
      if (!kws.length) return json({ error: "Add at least one keyword, or tap Suggest keywords." }, 400);
      let m = await member(req, env), gl = m ? String(body.country || "us").slice(0, 2) : "us", who = m ? m.key : ipOf(req), plan = m ? "pro" : "free";
      if (!await canUse(env, who, "battles", plan))
        return json({ error: m ? "You've used your 4 Keyword Battles this month." : "You've used your free Keyword Battle this week. Go Pro for 4 a month with all 10 keywords." }, 429);
      try {
        let res = await battle(env, a, b, kws, gl);
        return ctx.waitUntil(spend(env, who, "battles", plan)), m && env.DB && ctx.waitUntil(env.DB.prepare(
          `INSERT INTO battles (member_key, email, a, b, gl, keywords, last, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
           ON CONFLICT(member_key, a, b) DO UPDATE SET gl=?5, keywords=?6, last=?7`
        ).bind(m.key, m.email, a, b, gl, JSON.stringify(kws), JSON.stringify(res.rows), Date.now()).run()), m || (res.rows = res.rows.map((r, i) => i === 0 ? r : { locked: !0 }), res.winsA = res.rows[0].edge === "a" ? 1 : 0, res.winsB = res.rows[0].edge === "b" ? 1 : 0), json(res);
      } catch {
        return json({ error: "Google search didn't answer. Try again in a minute." }, 502);
      }
    }
    if (p === "/api/links") {
      if (!await toolUse(env, req, "links")) return json({ error: "You've used the link checker 10 times today. Try again tomorrow." }, 429);
      try {
        let url = normPage(u.searchParams.get("url")), r = await get(url, 1e4);
        return json(await checkLinks(r.url || url, await r.text(), UA));
      } catch {
        return json({ error: "Couldn't load that page. Check the address." }, 502);
      }
    }
    if (p === "/api/strategy" && req.method === "POST") {
      let m = await member(req, env);
      if (!m) return json({ error: "AI strategy is a Pro feature." }, 402);
      if (!env.OPENROUTER_KEY) return json({ error: "AI strategy isn't switched on yet." }, 503);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let a, b;
      try {
        a = norm(body.a), b = norm(body.b);
      } catch {
        return json({ error: "Bad websites." }, 400);
      }
      if (!await canUse(env, m.key, "strategy", "pro")) return json({ error: "You've used your 4 AI strategies this month." }, 429);
      try {
        let old = await storedFight(env, slugOf(hostOf(a), hostOf(b))), d = old ? old.d : await runFight(a, b, env), strategy = await aiStrategy(env, d);
        return ctx.waitUntil(spend(env, m.key, "strategy", "pro")), json({ strategy });
      } catch {
        return json({ error: "The AI didn't answer. Try again in a minute." }, 502);
      }
    }
    if (p === "/api/watch" && req.method === "POST") {
      let m = await member(req, env);
      if (!m) return json({ error: "Monday email reports are a Pro feature." }, 402);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let a, b;
      try {
        a = hostOf(norm(body.a)), b = hostOf(norm(body.b));
      } catch {
        return json({ error: "Bad websites." }, 400);
      }
      let f = await env.DB.prepare("SELECT a_score, b_score FROM fights WHERE slug=?1").bind(slugOf(a, b)).first();
      return await env.DB.prepare(
        `INSERT INTO watches (email, a, b, last_a, last_b, token, active, created_at) VALUES (?1,?2,?3,?4,?5,?6,1,?7)
         ON CONFLICT(email, a, b) DO UPDATE SET active=1`
      ).bind(m.email, a, b, f?.a_score ?? 0, f?.b_score ?? 0, crypto.randomUUID(), Date.now()).run(), json({ ok: !0, email: m.email });
    }
    if (p === "/api/unwatch")
      return env.DB && await env.DB.prepare("UPDATE watches SET active=0 WHERE id=?1 AND token=?2").bind(u.searchParams.get("id"), u.searchParams.get("t")).run(), new Response("You won't get these emails anymore.", { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (p === "/api/stripe" && req.method === "POST") {
      if (!env.STRIPE_WEBHOOK_SECRET || !env.DB) return json({ error: "not set up" }, 503);
      let ev = await verifyStripe(req, env.STRIPE_WEBHOOK_SECRET);
      if (!ev) return json({ error: "bad signature" }, 400);
      let o = ev.data.object;
      if (ev.type === "checkout.session.completed") {
        let email = (o.customer_details?.email || o.customer_email || "").toLowerCase(), plan = o.mode === "subscription" ? "pro" : "lifetime", key = crypto.randomUUID().replace(/-/g, "");
        await env.DB.prepare(`INSERT INTO members (key, email, plan, customer, active, created_at) VALUES (?1,?2,?3,?4,1,?5)
          ON CONFLICT(email) DO UPDATE SET plan=?3, customer=?4, active=1`).bind(key, email, plan, o.customer || "", Date.now()).run();
        let row = await env.DB.prepare("SELECT key FROM members WHERE email=?1").bind(email).first();
        await sendEmail(
          env,
          email,
          "You're Pro on SEO Fight \u{1F94A}",
          `<p>Welcome to the main card.</p><p><a href="${SITE}/activate?key=${row.key}">Tap here to switch on Pro on this device</a></p><p>Use the same link on any other device. Keep this email.</p>`
        );
      }
      return ev.type === "customer.subscription.deleted" && await env.DB.prepare("UPDATE members SET active=0 WHERE customer=?1 AND plan='pro'").bind(o.customer).run(), json({ received: !0 });
    }
    if (p === "/activate") {
      let key = u.searchParams.get("key") || "", m = env.DB && await env.DB.prepare("SELECT key FROM members WHERE key=?1 AND active=1").bind(key).first();
      return m ? new Response(null, { status: 302, headers: { location: "/?pro=1", "set-cookie": `rf_key=${m.key}; Path=/; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax` } }) : new Response("That link isn't valid. Check your SEO Fight email.", { status: 400 });
    }
    if (p.startsWith("/fight/")) {
      let slug = decodeURIComponent(p.slice(7)).toLowerCase(), old = await storedFight(env, slug);
      if (old) return fightPage(env, old.d, `/fight/${encodeURIComponent(slug)}`);
      let mm = slug.match(/^(.+\.[a-z]{2,})-vs-(.+\.[a-z]{2,})$/);
      return mm ? page(env, { ...HOME, a: mm[1], b: mm[2], path: p, cache: "no-store" }) : page(env, { ...HOME, status: 404, cache: "no-store" });
    }
    if (p === "/fights") return boardPage(env);
    if (TOOL_PAGES[p]) return toolPage(env, p, u);
    if (p === "/sitemap.xml") {
      let rows = env.DB ? (await env.DB.prepare("SELECT slug, updated_at FROM fights ORDER BY views DESC LIMIT 45000").all()).results : [], urls = ["/", "/fights", ...Object.keys(TOOL_PAGES)].map((x) => `<url><loc>${SITE}${x}</loc></url>`).concat(rows.map((r) => `<url><loc>${SITE}/fight/${encodeURIComponent(r.slug)}</loc><lastmod>${new Date(r.updated_at).toISOString().slice(0, 10)}</lastmod></url>`));
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, { headers: { "content-type": "application/xml" } });
    }
    return p === "/robots.txt" ? new Response(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /activate

Sitemap: ${SITE}/sitemap.xml
`, { headers: { "content-type": "text/plain" } }) : p === "/llms.txt" ? new Response(`# SEO Fight

> SEO Fight compares two websites head to head on 31 live SEO and AI-search checks, names a winner, and gives the loser a ranked fix list.

## Pages

- [Start a fight](${SITE}/): compare two websites
- [Keyword Battle](${SITE}/keywords-battle): who ranks higher on Google for 10 keywords
- [Free SEO tools](${SITE}/tools): broken link checker, robots.txt, schema and llms.txt generators
- [Biggest fights](${SITE}/fights): most-watched brand vs brand results

Free: 1 fight per week. Pro: $12/month. Lifetime: $79 once.
`, { headers: { "content-type": "text/plain; charset=utf-8" } }) : p === "/" ? page(env, HOME) : page(env, { ...HOME, status: 404, cache: "no-store" });
  },
  async scheduled(event, env, ctx) {
    env.SITE_URL && (SITE = env.SITE_URL), ctx.waitUntil(weekly(env));
  }
};
export {
  worker_default as default
};
