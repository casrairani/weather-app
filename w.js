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
    `# SEO fight: ${d.a.host} (${d.a.score}) vs ${d.b.host} (${d.b.score})`,
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
  let brand2 = siteHost.split(".")[0].replace(/[-_]/g, " ").toLowerCase(), title = strip2((html2.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""), desc = (html2.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) || [])[1] || "", heads = (html2.match(/<h[12][^>]*>[\s\S]*?<\/h[12]>/gi) || []).map(strip2), sources = [[title, 3], [heads.join(" | "), 2], [desc, 1]], score = /* @__PURE__ */ new Map();
  for (let [text, w] of sources)
    for (let part of text.toLowerCase().split(/[|·•–—:,.!?()\[\]"]+/)) {
      let words = part.split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}&'-]/gu, "")).filter(Boolean);
      for (let n = 3; n >= 2; n--) for (let i = 0; i + n <= words.length; i++) {
        let g = words.slice(i, i + n);
        if (STOP.has(g[0]) || STOP.has(g[n - 1]) || g.join(" ").includes(brand2)) continue;
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
var DEPTH = 3;
async function serp(env, q, gl = "us", page2 = 1) {
  let r = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": env.SERPER_KEY, "content-type": "application/json" },
    body: JSON.stringify({ q, gl, page: page2 })
  });
  if (!r.ok) throw new Error("search failed");
  return env.__ev && await env.__ev("serper", q.slice(0, 60)), ((await r.json()).organic || []).map((o, i) => ({ pos: (page2 - 1) * 10 + i + 1, host: host(o.link), url: o.link }));
}
var DIRECTORY = /(^|\.)(yelp|yellowpages|yp|tripadvisor|facebook|instagram|linkedin|angi|angieslist|homeadvisor|thumbtack|houzz|bbb|mapquest|nextdoor|expertise|bark|porch|zillow|realtor|healthgrades|zocdoc|opentable|groupon|foursquare|manta|chamberofcommerce|superpages|citysearch|wikipedia|reddit|quora|youtube|google|apple|amazon|indeed|glassdoor|craigslist|kijiji|yellowpages|411|canada411|threebestrated|bestprosintown|topratedlocal|birdeye|trustpilot|clutch|upcity|designrush|forbes|nerdwallet|bobvila|thespruce|consumeraffairs|redfin|trulia|homestars|tiktok|x|twitter|pinterest|medium|wix|squarespace|godaddy)\./i;
async function localBusinesses(env, industry, city, gl = "us") {
  let seen = /* @__PURE__ */ new Set(), out = [];
  for (let page2 = 1; page2 <= 2 && out.length < 12; page2++)
    for (let r of await serp(env, `${industry} ${city}`, gl, page2))
      !r.host || seen.has(r.host) || DIRECTORY.test(r.host + ".") || /\.(gov|edu|org)(\.|$)/.test(r.host) || /(association|assoc|council|federation|society|institute|guild|chamber)/i.test(r.host) || (seen.add(r.host), out.push(r));
  return out;
}
async function battle(env, a, b, keywords, gl) {
  let rows = await Promise.all(keywords.slice(0, 10).map(async (kw) => {
    let res = [], find = (h) => res.find((r) => r.host === h || r.host.endsWith("." + h));
    for (let page2 = 1; page2 <= DEPTH; page2++) {
      let got = await serp(env, kw, gl, page2);
      if (res.push(...got), find(a) && find(b) || got.length < 8) break;
    }
    let pa = find(a), pb = find(b), top = res[0];
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
<script>document.documentElement.dataset.view="__VIEW__"</script>
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
body { background: var(--bg); color: var(--ink); font: 400 17px/1.6 var(--f-body); -webkit-font-smoothing: antialiased }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg) }
.wrap { max-width: 1120px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)) }
a { color: inherit }
h1, h2, h3 { text-wrap: balance; margin: 0 }
.eyebrow { font: 600 14px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted) }
.display { font-family: var(--f-display); font-weight: 900; text-transform: uppercase; letter-spacing: .005em; line-height: .9 }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: 8px }

/* header */
header.top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 9; background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: saturate(1.6) blur(14px); -webkit-backdrop-filter: saturate(1.6) blur(14px); border-bottom: 1px solid var(--line) }
header.top .wrap { display: flex; align-items: center; gap: 24px; height: 60px }
.logo { display: flex; align-items: center; gap: 8px; font: 900 24px/1 var(--f-display); text-transform: uppercase; text-decoration: none; letter-spacing: .02em }
.logo i { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(90deg, var(--red) 50%, var(--blue) 50%); display: block; transform: rotate(45deg) scale(.78) }
nav.links { display: flex; gap: 22px; margin-left: auto; font-size: 15px; color: var(--muted) }
nav.links a { text-decoration: none } nav.links a:hover { color: var(--ink) }
.btn { appearance: none; border: 0; cursor: pointer; font: 600 16px/1 var(--f-body); border-radius: 999px; padding: 12px 20px; background: var(--ink); color: var(--bg); text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: transform .15s ease, opacity .15s }
.btn:hover { transform: translateY(-1px) } .btn:active { transform: none; opacity: .85 }
.btn.ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1px var(--line) }
.btn.sm { padding: 9px 16px; font-size: 15px }
@media (max-width: 720px) { nav.links { display: none } header.top .btn { margin-left: auto } }

/* hero */
.hero { padding-block: 64px 32px; text-align: center }
.hero .live { display: inline-flex; gap: 8px; align-items: center; padding: 7px 12px; border-radius: 999px; background: var(--surface); box-shadow: var(--shadow); font: 500 15px/1 var(--f-body); color: var(--muted) }
.hero .live b { width: 8px; height: 8px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 4px var(--red-soft); animation: pulse 1.6s infinite }
@keyframes pulse { 50% { box-shadow: 0 0 0 7px transparent } }
.hero h1 { font-size: clamp(56px, 11vw, 132px); margin-top: 22px }
.hero h1 .r { color: var(--red) } .hero h1 .b { color: var(--blue) }
.hero p.lede { max-width: 560px; margin: 18px auto 0; color: var(--muted); font-size: 18px }

.ring { margin: 36px auto 0; max-width: 860px; display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; background: var(--surface); padding: 12px; border-radius: 26px; box-shadow: var(--shadow) }
.corner { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 12px 16px; border-radius: 16px; min-width: 0 }
.corner.red { background: var(--red-soft) } .corner.blue { background: var(--blue-soft) }
.corner label { font: 600 13px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase }
.corner.red label { color: var(--red) } .corner.blue label { color: var(--blue) }
.corner input { border: 0; background: transparent; font: 600 19px/1.3 var(--f-body); color: var(--ink); width: 100%; padding: 4px 0; outline: none }
.corner input::placeholder { color: color-mix(in srgb, var(--ink) 35%, transparent) }
.vs { align-self: center; font: 900 30px/1 var(--f-display); color: var(--muted); padding-inline: 4px }
.fight { grid-column: 1 / -1; justify-content: center; font: 900 26px/1 var(--f-display); text-transform: uppercase; letter-spacing: .04em; padding: 18px; border-radius: 16px; background: linear-gradient(90deg, var(--red), color-mix(in srgb, var(--red) 50%, var(--blue)), var(--blue)) ; color: #fff }
.fight[disabled] { opacity: .7; cursor: progress }
.proof { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; margin-top: 18px; font-size: 15px; color: var(--muted) }
.proof span::before { content: "\u2713"; color: var(--good); font-weight: 700; margin-right: 6px }
.err { color: var(--bad); margin-top: 14px; font-weight: 500 }
@media (max-width: 640px) { .ring { grid-template-columns: 1fr } .vs { justify-self: center; padding: 2px } }

/* results */
section { padding-block: 56px }
.sec-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px }
.sec-head h2 { font-size: clamp(40px, 6vw, 64px) }
.tag { font: 600 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 7px 10px; border-radius: 999px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted) }

.tape { background: var(--surface); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden }
.tape-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 32px 28px 24px }
.fighter { min-width: 0 } .fighter.b { text-align: right }
.fighter .corner-name { font: 600 13px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase }
.fighter.a .corner-name { color: var(--red) } .fighter.b .corner-name { color: var(--blue) }
.fighter .host { font: 700 clamp(16px, 2.4vw, 22px)/1.2 var(--f-body); margin-top: 8px; overflow-wrap: anywhere }
.fighter .score { font: 900 clamp(84px, 13vw, 150px)/.85 var(--f-display); margin-top: 10px; font-variant-numeric: tabular-nums }
.fighter.a .score { color: var(--red) } .fighter.b .score { color: var(--blue) }
.belt { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; padding: 6px 12px; border-radius: 999px; background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--gold); font: 700 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase }
.center-stat { text-align: center; font: 900 22px/1 var(--f-display); color: var(--muted) }
.center-stat small { display: block; font: 500 14px/1.4 var(--f-mono); letter-spacing: .06em; margin-top: 6px; text-transform: uppercase }

.rounds { border-top: 1px solid var(--line); padding: 8px 28px 20px }
.round { display: grid; grid-template-columns: 1fr 170px 1fr; align-items: center; gap: 14px; padding-block: 12px }
.round + .round { border-top: 1px dashed var(--line) }
.round .name { text-align: center; font: 600 15px/1.2 var(--f-body) }
.round .name small { display: block; font: 500 13px/1 var(--f-mono); color: var(--muted); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px }
.bar { height: 10px; border-radius: 999px; background: var(--line); position: relative; overflow: hidden }
.bar > i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; transition: width .9s cubic-bezier(.2,.8,.2,1) }
.bar.a { transform: scaleX(-1) } .bar.a > i { background: var(--red) } .bar.b > i { background: var(--blue) }
.round .val { font: 600 15px/1 var(--f-mono); font-variant-numeric: tabular-nums; display: flex; gap: 10px; align-items: center }
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
.panel .sub { color: var(--muted); font-size: 15px; margin: 0 0 14px }

.tbl-wrap { overflow-x: auto; margin-inline: -6px }
table { width: 100%; border-collapse: collapse; font-size: 15px; min-width: 460px }
th { font: 600 13px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .1em; color: var(--muted); text-align: left; padding: 10px 6px; border-bottom: 1px solid var(--line) }
td { padding: 9px 6px; border-bottom: 1px solid var(--line); vertical-align: middle }
td.v { font-family: var(--f-mono); font-size: 15px; font-variant-numeric: tabular-nums }
tr.cat td { font: 700 13px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .12em; color: var(--muted); padding-top: 18px; border-bottom: 0 }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: 1px }
.dot.good { background: var(--good) } .dot.warn { background: var(--warn) } .dot.bad { background: var(--bad) }
.edge { font: 700 13px/1 var(--f-mono); padding: 4px 7px; border-radius: 6px; white-space: nowrap }
.edge.a { background: var(--red-soft); color: var(--red) } .edge.b { background: var(--blue-soft); color: var(--blue) }
.new { font: 700 12px/1 var(--f-mono); letter-spacing: .08em; padding: 3px 6px; border-radius: 5px; background: color-mix(in srgb, var(--gold) 18%, transparent); color: var(--gold); margin-left: 6px; vertical-align: 1px }

.plan { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px }
.plan li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 14px; border-radius: 14px; background: var(--bg) }
.plan .sev { font: 700 12px/1 var(--f-mono); letter-spacing: .08em; padding: 5px 7px; border-radius: 6px; text-transform: uppercase; margin-top: 2px }
.sev.bad { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad) }
.sev.warn { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn) }
.plan b { display: block; font-weight: 600 } .plan p { margin: 2px 0 0; color: var(--muted); font-size: 15px }
.plan .gain { font: 700 15px/1 var(--f-mono); color: var(--good); white-space: nowrap; margin-top: 3px }
.watch { margin-top: 14px; padding: 16px; border-radius: 14px; box-shadow: inset 0 0 0 1px var(--line); display: grid; gap: 6px }
.watch p { margin: 0; color: var(--muted); font-size: 15px }
.wrow { display: flex; gap: 8px; margin-top: 4px } .wrow input { flex: 1; min-width: 0; border: 0; border-radius: 999px; padding: 10px 14px; background: var(--bg); color: var(--ink); font: 500 16px var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.seo-sum { color: var(--muted); max-width: 760px } .seo-sum h2 { font: 800 30px/1.1 var(--f-display); text-transform: uppercase; color: var(--ink); margin-bottom: 10px }
.board { display: grid; gap: 10px } .bout { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 16px 20px; border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); text-decoration: none }
.bout:hover { transform: translateY(-1px) } .bout .h { font-weight: 600; overflow-wrap: anywhere; min-width: 0 } .bout .h.b { text-align: right }
.bout .s { font: 900 34px/1 var(--f-display); font-variant-numeric: tabular-nums; display: flex; gap: 10px } .bout .s .ra { color: var(--red) } .bout .s .rb { color: var(--blue) } .bout .s i { font-style: normal; color: var(--muted); font-size: 20px; align-self: center }
.rivals-q { margin: 14px 0 0; color: var(--muted); font-size: 16px } .linkbtn { appearance: none; border: 0; background: none; color: var(--ink); font: 600 16px var(--f-body); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 0 }
.rival-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 12px } .rival-list button { border: 0; cursor: pointer; padding: 8px 14px; border-radius: 999px; background: var(--blue-soft); color: var(--blue); font: 600 15px var(--f-body) }
.ai-out { margin-top: 14px; padding: 16px; border-radius: 14px; background: var(--bg); font-size: 16px; white-space: pre-wrap; overflow-wrap: anywhere }
.agent { margin-top: 14px; padding: 16px; border-radius: 14px; background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)); display: flex; gap: 12px; align-items: center; flex-wrap: wrap }
.agent p { margin: 0; flex: 1 1 220px; font-size: 15px } .agent b { display: block; font-size: 16px }

/* features */
.feats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px }
.feat { padding: 22px; border-radius: 20px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line) }
.feat .k { font: 900 44px/1 var(--f-display); }
.feat h3 { font: 600 17px/1.3 var(--f-body); margin: 12px 0 6px }
.feat p { margin: 0; color: var(--muted); font-size: 16px }
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
.price .pill { position: absolute; top: -12px; left: 26px; background: var(--red); color: #fff; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 6px 10px; border-radius: 999px }
.price h3 { font: 800 26px/1 var(--f-display); text-transform: uppercase }
.price .amt { font: 900 64px/.9 var(--f-display); font-variant-numeric: tabular-nums } .price .amt small { font: 500 16px var(--f-body); color: var(--muted); margin-left: 4px }
.price ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; font-size: 16px; flex: 1 }
.price li::before { content: "\u2713"; color: var(--good); font-weight: 700; margin-right: 8px }
.price .btn { justify-content: center }
.price.pop .btn { background: var(--red); color: #fff }
@media (max-width: 860px) { .prices { grid-template-columns: 1fr } }

details { background: var(--surface); border-radius: 16px; padding: 18px 20px; box-shadow: inset 0 0 0 1px var(--line) }
details + details { margin-top: 10px }
summary { cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px }
summary::after { content: "+"; font: 500 20px/1 var(--f-mono); color: var(--muted) } details[open] summary::after { content: "\u2013" }
details p { margin: 10px 0 0; color: var(--muted) }
footer { padding-block: 40px 56px; color: var(--muted); font-size: 15px; border-top: 1px solid var(--line); margin-top: 32px }
footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px }

/* fight card modal */
.modal { position: fixed; inset: 0; z-index: 20; background: rgba(5,7,12,.72); backdrop-filter: blur(8px); display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)) }
.modal .box { background: var(--surface); border-radius: 24px; padding: 18px; display: grid; gap: 14px; max-height: 100%; overflow: auto; width: min(420px, 100%) }
.modal canvas { width: 100%; height: auto; border-radius: 14px; display: block; aspect-ratio: 9 / 16; max-width: 100% }
.modal .row { display: flex; gap: 8px; flex-wrap: wrap } .modal .row .btn { flex: 1; justify-content: center }
.toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 12px 18px; border-radius: 999px; font-weight: 600; font-size: 15px; z-index: 30 }
.loading .tape, .loading .grid2 { opacity: .45; filter: saturate(.4); transition: opacity .2s }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }

/* ---- views ---- */
html[data-view=home] #fight, html[data-view=home] .seo-sum { display: none }
html[data-view=pricing] #test, html[data-view=pricing] #night, html[data-view=pricing] #maincard, html[data-view=pricing] #fight, html[data-view=pricing] #why, html[data-view=pricing] .seo-sum { display: none }
html[data-view=pricing] #pricing { padding-top: 8px } html[data-view=pricing] #pricing .sec-head h2 { display: none }
html[data-view=fight] #maincard, html[data-view=fight] #night, html[data-view=fight] #testYours { display: none }
html[data-view=fight]:not([data-revealed]) #sealed, html[data-view=fight]:not([data-revealed]) .seo-sum { display: none }
/* ---- main card posters ---- */
.cat-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px }
.chip { border: 0; cursor: pointer; padding: 9px 14px; border-radius: 999px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); font: 600 15px var(--f-body) }
.chip.on { background: var(--ink); color: var(--bg); box-shadow: none }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px }
@media (max-width: 900px) { .cards { grid-template-columns: repeat(2, 1fr) } }
@media (max-width: 560px) { .cards { grid-template-columns: 1fr } }
.poster { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 34px 18px 18px; min-height: 270px; border-radius: 24px; text-decoration: none; color: #fff; overflow: hidden; min-width: 0;
  background: radial-gradient(110% 90% at 0% 30%, rgba(255,59,78,.38), transparent 60%), radial-gradient(110% 90% at 100% 70%, rgba(61,107,255,.38), transparent 60%), #0b0d13; transition: transform .2s ease }
.poster:hover { transform: translateY(-3px) }
.pc-cat { position: absolute; top: 14px; left: 16px; font: 600 13px/1 var(--f-mono); letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.6) }
.pc-a, .pc-b { font: 900 clamp(40px, 5vw, 60px)/.88 var(--f-display); text-transform: uppercase; max-width: 100%; overflow-wrap: anywhere }
.pc-a { color: #ff4d5e } .pc-b { color: #6b8fff }
.pc-vs { font: 900 30px/1 var(--f-display); margin: 6px 0 }
.pc-foot { display: flex; justify-content: space-between; gap: 8px; width: 100%; margin-top: 18px; font: 500 15px/1.2 var(--f-body); color: rgba(255,255,255,.7) }
.pc-foot b { color: #fff; font-weight: 700 }
.more { text-align: center; margin-top: 22px }
/* ---- pick your champion ---- */
.gate { text-align: center; padding: 44px 20px; border-radius: 28px; background: var(--surface); box-shadow: var(--shadow) }
.gate h2 { font-size: clamp(46px, 8vw, 88px); margin: 12px 0 26px }
.picks { display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; align-items: center; max-width: 780px; margin: 0 auto }
.pick { border: 0; cursor: pointer; padding: 28px 16px; border-radius: 22px; color: #fff; font: 900 clamp(28px, 4.4vw, 48px)/1 var(--f-display); text-transform: uppercase; overflow-wrap: anywhere; transition: transform .15s ease }
.pick.a { background: var(--red) } .pick.b { background: var(--blue) }
.pick:hover { transform: scale(1.03) } .pick:active { transform: scale(.98) }
.pvs { font: 900 30px/1 var(--f-display); color: var(--muted) }
.gate-note { color: var(--muted); margin: 20px 0 8px }
.unlock h2 { margin-bottom: 6px }
.unlock-row { display: flex; gap: 10px; max-width: 560px; margin: 18px auto 10px }
.unlock-row input { flex: 1; min-width: 0; border: 0; border-radius: 16px; padding: 18px; background: var(--bg); color: var(--ink); font: 500 18px var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.unlock-row .btn { padding: 18px 28px; font-size: 24px; border-radius: 16px }
.fine { color: var(--muted); font-size: 15px; margin: 0 }
@media (max-width: 560px) { .unlock-row { flex-direction: column } }
@media (max-width: 560px) { .picks { grid-template-columns: 1fr } }
.verdict { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; justify-content: center; text-align: center; padding: 16px 20px; border-radius: 18px; margin-bottom: 22px }
.verdict b { font: 900 30px/1 var(--f-display); text-transform: uppercase }
.verdict.win { background: color-mix(in srgb, var(--good) 15%, transparent) }
.verdict.lose { background: color-mix(in srgb, var(--gold) 18%, transparent) }
/* ---- badge, fix-it, sign-up ---- */
.badge-prev { padding: 14px; border-radius: 14px; background: var(--bg); display: flex; justify-content: center; margin-bottom: 12px }
pre.code { margin: 0 0 12px; padding: 12px; border-radius: 12px; background: var(--bg); color: var(--muted); font: 14px/1.5 var(--f-mono); white-space: pre-wrap; overflow-wrap: anywhere }
.fixit { display: flex; flex-direction: column; justify-content: center; background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)) }
.fixit .btn { align-self: flex-start; padding: 16px 26px; font-size: 22px }
.lead { display: grid; gap: 12px; width: min(440px, 100%) }
.lead h3 { font-size: 46px }
.lead p { margin: 0; color: var(--muted) }
.lead input { border: 0; border-radius: 12px; padding: 14px; background: var(--bg); color: var(--ink); font: 500 16px var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.lead .linkbtn { justify-self: center; font-size: 15px; color: var(--muted) }
.modal video { width: 100%; border-radius: 14px; aspect-ratio: 9 / 16; background: #000 }
.rec { margin: 0; text-align: center; color: var(--muted); font: 600 15px var(--f-mono) }
.prices { grid-template-columns: repeat(4, 1fr) }
@media (max-width: 1100px) { .prices { grid-template-columns: repeat(2, 1fr) } }
@media (max-width: 620px) { .prices { grid-template-columns: 1fr } }
.price.agency { box-shadow: 0 0 0 2px var(--blue), var(--shadow) }
.price.agency .btn { background: var(--blue); color: #fff }
.final { text-align: center; color: var(--muted); font-size: 15px; margin: 18px auto 0; max-width: 640px } .final a { color: inherit }
footer a { color: inherit }
.nc-checks { position: relative; border-radius: 18px; overflow: hidden; background: rgba(255,255,255,.04) }
.nc-checks.open .ncc-grid { filter: none; user-select: text; pointer-events: auto; grid-template-columns: 1fr; max-height: 420px; overflow: auto }
.ncc-head { display: grid; grid-template-columns: 1fr 150px 150px; gap: 10px; padding: 12px 16px 6px; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: #f2c14e }
.ncc-head .ncc-hh:nth-child(2) { color: #ff3b4e } .ncc-head .ncc-hh:nth-child(3) { color: #5b82ff }
.nc-checks.open .ncc-row { grid-template-columns: 1fr 150px 150px }
.ncc-cat { padding: 12px 0 4px; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.45) }
.ncc-v { display: flex; gap: 6px; align-items: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis } .ncc-v.w { color: #fff; font-weight: 700 }
.ncc-v .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #f2c14e } .ncc-v .dot.good { background: #22c55e } .ncc-v .dot.bad { background: #ef4444 }
.nc-note { margin: 0; text-align: center; font-size: 15px; color: rgba(255,255,255,.6) }
@media (max-width: 640px) { .ncc-head, .nc-checks.open .ncc-row { grid-template-columns: 1fr 88px 88px; gap: 6px } .ncc-row { font-size: 14px } }
.ncc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; padding: 14px 16px; filter: blur(5px); user-select: none; pointer-events: none }
.ncc-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 15px }
.ncc-l { color: rgba(255,255,255,.85) } .ncc-v { color: rgba(255,255,255,.6); font-family: var(--f-mono) }
.ncc-lock { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 6px; text-align: center; padding: 16px; background: linear-gradient(180deg, rgba(11,13,19,.35), rgba(11,13,19,.85)) }
.ncc-lock .ncc-ico { font-size: 26px } .ncc-lock b { font: 800 clamp(22px, 3.4vw, 30px)/1 var(--f-display); text-transform: uppercase } .ncc-lock span { color: rgba(255,255,255,.7); font-size: 15px } .ncc-lock .btn { margin-top: 6px }
@media (max-width: 640px) { .ncc-grid { grid-template-columns: 1fr } }

.hero h1 .l1 { display: block; white-space: nowrap }
.hero h1 .rot { position: relative; display: block; height: 1.05em; overflow: hidden }
.hero h1 .rot-in { position: absolute; inset: 0; display: block; white-space: nowrap; transition: transform .55s cubic-bezier(.2,.8,.2,1), opacity .55s; line-height: 1.05 }
.hero h1 .rot-in.enter { transform: translateY(100%); opacity: 0 } .hero h1 .rot-in.leave { transform: translateY(-100%); opacity: 0 }
.hero h1 .rot-in small { font-size: .42em; color: var(--muted); vertical-align: middle; margin: 0 .1em }
.test-wrap { padding-block: 0 28px } #test { padding-top: 0 } #night { padding-top: 0 }

.tonight { display: inline-grid; justify-items: center; gap: 6px; margin: 22px auto 4px; padding: 16px 26px; border-radius: 24px; background: #0b0d13; color: #fff; text-decoration: none; box-shadow: 0 20px 60px rgba(11,13,19,.25); outline: 2px solid #f2c14e; outline-offset: -2px }
.tonight .tn-tag { font: 700 14px/1 var(--f-mono); letter-spacing: .12em; text-transform: uppercase; color: #f2c14e }
.tonight .tn-m { font: 800 clamp(30px, 6vw, 52px)/1 var(--f-display); text-transform: uppercase; display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; justify-content: center }
.tonight .tn-m .r { color: #ff3b4e } .tonight .tn-m .b { color: #5b82ff } .tonight .tn-m i { font-style: normal; font-size: .45em; color: rgba(255,255,255,.55) }
.tonight .tn-go { font-size: 15px; color: rgba(255,255,255,.7) }
.test-yours { margin: 26px 0 0; font: 800 clamp(20px, 3vw, 26px)/1.1 var(--f-display); text-transform: uppercase; color: var(--ink) }
.test-yours + .ring { margin-top: 14px; outline: 3px solid transparent; box-shadow: 0 0 0 3px rgba(224,38,58,.18), 0 24px 70px rgba(36,87,245,.18) }
#night { padding-block: 8px 24px }
.night-card { background: #0b0d13; color: #fff; border-radius: 28px; padding: 22px; display: grid; gap: 18px; outline: 2px solid #f2c14e; outline-offset: -2px }
.nc-head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font: 700 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase } .nc-tag { color: #f2c14e } .nc-votes { color: rgba(255,255,255,.55) }
.nc-tape { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; text-align: center }
.nc-f { display: grid; gap: 4px; opacity: .75 } .nc-f.won { opacity: 1 }
.nc-host { font: 800 clamp(22px, 4vw, 34px)/1 var(--f-display); text-transform: uppercase }
.nc-f.a .nc-host, .nc-f.a .nc-score { color: #ff3b4e } .nc-f.b .nc-host, .nc-f.b .nc-score { color: #5b82ff }
.nc-score { font: 800 clamp(56px, 10vw, 96px)/1 var(--f-display) } .nc-belt { font: 700 14px/1 var(--f-mono); color: #f2c14e; letter-spacing: .1em; text-transform: uppercase; min-height: 12px }
.nc-vs { font: 800 20px var(--f-display); color: rgba(255,255,255,.4) }
.nc-rounds { display: grid; gap: 8px }
.nr { display: grid; grid-template-columns: 34px 1fr 96px 1fr 34px; gap: 10px; align-items: center; font-size: 15px }
.nr .v { font-weight: 700; color: rgba(255,255,255,.55); text-align: center } .nr .v.w { color: #fff } .nr .nm { text-align: center; color: rgba(255,255,255,.7); font: 600 13px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .08em }
.nr .bar { height: 8px; border-radius: 99px; background: rgba(255,255,255,.1); overflow: hidden; display: flex } .nr .bar.a { justify-content: flex-end } .nr .bar i { display: block; height: 100%; border-radius: 99px } .nr .bar.a i { background: #ff3b4e } .nr .bar.b i { background: #5b82ff }
.nc-cta { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center } .night-card .btn.ghost { color: #fff; border-color: rgba(255,255,255,.3); background: transparent }
@media (max-width: 640px) { .nr { grid-template-columns: 26px 1fr 70px 1fr 26px; gap: 6px } }

.upsell { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 26px }
.upsell .up { position: relative; padding-top: 30px; border: 2px solid transparent; display: grid; align-content: start; gap: 12px } .upsell .up .sub { margin: 0 } .upsell .up .btn { justify-self: start } .upsell .badge-prev img { width: 280px; height: 72px }
.upsell .up.fixit { border-color: var(--red, #e0263a); box-shadow: 0 18px 50px rgba(224,38,58,.18) }
.upsell .up.champ { border-color: #f2c14e }
.upsell .up h3 { font-size: 30px }
.upsell .up-tag { position: absolute; top: -12px; left: 20px; background: var(--red, #e0263a); color: #fff; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 6px 10px; border-radius: 999px }
.upsell .up-tag.gold { background: #f2c14e; color: #0b0d13 }
.upsell .up.first { order: -1 }
@media (max-width: 760px) { .upsell { grid-template-columns: 1fr } }
.price .pill.gold { background: #f2c14e; color: #0b0d13; left: auto; right: 22px }

.btn.google { display: inline-flex; gap: 10px; align-items: center; justify-content: center; background: #fff; color: #1f1f1f; border: 1px solid #dadce0; font-weight: 600 } .gate .btn.google { margin-top: 10px }
.poster.night { outline: 3px solid #f2c14e; outline-offset: -3px } .poster.night .pc-cat { background: #f2c14e; color: #0b0d13 }
footer .fcols { display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: 24px }
footer .fcols > div { display: grid; gap: 8px; align-content: start }
footer .fcols b { color: var(--ink); font-size: 15px }
footer .fcols a { text-decoration: none } footer .fcols a:hover { color: var(--ink) }
footer .fbrand span { font-size: 15px } footer .xlink { color: var(--ink) !important; display: inline-flex; align-items: center; gap: 10px; margin-top: 6px; padding: 8px 14px 8px 8px; border-radius: 999px; background: var(--surface); box-shadow: var(--shadow); justify-self: start } footer .xlink img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 2px #f2c14e } footer .xlink span { display: grid; line-height: 1.25 } footer .xlink b { font-size: 15px } footer .xlink small { font-size: 14px; color: var(--muted) }
footer .fcopy { margin-top: 24px; font-size: 15px }
@media (max-width: 760px) { footer .fcols { grid-template-columns: 1fr 1fr } footer .fbrand { grid-column: 1 / -1 } }
.cards-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px }
a.panel.post { text-decoration: none; color: inherit; display: grid; gap: 6px; transition: transform .15s } a.panel.post:hover { transform: translateY(-2px) }
a.panel.post h3 { font-size: 22px; line-height: 1.1 }
.post-body ul, .post-body ol { padding-left: 20px } .post-body li { margin: 6px 0 }
.about .founder { display: flex; gap: 14px; align-items: center; margin-bottom: 8px } .about .founder > div { display: grid }
.about .ava { width: 72px; height: 72px; object-fit: cover; box-shadow: 0 0 0 3px #fff, 0 0 0 5px #f2c14e; border-radius: 50%; display: grid; place-items: center; font: 800 26px var(--f-display); color: #fff; background: linear-gradient(135deg, var(--red, #e0263a), var(--blue, #2457f5)) }
.contact .field { display: grid; gap: 6px } .contact textarea, .contact select { font: inherit; padding: 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink) }
.price .left { color: var(--red, #e0263a); font-weight: 700 }


/* ===== 2026 polish: fight-poster type, arena navy, belt gold, punch buttons ===== */
:root { --bg: #EEF0F3; --ink: #10131A; --red: #E1232E; --blue: #1D4ED8; --gold: #E8B21C; --arena: #0F1B3D; --arena-2: #172654;
  --punch: 4px 4px 0 var(--ink) }
.logo { gap: 4px; font-size: 26px; letter-spacing: .01em } .logo .gloves { width: 40px; height: 25px; display: block; margin: 0 1px } .logo i { display: none }
.logo:hover .gloves { animation: touch .5s ease } @keyframes touch { 40% { transform: scaleX(.86) } }
.hero { padding-block: 52px 8px } .hero.test-wrap { padding-top: 0; padding-bottom: 28px } #test .test-yours { margin-top: 24px }
form.panel, .tool form.panel { border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink) }
.hero h1 { letter-spacing: -.005em }
/* the ring: hard edge, punch shadow */
.ring { border-radius: 22px; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink) !important; outline: 0 !important }
.corner { border-radius: 14px }
.fight { background: var(--red) !important; color: #fff; border-radius: 14px; box-shadow: var(--punch); border: 2px solid var(--ink); transition: transform .08s ease, box-shadow .08s ease }
.fight:hover { transform: translate(-1px, -1px); box-shadow: 5px 5px 0 var(--ink) }
.fight:active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--ink); opacity: 1 }
.night-card .fight, .upsell .fight { border-color: #fff; box-shadow: 4px 4px 0 #fff }
.night-card .fight:active, .upsell .fight:active { box-shadow: 0 0 0 #fff }
.test-yours { font-size: clamp(24px, 3.6vw, 34px); letter-spacing: .01em; margin-top: 8px }
/* arena navy instead of black */
.night-card { background: radial-gradient(120% 80% at 50% 0%, var(--arena-2), var(--arena) 70%); outline: 3px solid var(--gold); border-radius: 26px; box-shadow: 8px 8px 0 var(--ink) }
.nc-tag, .ncc-head { color: var(--gold) } .nc-belt { color: var(--gold) }
.nc-checks { background: rgba(255,255,255,.05) }
.poster { box-shadow: 5px 5px 0 var(--ink); border: 2px solid var(--ink) }
.poster.night { outline-color: var(--gold) }
.price { border: 2px solid var(--ink); box-shadow: 5px 5px 0 var(--ink) } .price.pop { border-color: var(--red); box-shadow: 5px 5px 0 var(--red) } .price.agency { border-color: var(--blue); box-shadow: 5px 5px 0 var(--blue) }
.price .pill.gold { background: var(--gold); color: var(--ink) }
.btn:not(.fight):not(.ghost):not(.google) { border: 2px solid var(--ink) }
@media (prefers-reduced-motion: reduce) { .fight, .logo .gloves { transition: none; animation: none } }
/* ===== prospect cards (homepage hunt mode, /agency, account) ===== */
.prospects { display: grid; gap: 14px; margin-top: 14px } .prospect { border: 2px solid var(--ink); border-radius: 16px; padding: 16px; display: grid; gap: 8px; background: var(--surface) }
.pr-top { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap } .pr-score i { font-style: normal; font-weight: 800 } .pr-score .r { color: var(--red) } .pr-score .b { color: var(--blue) }
.prospect .pitch { white-space: pre-wrap; max-height: 220px; overflow: auto; margin: 0 } .pr-act { display: flex; gap: 8px; flex-wrap: wrap }
pre.out { margin: 0; padding: 18px; border-radius: 16px; background: #0d1017; color: #e8ebf2; font: 15px/1.6 var(--f-mono); overflow-x: auto; white-space: pre; min-height: 160px }
/* ===== signed-in: header avatar, mode switch, ringside bar, your corner, hunt mode ===== */
header.top .btn.sm.hdr-fight { background: var(--red); color: #fff; border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); transition: transform .08s, box-shadow .08s }
header.top .btn.sm.hdr-fight:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--ink) } header.top .btn.sm.hdr-fight:active { transform: translate(3px, 3px); box-shadow: 0 0 0 var(--ink); opacity: 1 }
.avatar { flex: none; width: 38px; height: 38px; margin-left: -12px; border-radius: 50%; display: grid; place-items: center; text-decoration: none; color: #fff; font: 900 21px/1 var(--f-display); text-transform: uppercase; background: linear-gradient(135deg, var(--red) 50%, var(--blue) 50%); border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); transition: transform .08s, box-shadow .08s }
.avatar:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--ink) }
.modes { display: flex; width: max-content; max-width: 100%; gap: 4px; padding: 4px; margin: 16px auto 0; border-radius: 999px; background: var(--surface); border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink) }
.modes button { appearance: none; border: 0; cursor: pointer; border-radius: 999px; padding: 10px 16px; background: transparent; color: var(--ink); font: 600 16px/1 var(--f-body); display: inline-flex; align-items: center; gap: 8px; white-space: nowrap }
.modes button[aria-selected="true"][data-mode="fight"] { background: var(--red); color: #fff } .modes button[aria-selected="true"][data-mode="hunt"] { background: var(--blue); color: #fff }
.ag-tag { font: 700 12px/1 var(--f-mono); letter-spacing: .08em; text-transform: uppercase; padding: 4px 6px; border-radius: 6px; background: var(--gold); color: var(--ink) }
.modes ~ .ring { margin-top: 16px }
@media (max-width: 420px) { .modes button { padding: 10px 11px; font-size: 15px; gap: 6px } }
.ring.hunt .hunt-row { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(180px, 260px) 1fr; gap: 12px }
.ring.hunt .fight { grid-column: auto; background: var(--blue) !important }
.corner.gold { position: relative; background: color-mix(in srgb, var(--gold) 20%, transparent) } .corner.gold::after { content: "\u25BE"; position: absolute; right: 16px; bottom: 15px; font-size: 16px; color: var(--ink); pointer-events: none } .corner.gold label { color: color-mix(in srgb, var(--gold) 45%, var(--ink)) }
.corner select { border: 0; background: transparent; font: 600 17px/1.3 var(--f-body); color: var(--ink); width: 100%; padding: 4px 0; outline: none; appearance: none; cursor: pointer }
@media (max-width: 640px) { .ring.hunt .hunt-row { grid-template-columns: 1fr } }
.ringside { display: flex; align-items: center; justify-content: center; gap: 6px 10px; flex-wrap: wrap; max-width: 860px; margin: 14px auto 0; padding: 9px 14px; border-radius: 14px; background: var(--surface); border: 2px solid var(--ink); font: 500 15px/1.35 var(--f-body) }
.ringside a { color: inherit; text-decoration: none } .ringside .main { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center } .ringside .main:hover .txt { text-decoration: underline; text-underline-offset: 3px }
.ringside .pl { font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 5px 8px; border-radius: 6px; background: var(--ink); color: var(--bg) }
.ringside .pl.pro { background: var(--red); color: #fff } .ringside .pl.agency, .ringside .pl.owner { background: var(--blue); color: #fff } .ringside .pl.lifetime { background: var(--gold); color: var(--ink) }
@media (max-width: 560px) { .ringside { font-size: 15px; padding: 9px 10px; gap: 6px } .ringside .go, .ringside .sep.g { display: none } }
.ringside b { font-variant-numeric: tabular-nums } .ringside .sep { color: var(--muted) } .ringside .up { font-weight: 700; color: var(--red); text-decoration: underline; text-underline-offset: 3px } .ringside .go { color: var(--muted) }
.corner-strip, .hunt-zone { max-width: 860px; margin: 24px auto 0; text-align: left }
.cs-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px } .cs-head .eyebrow { color: var(--ink) } .cs-head a { font-size: 15px; color: var(--muted); text-decoration: none } .cs-head a:hover { color: var(--ink) }
.cs-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px }
.mini { display: grid; gap: 10px; padding: 14px; border-radius: 18px; color: #fff; border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); min-width: 0;
  background: radial-gradient(110% 90% at 0% 0%, rgba(225,35,46,.42), transparent 60%), radial-gradient(110% 90% at 100% 100%, rgba(29,78,216,.5), transparent 60%), var(--arena) }
.mini-link { display: grid; gap: 2px; text-decoration: none; color: inherit }
.mini-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; min-width: 0 }
.mh { font: 800 21px/1.1 var(--f-display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0 } .mh.w::before { content: "\u2605 "; color: var(--gold) }
.ms { font: 900 34px/1 var(--f-display); font-variant-numeric: tabular-nums } .a.mh, .a.ms { color: #ff5a66 } .b.mh, .b.ms { color: #8aa6ff }
.mvs { font: 700 12px/1 var(--f-mono); letter-spacing: .14em; color: rgba(255,255,255,.45) }
.mini-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid rgba(255,255,255,.14); padding-top: 10px; font: 500 14px/1.3 var(--f-mono); color: rgba(255,255,255,.72) }
.mini .rematch { flex: none; background: var(--red); color: #fff; border: 2px solid #fff !important; box-shadow: 3px 3px 0 #fff; padding: 7px 12px; font-size: 15px; font-weight: 700 }
.mini .rematch:active { transform: translate(3px, 3px); box-shadow: none }
@media (max-width: 760px) { .cs-list { grid-auto-flow: column; grid-template-columns: none; grid-auto-columns: 82%; overflow-x: auto; scroll-snap-type: x mandatory; padding: 2px 8px 10px 2px; margin-right: -16px; scrollbar-width: none } .cs-list::-webkit-scrollbar { display: none } .mini { scroll-snap-align: start } }
.hz-msg { margin: 0 0 12px; text-align: center; color: var(--muted) }
.rh-list { display: grid; gap: 10px }
details.rh { padding: 0; border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); border-radius: 14px; background: var(--surface) } details.rh + details.rh { margin-top: 0 }
details.rh > summary { padding: 13px 16px; align-items: center } details.rh > summary > span { display: flex; gap: 6px 12px; flex-wrap: wrap; align-items: baseline } details.rh small { color: var(--muted); font: 500 14px/1.2 var(--f-mono) }
details.rh .prospects { padding: 0 12px 12px; margin-top: 0 }
#huntOut { margin-bottom: 22px } #huntOut .prospects { margin-top: 0 }
/* ===== tease, then lock ===== */
.grid2.teased { position: relative; min-height: 520px }
.grid2.teased > .panel { filter: blur(6px); user-select: none; -webkit-user-select: none; pointer-events: none }
.lockcard { position: absolute; z-index: 3; top: 28px; left: 50%; transform: translateX(-50%); width: min(460px, calc(100% - 24px)); background: var(--surface); border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); border-radius: 22px; padding: 24px; display: grid; gap: 12px; text-align: center; justify-items: center }
.lockcard[hidden] { display: none !important }
.lockcard .eyebrow { color: var(--red) } .lockcard h3 { font-size: clamp(34px, 5vw, 46px); line-height: .95; margin: 0 }
.lockcard p { margin: 0; color: var(--muted); font-size: 16px } .lockcard p b { color: var(--ink) }
.lk-btns { display: grid; gap: 10px; width: 100%; margin-top: 4px } .lk-btns .btn { justify-content: center; width: 100% } .lockcard .btn.fight { font-size: 22px; padding: 15px }
.lk-fine { font: 600 14px/1 var(--f-mono) !important; letter-spacing: .1em; text-transform: uppercase }
@media (max-width: 560px) { .lockcard { top: 16px; padding: 20px 16px } }
.pc-vs i { font-style: normal } .pc-vs .ra { color: #ff5a66 } .pc-vs .rb { color: #8aa6ff }
/* ===== avatar menu ===== */
header.top .wrap { position: relative }
button.avatar { appearance: none; cursor: pointer; padding: 0 }
.avmenu { position: absolute; top: 56px; right: max(16px, env(safe-area-inset-right, 0px)); z-index: 30; min-width: 230px; background: var(--surface); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); border-radius: 16px; padding: 6px; display: grid }
.avmenu[hidden] { display: none !important }
.avmenu .who { padding: 10px 12px 10px; font: 500 15px/1.3 var(--f-body); color: var(--muted); border-bottom: 1px solid var(--line); margin-bottom: 4px; overflow-wrap: anywhere }
.avmenu .who b { display: block; color: var(--ink); font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 5px }
.avmenu a { padding: 12px; border-radius: 10px; text-decoration: none; font: 600 16px/1 var(--f-body); color: var(--ink) } .avmenu a:hover, .avmenu a:focus-visible { background: var(--bg) }
.avmenu a.out { color: var(--red); border-top: 1px solid var(--line); border-radius: 0 0 10px 10px; margin-top: 4px }
/* ===== footer ===== */
footer .fcopy { display: flex; gap: 8px 18px; flex-wrap: wrap } footer .fcopy a { text-decoration: none } footer .fcopy a:hover { color: var(--ink) }
footer .fdisc { margin-top: 8px; font-size: 14px; line-height: 1.5; max-width: 760px; margin-left: auto; margin-right: auto; color: var(--muted) }
@media (min-width: 1153px) { footer .fdisc { padding-left: 16px; padding-right: 16px; max-width: 1120px } }
/* ===== tools: first lines clear, rest locked ===== */
.gen-out { position: relative }
html:not([data-me]) .gen-out pre.out { min-height: 400px; overflow: hidden }
.gen-lock { position: absolute; left: 0; right: 0; top: 143px; bottom: 0; border-radius: 0 0 16px 16px; display: grid; place-items: center; padding: 16px; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); background: linear-gradient(180deg, rgba(13,16,23,.15), rgba(13,16,23,.55)) }
html[data-me] .gen-lock { display: none }
.gen-lock .lockcard { position: static; transform: none; width: min(340px, 100%); padding: 18px; box-shadow: 4px 4px 0 var(--ink); gap: 10px }
.gen-lock .lockcard h3 { font-size: 30px }
.gen-lock .lockcard .btn.fight { font-size: 19px; padding: 12px }

/* ===== big rivalries: guess-the-winner posters ===== */
#maincard .cat-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-inline: -4px; padding: 4px 4px 6px; scroll-snap-type: x proximity }
#maincard .cat-chips::-webkit-scrollbar { display: none }
#maincard .chip { flex: none; scroll-snap-align: start; min-height: 40px }
#maincard .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px }
@media (max-width: 1040px) { #maincard .cards { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
@media (max-width: 640px) {
  #maincard .cards { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; margin-inline: -16px; padding: 4px 16px 14px; scrollbar-width: none }
  #maincard .cards::-webkit-scrollbar { display: none }
  #maincard .pg { flex: 0 0 78%; scroll-snap-align: center }
  html.fights-page #maincard .cards { display: grid; grid-template-columns: 1fr; margin-inline: 0; padding: 0 }
}
.pg { position: relative; display: grid; gap: 14px; align-content: space-between; min-height: 212px; padding: 16px; border-radius: 20px; color: #fff; border: 2px solid var(--ink); box-shadow: 5px 5px 0 var(--ink);
  background: radial-gradient(90% 70% at 0% 100%, rgba(225,35,46,.28), transparent 60%), radial-gradient(90% 70% at 100% 0%, rgba(29,78,216,.34), transparent 60%), var(--arena) }
.pg.night { outline: 3px solid var(--gold); outline-offset: -5px }
.pg-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 600 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase }
.pg-cat { color: rgba(255,255,255,.6) } .pg-q { color: var(--gold) }
.pg-sides { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: 8px }
.pg-s { position: relative; min-width: 0; min-height: 76px; padding: 10px 6px; border-radius: 14px; cursor: pointer; font: 900 var(--fs, 26px)/.95 var(--f-display); text-transform: uppercase; overflow-wrap: normal; word-break: normal; hyphens: none; color: #fff; transition: transform .12s ease, background .15s ease, opacity .15s ease }
.pg-s.a { background: rgba(225,35,46,.16); border: 2px solid #ff4d5e; color: #ff6b79 }
.pg-s.b { background: rgba(29,78,216,.2); border: 2px solid #5b84ff; color: #8aa6ff }
.pg-s:not(:disabled):hover { transform: translateY(-2px) } .pg-s:not(:disabled):active { transform: scale(.97) }
.pg-s.a.mine { background: #E1232E; border-color: #fff; color: #fff } .pg-s.b.mine { background: #1D4ED8; border-color: #fff; color: #fff }
.pg-s.mine::after { content: "\u2713"; position: absolute; top: -9px; right: -9px; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: var(--gold); color: var(--ink); font: 800 15px/1 var(--f-body); border: 2px solid var(--ink) }
.pg.picked .pg-s:not(.mine) { opacity: .4 } .pg-s:disabled { cursor: default }
.pg-s:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px }
.pg-vs { align-self: center; font: 900 18px/1 var(--f-display); color: rgba(255,255,255,.45) }
.pg-res { display: grid; gap: 8px; min-height: 54px; align-content: end }
.pg-hint { font-size: 15px; color: rgba(255,255,255,.62) }
.pg-split { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,.1) }
.pg-split i { display: block; height: 100% } .pg-split .a { background: #ff4d5e } .pg-split .b { background: #5b84ff }
.pg.just .pg-split i { animation: grow .6s ease-out both } @keyframes grow { from { width: 0 } }
.pg-row { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; color: rgba(255,255,255,.7) }
.pg-row .ra { color: #ff6b79 } .pg-row .rb { color: #8aa6ff }
.pg-go { justify-self: start; color: var(--gold); font: 700 15px/1.2 var(--f-body); text-decoration: none; padding: 6px 0 } .pg-go:hover { text-decoration: underline }
#maincard .more { margin-top: 18px }

/* ===== Rivalry of the Night: fight broadcast ===== */
.night-card.bc { gap: 20px; padding: clamp(18px, 3vw, 28px) }
.bc-top { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font: 700 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase }
.bc-main { display: grid; grid-template-columns: 1.05fr 1fr; gap: clamp(18px, 3vw, 36px); align-items: center }
.bc-board { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 10px; text-align: center }
.bc-side { display: grid; gap: 2px; transition: opacity .2s } .bc-side.lost { opacity: .55 }
.bc-name { font: 800 clamp(24px, 3.2vw, 36px)/1 var(--f-display); text-transform: uppercase; overflow-wrap: anywhere }
.bc-score { font: 800 clamp(64px, 8.5vw, 108px)/.9 var(--f-display) }
.bc-side.a .bc-name, .bc-side.a .bc-score { color: #ff4d5e } .bc-side.b .bc-name, .bc-side.b .bc-score { color: #6b8fff }
.bc-belt { min-height: 22px; justify-self: center; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink); background: var(--gold); padding: 5px 9px; border-radius: 999px; margin-top: 6px }
.bc-belt:empty { background: none; padding: 0 }
.bc-mid { display: grid; gap: 8px; justify-items: center; padding-bottom: 30px } .bc-vs { font: 800 22px var(--f-display); color: rgba(255,255,255,.4) }
.bc-tally { font: 700 13px/1.35 var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--gold); text-align: center; max-width: 150px }
.bc-verdict { grid-column: 1 / -1; margin: 8px 0 0; font-size: 16px; color: rgba(255,255,255,.85) }
.bc-rounds { display: grid; gap: 14px }
.tg { display: grid; gap: 6px }
.tg-l { display: grid; grid-template-columns: 40px 1fr 40px; align-items: baseline }
.tg-n { text-align: center; font: 600 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.7) }
.tg-v { font: 800 20px/1 var(--f-display); opacity: .55 } .tg-v.a { color: #ff6b79 } .tg-v.b { color: #8aa6ff; text-align: right } .tg-v.w { opacity: 1 }
.tg-bar { position: relative; display: flex; height: 12px; border-radius: 99px; overflow: hidden; background: #5b84ff }
.tg-bar .a { display: block; height: 100%; background: #ff4d5e } .tg-bar .b { flex: 1 }
.tg-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: #fff; opacity: .85 }
.bc-h { display: block; margin-bottom: 10px; font: 700 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--gold) }
.ko-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px }
.ko { display: grid; gap: 6px; align-content: start; padding: 14px; border-radius: 14px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12) }
.ko-r { font: 600 12px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.5) }
.ko-l { font: 700 16px/1.2 var(--f-body) }
.ko-v { display: flex; align-items: center; gap: 0; font: 500 15px/1.3 var(--f-mono); color: rgba(255,255,255,.6); min-width: 0 } .ko-v.w { color: #fff; font-weight: 700 }
.ko-v em { font: 600 14px var(--f-body); font-style: normal; width: 76px; flex: none; color: rgba(255,255,255,.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ko-v .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: #f2c14e } .ko-v .dot.good { background: #22c55e } .ko-v .dot.bad { background: #ef4444 }
.ko p { margin: 4px 0 0; font-size: 15px; line-height: 1.4; color: rgba(255,255,255,.65) }
.bc-checks { display: grid; color: #fff; gap: 0; border-radius: 14px; background: rgba(255,255,255,.04); padding: 4px 14px 8px }
.nacc-head { display: grid; grid-template-columns: 1fr 150px 150px; gap: 10px; padding: 10px 0 4px; font: 700 13px/1 var(--f-mono); letter-spacing: .08em; text-transform: uppercase } .nacc-head .ra { color: #ff6b79 } .nacc-head .rb { color: #8aa6ff }
.nacc { background: none; box-shadow: none; border-radius: 0; padding: 0; margin: 0; border-top: 1px solid rgba(255,255,255,.1) } .nacc + .nacc { margin-top: 0 } .nacc:first-of-type { border-top: 0 } .nacc summary::after { content: none } .nacc[open] summary::after { content: none } .nacc-b { padding-bottom: 8px }
.nacc summary { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 46px; cursor: pointer; list-style: none }
.nacc summary::-webkit-details-marker { display: none }
.nacc summary::before { content: "\u25B8"; color: var(--gold); margin-right: 8px; transition: transform .15s } .nacc[open] summary::before { transform: rotate(90deg) }
.nacc-n { flex: 1; font: 800 18px/1 var(--f-display); text-transform: uppercase }
.nacc-t { font: 600 14px/1 var(--f-mono) } .nacc-t .ra { color: #ff6b79 } .nacc-t .rb { color: #8aa6ff }
.nacc-b .ncc-row { grid-template-columns: 1fr 150px 150px }
.bc-foot { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: center; justify-content: center }
.bc-all { min-height: 44px; padding: 0 18px; border-radius: 14px; border: 2px solid rgba(255,255,255,.35); background: transparent; color: #fff; font: 700 16px var(--f-body); cursor: pointer } .bc-all:hover { border-color: #fff }
.bc-full { color: rgba(255,255,255,.75); font-size: 15px }
@media (max-width: 860px) { .bc-main { grid-template-columns: 1fr } .ko-list { grid-template-columns: 1fr } }
@media (max-width: 640px) { .nacc-head, .nacc-b .ncc-row { grid-template-columns: 1fr 88px 88px; gap: 6px } .nacc-b .ncc-row { font-size: 14px } .bc-mid { padding-bottom: 26px } }
@media (prefers-reduced-motion: reduce) { .pg-s, .pg.just .pg-split i, .nacc summary::before { transition: none; animation: none } }

/* ===== footer ===== */
footer.site-foot { padding-block: 44px 40px }
footer.site-foot .ft-grid { display: grid; grid-template-columns: 1.6fr repeat(4, minmax(0, 1fr)); gap: 28px }
.ft-brand { display: grid; gap: 10px; align-content: start } .ft-brand .logo { justify-self: start; color: var(--ink); text-decoration: none }
.ft-tag { margin: 0; font-size: 15px }
.ft-cards { display: flex; flex-wrap: wrap; gap: 12px; align-items: center } .ft-cards .xlink { margin-top: 0 !important; text-decoration: none }
.ft-cards .tmrr { display: inline-flex; line-height: 0 } .ft-cards .tmrr img { width: 150px; height: auto }
.ft-col { display: grid; gap: 0; align-content: start } .ft-col b { color: var(--ink); font-size: 15px; margin-bottom: 6px }
.ft-col a { display: flex; align-items: center; min-height: 34px; text-decoration: none } .ft-col a:hover { color: var(--ink) }
footer.site-foot .ft-bar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 15px }
.ft-legal { display: inline-flex; gap: 8px; align-items: center } .ft-legal i { font-style: normal; opacity: .5 } .ft-legal a { text-decoration: none } .ft-legal a:hover { color: var(--ink) }
footer.site-foot .ft-disc { display: block; margin-top: 8px; font-size: 14px; opacity: .8 }
@media (max-width: 860px) { footer.site-foot .ft-grid { grid-template-columns: 1fr 1fr; gap: 22px 18px } .ft-brand { grid-column: 1 / -1 } }

/* night checks: clearly openable rounds */
.nacc-cap { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 12px 0 8px } .nacc-cap b { font: 800 20px/1 var(--f-display); text-transform: uppercase } .nacc-cap span { font-size: 15px; color: rgba(255,255,255,.65) }
.nacc summary { padding: 4px 8px; margin: 4px -8px; border-radius: 12px; transition: background .15s } .nacc summary:hover { background: rgba(255,255,255,.07) }
.nacc summary:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px }
.nacc-open { flex: none; display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: 999px; border: 1.5px solid var(--gold); color: var(--gold); font: 700 14px/1 var(--f-body); white-space: nowrap }
.nacc-open .o2 { display: none } .nacc[open] .nacc-open .o1 { display: none } .nacc[open] .nacc-open .o2 { display: inline } .nacc[open] .nacc-open { background: var(--gold); color: var(--ink) }
.nacc-t { margin-left: auto }
@media (max-width: 640px) { .nacc summary { flex-wrap: wrap; row-gap: 6px } .nacc-t { order: 3; width: 100%; margin-left: 26px } .nacc-open { margin-left: auto } }
.pg-hint b { color: var(--gold); font-weight: 700 }
.pg.nudge .pg-s { animation: nudge .5s ease 2 } @keyframes nudge { 50% { transform: translateY(-4px); box-shadow: 0 0 0 4px rgba(232,178,28,.55) } }
.modal .box { padding: 24px; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink) }
#suFields input { width: 100%; box-sizing: border-box; min-height: 52px }
#suForm .btn { width: 100%; box-sizing: border-box }
@media (prefers-reduced-motion: reduce) { .pg.nudge .pg-s { animation: none } }

.upsell .up.track { border-color: var(--blue); box-shadow: 0 18px 50px rgba(29,78,216,.18) } .upsell .up-tag.blue { background: var(--blue); color: #fff }
.upsell:has(> .up:not([hidden]):only-of-type), .upsell.one { grid-template-columns: 1fr }

/* checks table: keep labels visible, short winner tag */
#checks td:first-child { min-width: 130px }
#checks .edge { display: inline-block; max-width: 110px; overflow: hidden; text-overflow: ellipsis; vertical-align: middle }
#checks td.v { font-size: 14px }
/* AI strategy text */
.ai-out { white-space: normal } .ai-out h4 { font: 800 20px/1.1 var(--f-display); text-transform: uppercase; margin: 18px 0 6px } .ai-out h4:first-child { margin-top: 0 }
.ai-out p { margin: 0 0 10px; line-height: 1.6 } .ai-out ul, .ai-out ol { margin: 0 0 12px; padding-left: 22px; display: grid; gap: 6px } .ai-out code { font: 500 14px var(--f-mono) }

/* site icons */
.ico { display: inline-block; width: 1em; height: 1em; border-radius: 22%; object-fit: contain; background: #fff; padding: .08em; vertical-align: -0.12em; margin-right: .35em; flex: none }
.fighter .host { display: flex; align-items: center; gap: 10px } .fighter.b .host { justify-content: flex-end } .fighter .host .ico { width: 30px; height: 30px; margin: 0; box-shadow: 0 0 0 1px var(--line) }
.bc-name { display: flex; flex-direction: column; align-items: center; gap: 8px } .bc-name .ico { width: 36px; height: 36px; margin: 0; padding: 3px }
.pg-s { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px } .pg-s .ico { width: 28px; height: 28px; margin: 0; padding: 3px }
.mh .ico { width: 18px; height: 18px } .pr-top b .ico { width: 20px; height: 20px }

/* homepage showdown strip */
.sd-home { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px } @media (max-width: 900px) { .sd-home { grid-template-columns: 1fr } }
.sdh { display: grid; gap: 8px; padding: 16px; border-radius: 18px; border: 2px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); color: #fff; text-decoration: none; background: radial-gradient(90% 70% at 0% 100%, rgba(225,35,46,.25), transparent 60%), radial-gradient(90% 70% at 100% 0%, rgba(29,78,216,.3), transparent 60%), var(--arena) }
.sdh .kw { font: 700 14px/1.2 var(--f-mono); color: var(--gold) } .sdh .rw { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 800 24px/1 var(--f-display); text-transform: uppercase; opacity: .7 } .sdh .rw.lead { opacity: 1 } .sdh .rw .ico { width: 22px; height: 22px }
.sdh .ra { color: #ff6b79 } .sdh .rb { color: #8aa6ff } .sdh .ft { font-size: 14px; color: rgba(255,255,255,.7) }
</style>

<header class="top"><div class="wrap">
  <a class="logo" href="/" aria-label="SEO Fights home"><span>SEO</span><svg class="gloves" viewBox="4 0 64 40" aria-hidden="true"><defs><symbol id="glv" viewBox="0 0 40 40"><path d="M9 15.5C9 9 13.6 5 20.2 5h3.6C31 5 36 9.6 36 16.4v3.4c0 4.8-3.2 8.3-7.7 9.1L27 29v3.2H11.6v-4.6C9.9 26.1 9 23.8 9 21.2z"/><path d="M13.5 18.2c0-3.2 2.3-5.4 5.6-5.4h4.6" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2" stroke-linecap="round"/><rect x="10.6" y="31" width="17.4" height="6" rx="2"/><rect x="10.6" y="31" width="17.4" height="2" rx="1" fill="rgba(255,255,255,.35)"/></symbol></defs><g transform="rotate(-14 24 22)"><use href="#glv" width="40" height="40" fill="#E1232E"/></g><g transform="rotate(14 48 22)"><use href="#glv" x="-72" width="40" height="40" fill="#1D4ED8" transform="scale(-1,1)"/></g></svg><span>Fights</span></a>
  <nav class="links"><a href="/showdowns">Showdown</a><a href="/keywords-battle">Keyword Battle</a><a href="/tools">Free tools</a><a href="/agency">For agencies</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a></nav>
  <a class="btn sm" href="/#top">Start a fight</a>
</div></header>

<main id="top">
  <div class="wrap hero">
        <h1 class="display">__H1__</h1>
    <p class="lede">__LEDE__</p>
  </div>

  <section id="test"><div class="wrap hero test-wrap">
    <p class="test-yours" id="testYours">Now put your site in the ring</p>
    <div class="modes" id="modes" role="tablist" aria-label="What do you want to do?" hidden><button type="button" role="tab" data-mode="fight" aria-selected="true">Fight a site</button><button type="button" role="tab" data-mode="hunt" aria-selected="false">Hunt clients \u{1F3AF}<span class="ag-tag" id="agTag">Agency</span></button></div>
    <form class="ring" id="duelForm" novalidate>
      <div class="corner red"><label for="a">Red corner \xB7 You</label><input id="a" name="a" inputmode="url" autocomplete="off" placeholder="yoursite.com" value="__A__"></div>
      <div class="vs" aria-hidden="true">VS</div>
      <div class="corner blue"><label for="b">Blue corner \xB7 Rival</label><input id="b" name="b" inputmode="url" autocomplete="off" placeholder="rival.com" value="__B__"></div>
      <button class="btn fight" id="fightBtn" type="submit">Fight</button>
    </form>
    <form class="ring hunt" id="huntForm" novalidate hidden>
      <div class="corner red"><label for="hIndustry">Industry</label><input id="hIndustry" autocomplete="off" placeholder="Roofers"></div>
      <div class="vs" aria-hidden="true">IN</div>
      <div class="corner blue"><label for="hCity">City</label><input id="hCity" autocomplete="off" placeholder="Vancouver BC"></div>
      <div class="hunt-row"><div class="corner gold"><label for="hCountry">Country</label><select id="hCountry"><option value="us">United States</option><option value="ca">Canada</option><option value="gb">United Kingdom</option><option value="au">Australia</option><option value="nz">New Zealand</option><option value="ie">Ireland</option></select></div>
      <button class="btn fight" id="huntBtn" type="submit">Hunt clients</button></div>
    </form>
    <div class="ringside" id="ringside" hidden></div>
    <p class="rivals-q" id="rivalsQ">Don't know your rival? <button type="button" class="linkbtn" id="rivalBtn">Find SEO rivals for me</button></p>
    <div class="rival-list" id="rivalList" hidden></div>
    <div class="err" id="err" hidden></div>
    <div class="hunt-zone" id="huntZone" hidden>
      <p class="hz-msg" id="huntMsg" hidden></p>
      <div id="huntOut" hidden><div class="cs-head"><span class="eyebrow" id="huntTitle">Prospects</span><span class="muted" id="huntSub"></span></div><div class="prospects" id="huntList"></div></div>
      <div id="recentHunts" hidden><div class="cs-head"><span class="eyebrow">Recent hunts</span><a href="/agency">All your hunts \u2192</a></div><div class="rh-list" id="rhList"></div></div>
    </div>
    <div class="corner-strip" id="yourCorner" hidden><div class="cs-head"><span class="eyebrow">Your corner</span><a href="/account#fights">All your fights \u2192</a></div><div class="cs-list" id="csList"></div></div>
    <div class="proof"><span>31 live checks</span><span>Real page data, not estimates</span><span>Google + AI-ready checks</span></div>
  </div></section>

  <section id="night" hidden><div class="wrap">
    <div class="night-card bc" aria-labelledby="ncTitle">
      <div class="bc-top"><span class="nc-tag" id="ncTitle">\u{1F319} Rivalry of the Night \xB7 free</span><span class="nc-votes" id="ncVotes"></span></div>
      <div class="bc-main">
        <div class="bc-board">
          <div class="bc-side a" id="ncSideA"><span class="bc-name" id="ncA"></span><span class="bc-score" id="ncSA"></span><span class="bc-belt" id="ncBA"></span></div>
          <div class="bc-mid"><span class="bc-vs">VS</span><span class="bc-tally" id="ncTally"></span></div>
          <div class="bc-side b" id="ncSideB"><span class="bc-name" id="ncB"></span><span class="bc-score" id="ncSB"></span><span class="bc-belt" id="ncBB"></span></div>
          <p class="bc-verdict" id="ncVerdict"></p>
        </div>
        <div class="bc-rounds" id="ncRounds"></div>
      </div>
      <div class="bc-ko"><span class="bc-h">Knockout punches</span><div class="ko-list" id="ncKO"></div></div>
      <div class="bc-checks" id="ncChecks"></div>
      <div class="bc-foot"><a class="btn fight" id="ncMine" href="#test">Can your site beat them?</a><button type="button" class="bc-all" id="ncAll" aria-expanded="false">Open all 31 checks</button><a class="bc-full" id="ncFull" href="#">Full fight page \u2192</a></div>
    </div>
  </div></section>

  <section id="maincard"><div class="wrap">
    <div class="sec-head"><h2 class="display" id="mcTitle">Big rivalries</h2><span class="tag">Pick a winner, then see if you called it</span></div>
    <div class="cat-chips" id="catChips"></div>
    <div class="cards" id="cards"></div>
    <p class="more" id="mcMore"><a class="btn ghost" id="mcMoreBtn" href="/fights">See every fight</a></p>
  </div></section>

  <section id="fight"><div class="wrap" id="results">
    <div class="gate" id="gate" hidden>
      <span class="eyebrow">Who wins this fight?</span>
      <h2 class="display">Pick your champion</h2>
      <div class="picks"><button type="button" class="pick a" data-side="a" id="pickA"></button><span class="pvs">VS</span><button type="button" class="pick b" data-side="b" id="pickB"></button></div>
      <p class="gate-note" id="gateNote">Tap one to lock in your pick. Then see all 31 checks.</p>
      <button type="button" class="linkbtn" id="skipGate">Skip the pick</button>
    </div>

    <form class="gate unlock" id="unlock" hidden novalidate>
      <span class="eyebrow" id="unlockEyebrow">Result is ready</span>
      <h2 class="display">See who won</h2>
      <p class="gate-note" id="unlockNote">Sign up free to unlock this fight and every fight after it.</p>
      <div class="unlock-row"><input id="unlockEmail" type="email" autocomplete="email" placeholder="you@email.com" aria-label="Your email"><button class="btn fight" type="submit" id="unlockBtn">Show me</button></div>
      <a class="btn google" id="unlockGoogle" href="/auth/google" hidden><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.5-9.4 6.5-16.1z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2 20.4 2 24s1 6.9 2.5 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/></svg>Continue with Google</a>
      <p class="fine">Free account. No password, no card. By signing up you agree to the <a href="/terms">Terms</a>.</p>
    </form>

    <div class="sealed-wrap" id="sealed">
      <div class="verdict" id="verdict" hidden></div>
      <div class="upsell" id="upsell">
        <div class="panel up fixit" id="upFix">
          <span class="up-tag">Done for you</span>
          <h3 id="upFixTitle">Lost? We'll fix it for you</h3>
          <p class="sub" id="upFixText">A real person applies every fix on your site, then we re-run the fight to prove you won. Fixed price, quoted within 24 hours.</p>
          <button class="btn fight" type="button" data-lead="fix" id="upFixBtn">Fix my site for me</button>
        </div>
        <div class="panel up champ" id="upBadge">
          <span class="up-tag gold">Champion badge</span>
          <h3 id="upBadgeTitle">Won? Wear the belt</h3>
          <p class="sub">Put the winner badge on your site. Visitors see you won, and it links back to the fight.</p>
          <div class="badge-prev"><img id="badgeImg" alt="SEO Fights winner badge" width="280" height="72"></div>
          <pre class="code" id="badgeCode"></pre>
          <button class="btn sm" type="button" id="badgeCopy">Copy badge code</button>
        </div>
        <div class="panel up track" id="upTrack" hidden>
          <span class="up-tag blue">Pro</span>
          <h3 id="upTrackTitle">Track this rival every Monday</h3>
          <p class="sub" id="upTrackText">We re-run this fight every Monday and email you when the score moves. Plus AI strategy and Keyword Battle.</p>
          <a class="btn fight" href="/go/pro" id="upTrackBtn">Go Pro \xB7 $19/month</a>
        </div>
      </div>
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
        <p class="tape-verdict" id="tapeVerdict"></p>
        <div class="rounds" id="rounds"></div>
        <div class="tape-ko" id="tapeKO" hidden><span class="bc-h">Knockout punches</span><div class="ko-list" id="koList"></div></div>
        <div class="actions">
          <button class="btn" id="videoBtn" type="button">Make TikTok video</button>
          <button class="btn ghost" id="cardBtn" type="button">Fight card image</button>
          <a class="btn ghost" id="xBtn" href="#" target="_blank" rel="noopener">Post on X</a>
          <a class="btn fight" id="rematchBtn" href="/#top">Can your site beat them?</a>
          <button class="btn ghost" id="shareBtn" type="button">Copy link</button>
          <button class="btn ghost" id="copyBtn" type="button">Export fix list (.md)</button>
        </div>
      </div>

      <div class="grid2" id="fightGrid">
        <div class="lockcard" id="lockCard" hidden role="region" aria-labelledby="lkTitle">
          <span class="eyebrow" id="lkEyebrow">31 checks locked</span>
          <h3 class="display" id="lkTitle">See every check</h3>
          <p id="lkText"></p>
          <div class="lk-btns"><a class="btn google" id="lkGoogle" href="/auth/google" hidden><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.5-9.4 6.5-16.1z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2 20.4 2 24s1 6.9 2.5 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/></svg>Continue with Google</a><button class="btn fight" type="button" id="lkEmail">Email me a link</button></div>
          <p class="lk-fine">Free \xB7 no card</p>
        </div>
        <div class="panel">
          <h3>Every punch</h3>
          <p class="sub">Each check, side by side. The tag shows who took it.</p>
          <div class="tbl-wrap"><table id="checks"><thead><tr><th>Check</th><th id="thA">You</th><th id="thB">Rival</th><th></th></tr></thead><tbody></tbody></table></div>
        </div>
        <div class="panel">
          <h3>Comeback plan</h3>
          <p class="sub" id="planSub"></p>
          <ol class="plan" id="plan"></ol>
          <div class="agent"><p><b>AI strategy</b>A full game plan to beat this rival: what to fix, what to write, in what order. Pro, 4 per month.</p><button class="btn sm" type="button" id="aiBtn">Get AI strategy</button></div>
          <div class="ai-out" id="aiOut" hidden></div>
          <form class="watch" id="watchForm" novalidate><b>Monday movement reports</b><p>We re-run this fight every Monday and email you when the score moves. Pro.</p><button class="btn sm" type="submit">Watch this rival</button></form>
        </div>
      </div>

    </div>
  </div></section>

  __SUMMARY__

  <section id="showdowns" hidden><div class="wrap">
    <div class="sec-head"><h2 class="display">SEO Showdown</h2><span class="tag">2 sites \xB7 1 keyword \xB7 14 days on Google</span></div>
    <div class="sd-home" id="sdHome"></div>
    <p class="more"><a class="btn ghost" href="/showdowns">See every showdown</a></p>
  </div></section>

  <section id="why"><div class="wrap">
    <div class="sec-head"><h2 class="display">Built to win</h2></div>
    <div class="feats">
      <div class="feat hl"><div class="k">31</div><h3>Checks per site</h3><p>Title, headings, speed, schema, sitemap, share previews and more. Read live from the page, never guessed.</p></div>
      <div class="feat"><div class="k">AI</div><h3>AI-ready round</h3><p>Can ChatGPT, Claude and Perplexity read your site? We check AI crawler access, structured data and answer-ready content.</p></div>
      <div class="feat"><div class="k">9:16</div><h3>TikTok videos</h3><p>Every fight becomes a vertical video with the score count-up and knockout. Post it, tag your rival.</p></div>
      <div class="feat"><div class="k">+pts</div><h3>Ranked fixes</h3><p>Each fix shows how many points it wins you, so you do the biggest move first.</p></div>
      <div class="feat"><div class="k">10</div><h3>Keyword Battle</h3><p>Pick 10 keywords. See who ranks higher on Google for each one, in any country.</p></div>
      <div class="feat"><div class="k">$$</div><h3>Prospect Hunter</h3><p>For agencies: pick an industry and a city. Find businesses losing to competitors, with a pitch ready to send.</p></div>
    </div>

    <div class="panel" style="margin-top:20px">
      <h3>SEO Fights vs big SEO suites</h3>
      <div class="tbl-wrap"><table class="vs-table"><thead><tr><th>What you get</th><th>Big SEO suites</th><th>SEO Fights</th></tr></thead><tbody>
        <tr><td>Head-to-head fight with a clear winner</td><td>Rare</td><td>\u2713</td></tr>
        <tr><td>Fixes ranked by points, in plain English</td><td>Long audit lists</td><td>\u2713</td></tr>
        <tr><td>AI-ready round (can ChatGPT read you?)</td><td>Varies</td><td>\u2713</td></tr>
        <tr><td>Shareable fight page, TikTok video and winner badge</td><td>Rare</td><td>\u2713</td></tr>
        <tr><td>Pay once option</td><td>Rare</td><td>Lifetime from $__LIFEPRICE__</td></tr>
        <tr><td>Free plan</td><td>Limited or trial</td><td>1 fight a week</td></tr>
        <tr><td>Huge backlink and keyword databases</td><td>\u2713</td><td>Not our focus</td></tr>
      </tbody></table></div>
    </div>
  </div></section>

  <section id="pricing"><div class="wrap">
    <div class="sec-head"><h2 class="display">Pick your weight class</h2><span class="tag">Founding prices</span></div>
    <div class="prices">
      <div class="price"><h3>Free</h3><div class="amt">$0<small>forever</small></div>
        <ul><li>Free account, email only</li><li>1 fight per week</li><li>See every fight result</li><li>1 try of each tool a week</li><li>1 of 10 keywords in Keyword Battle</li></ul>
        <a class="btn ghost" id="freeBtn" href="/#test">Create free account</a></div>
      <div class="price pop"><span class="pill">Most picked</span><h3>Pro</h3><div class="amt">$19<small>/month</small></div>
        <ul><li>40 fights per month</li><li>AI strategy (4 per month)</li><li>4 Keyword Battles, all 10 keywords</li><li>Any country</li><li>Clean report export</li><li>Monday movement reports</li></ul>
        <a class="btn" href="__PRO__" data-lead="pro">Go Pro</a></div>
      <div class="price agency"><h3>Agency</h3><div class="amt">$99<small>/month</small></div>
        <ul><li>Prospect Hunter: 30 hunts a month, 6 prospects each</li><li>Ready-to-send pitch for each prospect</li><li>200 fights per month</li><li>20 Keyword Battles</li><li>All Pro features</li></ul>
        <a class="btn" href="__AGENCY__" data-lead="agency">Get Agency</a></div>
      <div class="price" style="position:relative"><span class="pill gold">\u{1F525} __LIFEN__</span><h3>Lifetime</h3><div class="amt">$__LIFEPRICE__<small>once</small></div>
        <ul><li>40 fights per month for the life of SEO Fights</li><li>Clean exports and all tools</li><li>Pay once, keep it</li><li>Keyword Battle and AI not included</li><li class="left">__LIFELEFT__</li></ul>
        <a class="btn ghost" href="__LIFE__" data-lead="lifetime">Get lifetime</a></div>
    </div>
    <p class="final">Secure checkout with Stripe. <b>All payments are final, no refunds.</b> Cancel a monthly plan any time and keep access until the end of the period. <a href="/terms">Terms</a></p>
  </div></section>

  <section id="faq"><div class="wrap" style="max-width:780px">
    <div class="sec-head"><h2 class="display">Ringside questions</h2></div>
    <details><summary>Where does the data come from?</summary><p>We load both homepages live, the same way a browser does, plus their robots.txt, sitemap and llms.txt. No third-party guesses, no made-up traffic numbers.</p></details>
    <details><summary>What is the AI-ready round?</summary><p>More people now ask ChatGPT, Claude and Perplexity instead of Google. This round checks if those AIs are allowed to read your site and if your page is easy for them to quote. It does not measure whether they actually recommend you yet.</p></details>
    <details><summary>Does a higher score mean I rank higher?</summary><p>It means your page does more of the things search engines and AIs reward. Rankings also depend on links and brand, which no honest tool can promise.</p></details>
    <details><summary>Why only 1 free fight a week?</summary><p>Every fight loads both sites live. One a week lets you try it properly. Pro gives you 40 a month, AI strategy and Keyword Battles.</p></details>
    <details><summary>Why can't I fight some big brands?</summary><p>Some big sites block robots completely. We tell you instead of showing a fake score.</p></details>
    <details><summary>How do I use the report?</summary><p>Export it and paste it into Claude Code, Cursor or ChatGPT. Ask it to apply every fix to your site.</p></details>
  </div></section>
</main>

<footer class="site-foot"><div class="wrap ft-grid">
<div class="ft-brand">
  <a class="logo" href="/" aria-label="SEO Fights home"><span>SEO</span><svg class="gloves" viewBox="4 0 64 40" aria-hidden="true"><g transform="rotate(-14 24 22)"><use href="#glv" width="40" height="40" fill="#E1232E"/></g><g transform="rotate(14 48 22)"><use href="#glv" x="-72" width="40" height="40" fill="#1D4ED8" transform="scale(-1,1)"/></g></svg><span>Fights</span></a>
  <p class="ft-tag">Put your site in the ring.</p>
  <div class="ft-cards">
    <a class="xlink" href="https://x.com/kas_irani" target="_blank" rel="noopener"><img src="/kas.jpg" alt="Kas, founder of SEO Fights" width="40" height="40" loading="lazy" onerror="this.style.display='none'"><span><b>Made by Kas</b><small>\u{1D54F} @kas_irani \xB7 building in public</small></span></a>
    <a class="tmrr" href="https://trustmrr.com/startup/seo-fights" target="_blank" rel="noopener"><img src="https://trustmrr.com/api/embed/seo-fights?format=svg&amp;theme=light" alt="TrustMRR verified revenue badge" width="180" height="74" loading="lazy"></a>
  </div>
</div>
<nav class="ft-col" aria-label="Product"><b>Product</b><a href="/#test">Start a fight</a><a href="/fights">Biggest fights</a><a href="/showdowns">SEO Showdown</a><a href="/keywords-battle">Keyword Battle</a><a href="/agency">For agencies</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a></nav>
<nav class="ft-col" aria-label="Free tools"><b>Free tools</b><a href="/tools/broken-link-checker">Broken link checker</a><a href="/tools/robots-txt-generator">Robots.txt generator</a><a href="/tools/schema-markup-generator">Schema generator</a><a href="/tools/llms-txt-generator">llms.txt generator</a><a href="/tools">All tools</a></nav>
<nav class="ft-col" aria-label="Compare"><b>Compare</b><a href="/alternatives/ahrefs-alternative">Ahrefs alternative</a><a href="/alternatives/semrush-alternative">Semrush alternative</a><a href="/alternatives/moz-alternative">Moz alternative</a><a href="/alternatives/ubersuggest-alternative">Ubersuggest alternative</a><a href="/tools-like">More \u2192</a></nav>
<nav class="ft-col" aria-label="Company"><b>Company</b><a href="/about">About</a><a href="/contact">Contact</a><a href="/remove">Remove my site</a><a href="/account" data-acct>Sign in</a></nav>
</div>
<div class="wrap ft-bar"><span>\xA9 2026 SEO Fights \xB7 Vancouver, BC</span><span class="ft-legal"><a href="/terms">Terms</a><i aria-hidden="true">\xB7</i><a href="/privacy">Privacy</a><i aria-hidden="true">\xB7</i><a href="/cookie-policy">Cookies</a></span></div>
<p class="wrap ft-disc">Not affiliated with any brand shown. Brand names belong to their owners. Scores are automated estimates, not ranking guarantees.</p>
</footer>


<div class="modal" id="modal" hidden>
  <div class="box">
    <canvas id="card" width="1080" height="1920" aria-label="Fight card"></canvas>
    <video id="vid" playsinline controls loop hidden></video>
    <p class="rec" id="recNote" hidden>Recording your video\u2026</p>
    <div class="row"><button class="btn" id="dlBtn" type="button">Save</button><button class="btn ghost" id="closeBtn" type="button">Close</button></div>
  </div>
</div>

<div class="modal" id="leadModal" hidden>
  <form class="box lead" id="leadForm" novalidate>
    <span class="eyebrow" id="leadEyebrow">Founding member</span>
    <h3 class="display" id="leadTitle">Get Pro</h3>
    <p id="leadText"></p>
    <input id="leadEmail" type="email" autocomplete="email" placeholder="you@email.com" aria-label="Your email">
    <input id="leadSite" inputmode="url" autocomplete="url" placeholder="Your website (optional)" aria-label="Your website">
    <button class="btn fight" type="submit" id="leadBtn">Lock my spot</button>
    <button class="linkbtn" type="button" id="leadClose">Not now</button>
  </form>
</div>
<div class="toast" id="toast" hidden></div>
<div class="modal" id="suModal" hidden role="dialog" aria-modal="true" aria-labelledby="suTitle">
  <form class="box lead" id="suForm" novalidate>
    <span class="eyebrow" id="suEyebrow">Free account</span>
    <h3 class="display" id="suTitle">Sign up to use this</h3>
    <p id="suText">Takes 5 seconds. No password, no card.</p>
    <a class="btn google" id="suGoogle" href="/auth/google" hidden><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.5-9.4 6.5-16.1z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2 20.4 2 24s1 6.9 2.5 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/></svg>Continue with Google</a>
    <div id="suFields"><input id="suEmail" type="email" autocomplete="email" placeholder="you@email.com" aria-label="Your email"></div>
    <button class="btn fight" type="submit" id="suBtn">Create free account</button>
    <a class="btn fight" id="suPro" href="/go/pro" hidden>Go Pro \xB7 $19/month</a>
    <p class="muted" id="suFine" style="font-size:13px;margin:0">Already paid? <a href="/account">Get your access link</a>. By signing up you agree to the <a href="/terms">Terms</a>.</p>
    <button class="linkbtn" type="button" id="suClose">Not now</button>
  </form>
</div>
<script>
(() => {
  const q = s => document.querySelector(s);
  window.ME = null; window.AUTH = {};
  window.meReady = fetch("/api/me" + (location.pathname === "/" ? "?home=1" : ""), { credentials: "same-origin" }).then(r => r.json()).then(j => { window.AUTH = (j && j.auth) || {}; return (window.ME = j && j.plan ? j : null); }).catch(() => null);
  // Signed in: the header keeps a red "Start a fight" button (to the form) and gets a round avatar that opens the account page.
  const meHeader = () => {
    if (!window.ME) return;
    document.querySelectorAll("header.top .wrap").forEach(w => {
      const b = w.querySelector(":scope > .btn.sm");
      if (b) {
        b.textContent = "Start a fight"; b.classList.add("hdr-fight");
        const home = location.pathname === "/" && document.getElementById("duelForm");
        b.href = home ? "#test" : "/#test";
        if (home && !b.dataset.bound) { b.dataset.bound = 1; b.addEventListener("click", e => { e.preventDefault(); const f = document.getElementById("huntForm"); if (f && !f.hidden && window.setMode) setMode("fight", true); document.getElementById("test").scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => { const a = document.getElementById(document.getElementById("a").value ? "b" : "a"); a && a.focus({ preventScroll: true }); }, 450); }); }
      }
      if (!w.querySelector(".avatar")) {
        const em = String(window.ME.email || "?"), av = document.createElement("button"), menu = document.createElement("div");
        av.type = "button"; av.className = "avatar"; av.textContent = (em.trim()[0] || "?").toUpperCase();
        av.setAttribute("aria-label", "Account menu (" + em + ")"); av.setAttribute("aria-haspopup", "menu"); av.setAttribute("aria-expanded", "false");
        menu.className = "avmenu"; menu.hidden = true; menu.setAttribute("role", "menu");
        const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
        menu.innerHTML = \`<div class="who"><b>\${esc(window.ME.name || "Free")} plan</b>\${esc(em)}</div><a role="menuitem" href="/account">Account</a>\${window.ME.plan === "owner" ? '<a role="menuitem" href="/admin">\u{1F4CA} Stats</a>' : ""}<a role="menuitem" href="/account#billing">\${window.ME.plan === "pro" || window.ME.plan === "agency" ? "Billing / cancel plan" : "Billing"}</a><a role="menuitem" href="/account#settings">Emails and data</a><a role="menuitem" class="out" href="/logout">Sign out</a>\`;
        const close = () => { menu.hidden = true; av.setAttribute("aria-expanded", "false"); };
        av.addEventListener("click", e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; av.setAttribute("aria-expanded", String(open)); if (open) menu.querySelector("a").focus(); });
        document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) close(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { close(); av.focus(); } });
        w.appendChild(av); w.appendChild(menu);
      }
    });
    // Footer: a clear Sign out next to Account.
    document.querySelectorAll("footer a[data-acct]").forEach(a => { a.textContent = "Account"; if (!a.nextElementSibling || !a.nextElementSibling.matches("[data-out]")) a.insertAdjacentHTML("afterend", '<a href="/logout" data-out>Sign out</a>'); });
  };
  window.dashBtn = meHeader; window.meReady.then(meHeader);
  let next = null, nextUrl = null;
  const open = (mode, title, text) => {
    const pay = mode === "pay";
    q("#suEyebrow").textContent = pay ? "Out of free tries" : "Free account";
    q("#suTitle").textContent = title; q("#suText").textContent = text;
    q("#suFields").hidden = pay; q("#suBtn").hidden = pay; q("#suFine").hidden = pay; q("#suPro").hidden = !pay;
    const g = q("#suGoogle"); g.hidden = pay || !(window.AUTH && window.AUTH.google); g.href = "/auth/google?next=" + encodeURIComponent(nextUrl || location.pathname + location.search);
    q("#suBtn").textContent = window.AUTH && window.AUTH.link ? "Email me a sign-in link" : "Create free account";
    q("#suModal").hidden = false; if (!pay) setTimeout(() => q("#suEmail").focus(), 50);
  };
  // Run \`fn\` only for signed-in people; everyone else gets the sign-up box first.
  window.withAccount = async (fn, title, text, url) => {
    await window.meReady;
    if (window.ME) { fn && fn(); return; }
    next = fn; nextUrl = url || null; open("signup", title || "Sign up to use this", text || "Free account: see every fight result, 1 fight a week and 1 try of each tool a week. Takes 5 seconds.");
  };
  // Free tries used up: push to Pro.
  window.paywall = (msg, plan) => {
    const ag = plan === "agency", b = q("#suPro"); b.href = ag ? "/go/agency" : "/go/pro"; b.textContent = ag ? "Go Agency \xB7 $99/month" : "Go Pro \xB7 $19/month";
    open("pay", ag ? "Unlock Prospect Hunter" : "Go Pro to keep going", msg || "You've used your free tries this week. Pro gives you 40 fights a month and every tool.");
    if (ag) q("#suEyebrow").textContent = "Agency plan";
  };
  // Read an API response: true if it worked, opens the right box if not.
  window.gateCheck = async (r) => {
    if (r.status === 401) { window.ME = null; open("signup", "Sign up to use this", "Free account: see every fight result, 1 fight a week and 1 try of each tool a week."); return false; }
    if (r.status === 402 || r.status === 429) { let m = ""; try { m = (await r.clone().json()).error; } catch {} window.paywall(m); return false; }
    return true;
  };
  q("#suClose").addEventListener("click", () => { q("#suModal").hidden = true; next = null; });
  q("#suModal").addEventListener("click", e => { if (e.target.id === "suModal") { q("#suModal").hidden = true; next = null; } });
  q("#suForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = q("#suEmail").value.trim(), btn = q("#suBtn");
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) { q("#suText").textContent = "Enter a valid email."; return; }
    btn.disabled = true; btn.textContent = "Creating\u2026";
    try {
      const r = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, next: nextUrl || location.pathname + location.search }) });
      const j = await r.json();
      if (!r.ok) { q("#suText").textContent = j.error || "Try again."; return; }
      if (j.sent) { q("#suEyebrow").textContent = "Almost there"; q("#suTitle").textContent = "Check your inbox \u{1F4EC}"; q("#suText").textContent = \`We sent a sign-in link to \${email}. Tap it and you're in.\`; q("#suFields").hidden = true; q("#suBtn").hidden = true; q("#suGoogle").hidden = true; return; }
      window.ME = j; meHeader(); try { localStorage.setItem("fan", email); } catch {}
      q("#suModal").hidden = true; const f = next; next = null; f && f();
    } catch { q("#suText").textContent = "Try again."; }
    finally { btn.disabled = false; btn.textContent = window.AUTH && window.AUTH.link ? "Email me a sign-in link" : "Create free account"; }
  });
})();
</script>


<script>
const VIEW = document.documentElement.dataset.view;
const DEMO = __DATA__;
const LIVE = __LIVE__;
const CARDS = __CARDS__;
const CATS = [["onpage","Round 1","On-page"],["content","Round 2","Content"],["technical","Round 3","Technical"],["ai","Round 4","AI-ready"],["social","Round 5","Social"]];
const NEW_IDS = new Set(["aibots","llms","entity","faq","ttfb","size","compress","redirects","hsts","canonical","lang","external","ogdesc","twitter","favicon","robots","headings"]);
let D = DEMO;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const FOTN = "__FOTN__", NIGHT = __NIGHT__;
// Small, safe markdown for AI text: headings, bold, lists, paragraphs. Everything is escaped first.
function mdLite(t) {
  const lines = esc(String(t || "")).replace(/\\r/g, "").split("\\n"), out = []; let list = null;
  const inline = x => x.replace(/\\*\\*(.+?)\\*\\*/g, "<b>$1</b>").replace(/\`([^\`]+)\`/g, "<code>$1</code>");
  const close = () => { if (list) { out.push(\`</\${list}>\`); list = null; } };
  for (const raw of lines) {
    const l = raw.trim(); let m;
    if (!l) { close(); continue; }
    if ((m = l.match(/^#{1,6}\\s+(.*)$/))) { close(); out.push(\`<h4>\${inline(m[1])}</h4>\`); continue; }
    if ((m = l.match(/^[-*\u2022]\\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(\`<li>\${inline(m[1])}</li>\`); continue; }
    if ((m = l.match(/^\\d+[.)]\\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(\`<li>\${inline(m[1])}</li>\`); continue; }
    close(); out.push(\`<p>\${inline(l)}</p>\`);
  }
  close(); return out.join("");
}
function personalizeUpsell(pick) {
  const own = store.get("pick:" + D.slug) === "own" || new URLSearchParams(location.search).get("r") === "1";
  const fix = $("#upFix"), belt = $("#upBadge");
  if (!own) { // watching a brand fight: sell the same thing for their own site
    $("#upFixTitle").textContent = "Want this for your site?";
    $("#upFixText").textContent = "We fight your site against your biggest rival, then a real person fixes everything you lose on. Fixed price, quoted within 24 hours.";
    $("#upFixBtn").textContent = "Fix my site for me";
    $("#upBadgeTitle").textContent = \`\${brandName(D.winner ? D[D.winner].host : D.a.host)} wears the belt\`;
    fix.classList.add("first"); return;
  }
  const lost = D.winner === "b", gap = Math.abs(D.a.score - D.b.score), n = (D.plan || []).length;
  if (lost) {
    $("#upFixTitle").textContent = \`You lost by \${gap}. We'll fix all \${n} problems.\`;
    $("#upFixText").textContent = \`A real person fixes your site, then we re-run the fight against \${brandName(D.b.host)} to prove you won. Fixed price, quoted within 24 hours.\`;
    $("#upFixBtn").textContent = \`Beat \${brandName(D.b.host)} for me\`;
    fix.classList.add("first"); belt.hidden = true;
    const tr = $("#upTrack"); if (tr && !(window.ME && ["pro", "agency", "owner", "lifetime"].includes(ME.plan))) { tr.hidden = false; $("#upTrackTitle").textContent = \`Catch \${brandName(D.b.host)}. Track them every Monday\`; }
  } else {
    $("#upBadgeTitle").textContent = D.winner ? \`You won \u{1F3C6} Wear the belt\` : "Dead even. Break the tie?";
    $("#upFixTitle").textContent = n ? \`Win by more. \${n} fixes left.\` : "Defend the belt";
    $("#upFixText").textContent = "Rivals catch up. A real person applies every remaining fix so they can't. Fixed price, quoted within 24 hours.";
    belt.classList.add("first");
  }
  const up = $("#upsell"); if (up) up.classList.toggle("one", [...up.children].filter(x => !x.hidden).length === 1);
}
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const site = /claude|localhost/.test(location.host) ? "seofights.com" : location.host.replace(/^www\\./, "");
const ico = (h, c = "") => h ? \`<img class="ico \${c}" src="/icon/\${encodeURIComponent(String(h).replace(/^www\\./, ""))}" alt="" width="64" height="64" loading="lazy" decoding="async" onerror="this.remove()">\` : "";
const pretty = h => h.replace(/\\.(com|co|io|org|net|app)$/i, "");

function countUp(el, to) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 1100;
  const step = t => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
  el.textContent = 0; requestAnimationFrame(step);
}

function render(d, live, keepLabel) {
  if (!keepLabel) $("#modeTag").textContent = live ? "Live result" : "Example fight";
  $("#hostA").innerHTML = ico(d.a.host) + \`<span>\${esc(d.a.host)}</span>\`; $("#hostB").innerHTML = ico(d.b.host) + \`<span>\${esc(d.b.host)}</span>\`;
  $("#thA").textContent = d.a.host; $("#thB").textContent = d.b.host;
  countUp($("#scoreA"), d.a.score); countUp($("#scoreB"), d.b.score);
  const belt = '<span class="belt">\u2605 Winner</span>';
  $("#beltA").innerHTML = d.winner === "a" ? belt : ""; $("#beltB").innerHTML = d.winner === "b" ? belt : "";
  const roundsA = CATS.filter(([k]) => d.a.scores[k] > d.b.scores[k]).length, roundsB = CATS.filter(([k]) => d.b.scores[k] > d.a.scores[k]).length;
  { const t = 5 - roundsA - roundsB, lead = roundsA > roundsB ? "a" : roundsB > roundsA ? "b" : null, nm = h => esc(brandName(h));
    $("#center").innerHTML = lead ? \`\${Math.max(roundsA, roundsB)} of 5<small>rounds to \${nm(d[lead].host)}\${t ? \` \xB7 \${t} tied\` : ""}</small>\` : \`\${roundsA} each<small>rounds split\${t ? \` \xB7 \${t} tied\` : ""}</small>\`; }
  $("#rounds").innerHTML = CATS.map(([k, r, n]) => {
    const a = d.a.scores[k] ?? 0, b = d.b.scores[k] ?? 0;
    return \`<div class="round"><div class="val a \${a > b ? "won" : ""}"><div class="bar a"><i style="width:\${a}%"></i></div>\${a}</div><div class="name"><small>\${r}</small>\${n}</div><div class="val b \${b > a ? "won" : ""}"><div class="bar b"><i style="width:\${b}%"></i></div>\${b}</div></div>\`;
  }).join("");
  const T = d.tease;
  document.documentElement.toggleAttribute("data-teaser", !!T);
  $("#fightGrid").classList.toggle("teased", !!T); $("#lockCard").hidden = !T; if ($("#upsell")) $("#upsell").hidden = !!T;
  if (T) { renderTeaser(d); } else {
  let html = "", last = "";
  for (const row of d.rows) {
    if (row.cat !== last) { last = row.cat; html += \`<tr class="cat"><td colspan="4">\${CATS.find(c => c[0] === row.cat)[2]}</td></tr>\`; }
    const edge = row.edge === "a" ? \`<span class="edge a" title="\${esc(d.a.host)} takes it">\${esc(brandName(d.a.host))}</span>\` : row.edge === "b" ? \`<span class="edge b" title="\${esc(d.b.host)} takes it">\${esc(brandName(d.b.host))}</span>\` : "";
    html += \`<tr><td>\${esc(row.label)}\${NEW_IDS.has(row.id) ? '<span class="new">NEW</span>' : ""}</td><td class="v"><span class="dot \${row.a.status}"></span>\${esc(row.a.value)}</td><td class="v"><span class="dot \${row.b ? row.b.status : "warn"}"></span>\${esc(row.b ? row.b.value : "\u2014")}</td><td>\${edge}</td></tr>\`;
  }
  $("#checks tbody").innerHTML = html;
  const top = d.plan.slice(0, 6), total = d.plan.reduce((s, p) => s + p.gain, 0);
  $("#planSub").textContent = d.plan.length ? \`\${d.plan.length} moves for \${d.a.host}. Do all of them for up to +\${total} points.\` : \`\${d.a.host} is flawless. Defend the belt.\`;
  $("#plan").innerHTML = top.map(p => \`<li><span class="sev \${p.status}">\${p.status === "bad" ? "Critical" : "Improve"}</span><div><b>\${esc(p.label)}</b><p>\${esc(p.fix)}</p></div><span class="gain">+\${p.gain}</span></li>\`).join("");
  }
  // share + badge
  const url = \`\${location.origin}/fight/\${d.slug}\`;
  const w = d.winner ? d[d.winner].host : null;
  const A = brandName(d.a.host), B = brandName(d.b.host), hi = Math.max(d.a.score, d.b.score), lo = Math.min(d.a.score, d.b.score);
  const W = d.winner ? brandName(d[d.winner].host) : null, L = d.winner ? brandName(d[d.winner === "a" ? "b" : "a"].host) : null;
  const tags = [d.a.host, d.b.host].map(h => HANDLES[h.replace(/^www\\./, "")]).filter(Boolean).map(h => "@" + h).join(" ");
  const post = W
    ? \`\${A} vs \${B} \u{1F94A}\\nWho has better SEO?\\n\\n\u{1F3C6} \${W} wins \${hi}\u2013\${lo}\\n\${L} lost \${T ? T.lost : d.rows.filter(r => r.edge === d.winner).length} checks\\n\\n\${tags ? tags + " rematch? \u{1F440}\\n\\n" : ""}Fight your rival \u{1F447}\`
    : \`\${A} vs \${B} \u{1F94A}\\nWho has better SEO?\\n\\nDead even, \${hi}\u2013\${lo}. Nobody wins.\\n\\n\${tags ? tags + " tiebreaker? \u{1F440}\\n\\n" : ""}Fight your rival \u{1F447}\`;
  $("#xBtn").href = \`https://x.com/intent/post?text=\${encodeURIComponent(post + "\\n")}&url=\${encodeURIComponent(url)}&via=kas_irani\`;
  SHARE_TEXT = W ? \`\${A} vs \${B}: \${W} wins the SEO fight \${hi}\u2013\${lo} \u{1F94A} Can your site beat \${W}?\` : \`\${A} vs \${B}: dead even on SEO \u{1F94A} Who breaks the tie?\`;
  const rm = $("#rematchBtn"); if (rm) { const champ = d.winner ? d[d.winner].host : d.b.host; rm.href = \`/?b=\${encodeURIComponent(champ)}#top\`; rm.textContent = \`Can your site beat \${brandName(champ)}?\`; }
  const winner = d.winner ? d[d.winner].host : d.a.host;
  $("#badgeImg").src = \`/badge/\${d.slug}.svg\`;
  $("#badgeCode").textContent = \`<a href="\${url}"><img src="\${location.origin}/badge/\${d.slug}.svg" alt="\${winner} won the SEO Fights" width="280" height="72"></a>\`;
}

// Signed-out view: placeholder rows only (the real checks never reach the browser), plus the lock card.
const FAKE_ROWS = [["onpage", "Placeholder check"], ["onpage", "Locked check"], ["onpage", "Sample check row"], ["content", "Locked check"], ["content", "Placeholder check"], ["technical", "Sample check row"], ["technical", "Locked check"], ["technical", "Placeholder check"], ["ai", "Locked check"], ["ai", "Sample check row"], ["social", "Placeholder check"], ["social", "Locked check"]];
function renderTeaser(d) {
  const T = d.tease, dots = ["good", "warn", "bad"];
  let html = "", last = "";
  FAKE_ROWS.forEach(([cat, label], i) => {
    if (cat !== last) { last = cat; html += \`<tr class="cat"><td colspan="4">\${CATS.find(c => c[0] === cat)[2]}</td></tr>\`; }
    html += \`<tr><td>\${label}</td><td class="v"><span class="dot \${dots[i % 3]}"></span>00 items</td><td class="v"><span class="dot \${dots[(i + 1) % 3]}"></span>00 items</td><td><span class="edge \${i % 2 ? "b" : "a"}">Locked</span></td></tr>\`;
  });
  $("#checks tbody").innerHTML = html;
  $("#planSub").textContent = "Your fix list, ranked by points.";
  $("#plan").innerHTML = [1, 2, 3, 4].map(i => \`<li><span class="sev \${i < 3 ? "bad" : "warn"}">\${i < 3 ? "Critical" : "Improve"}</span><div><b>Locked fix number \${i}</b><p>Sign up free to see this fix and how to do it.</p></div><span class="gain">+0</span></li>\`).join("");
  const own = store.get("pick:" + d.slug) === "own" || new URLSearchParams(location.search).get("r") === "1";
  const pl = (n, w) => \`\${n} \${w}\${n === 1 ? "" : /x$/.test(w) ? "es" : "s"}\`, n = T.checks, fx = T.fixes, m = T.margin;
  const fixLine = fx ? \`\${pl(fx, "fix")} would win it back (+\${T.pts} pts).\` : "";
  let title, text;
  if (!d.winner) { title = "Dead even."; text = fx ? \`\${pl(fx, "fix")} would break the tie (+\${T.pts} pts). See all \${n} checks.\` : \`See all \${n} checks.\`; }
  else if (own && d.winner === "b") { title = \`You lost by \${pl(m, "point")}.\`; text = fixLine ? \`<b>\${fixLine}</b> See all \${n} checks and the fix list.\` : \`See all \${n} checks and the fix list.\`; }
  else if (own) { title = \`You won by \${m}.\`; text = \`See the \${n} checks and the fixes your rival could use to beat you.\`; }
  else { const W = brandName(d[d.winner].host), L = brandName(d[T.loser].host); title = \`\${W} wins by \${m}.\`; text = fx ? \`<b>\${pl(fx, "fix")} would win it back for \${esc(L)} (+\${T.pts} pts).</b> See all \${n} checks and the fix list.\` : \`See all \${n} checks and the fix list.\`; }
  $("#lkEyebrow").textContent = \`\${n} checks locked\`; $("#lkTitle").textContent = title; $("#lkText").innerHTML = text;
  const g = $("#lkGoogle"); g.hidden = !(window.AUTH && AUTH.google); g.href = "/auth/google?next=" + encodeURIComponent(location.pathname + location.search);
  $("#lkEmail").textContent = window.AUTH && AUTH.link ? "Email me a link" : "Sign up free";
}
const NAMES = { "coca-cola.com": "Coca-Cola", "hm.com": "H&M", "bankofamerica.com": "Bank of America", "open.spotify.com": "Spotify", "mint.intuit.com": "Mint", "turbotax.intuit.com": "TurboTax", "primevideo.com": "Prime Video", "disneyplus.com": "Disney+", "dunkindonuts.com": "Dunkin'", "pizzahut.com": "Pizza Hut", "burgerking.com": "Burger King", "jimmyjohns.com": "Jimmy John's", "ubereats.com": "Uber Eats", "doordash.com": "DoorDash", "hellofresh.com": "HelloFresh", "blueapron.com": "Blue Apron", "timhortons.ca": "Tim Hortons", "starbucks.ca": "Starbucks", "redbull.com": "Red Bull", "monsterenergy.com": "Monster", "rayban.com": "Ray-Ban", "bestbuy.com": "Best Buy", "homedepot.com": "Home Depot", "chess.com": "Chess.com", "x.com": "X", "mercedes-benz.com": "Mercedes-Benz", "se-ranking.com": "SE Ranking", "openai.com": "OpenAI", "github.com": "GitHub", "gitlab.com": "GitLab", "hubspot.com": "HubSpot", "linkedin.com": "LinkedIn", "youtube.com": "YouTube", "tiktok.com": "TikTok", "paypal.com": "PayPal", "playstation.com": "PlayStation", "steampowered.com": "Steam", "epicgames.com": "Epic Games", "chatgpt.com": "ChatGPT", "perplexity.ai": "Perplexity", "huggingface.co": "Hugging Face", "elevenlabs.io": "ElevenLabs", "runwayml.com": "Runway", "character.ai": "Character.AI", "copy.ai": "Copy.ai", "jasper.ai": "Jasper", "leonardo.ai": "Leonardo", "bolt.new": "Bolt", "lovable.dev": "Lovable", "linear.app": "Linear", "zoom.us": "Zoom", "obsidian.md": "Obsidian", "wordpress.com": "WordPress", "godaddy.com": "GoDaddy", "squarespace.com": "Squarespace", "mailchimp.com": "Mailchimp", "convertkit.com": "Kit", "khanacademy.org": "Khan Academy", "masterclass.com": "MasterClass", "nerdwallet.com": "NerdWallet", "creditkarma.com": "Credit Karma", "hrblock.com": "H&R Block", "simplisafe.com": "SimpliSafe", "sharkclean.com": "Shark", "dollarshaveclub.com": "Dollar Shave Club", "fentybeauty.com": "Fenty Beauty", "myfitnesspal.com": "MyFitnessPal", "aircanada.com": "Air Canada", "westjet.com": "WestJet", "carmax.com": "CarMax", "wealthsimple.com": "Wealthsimple", "soundcloud.com": "SoundCloud", "lg.com": "LG", "hp.com": "HP", "kfc.com": "KFC", "bmw.com": "BMW", "ikea.com": "IKEA", "on.com": "On", "vrbo.com": "Vrbo", "ynab.com": "YNAB", "asus.com": "ASUS", "ebay.com": "eBay" };
function brandName(h) { h = String(h || "").replace(/^www\\./, ""); if (NAMES[h]) return NAMES[h]; const base = h.split(".").length > 2 && !/\\.(co|com)\\.[a-z]{2}$/.test(h) ? h.split(".").slice(-2)[0] : h.split(".")[0]; return base.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "); }
const HANDLES = { "apple.com": "Apple", "samsung.com": "Samsung", "google.com": "Google", "bing.com": "bing", "microsoft.com": "Microsoft", "dell.com": "Dell", "hp.com": "HP", "lenovo.com": "Lenovo", "sony.com": "Sony", "dropbox.com": "Dropbox", "zoom.us": "Zoom", "slack.com": "SlackHQ", "discord.com": "discord", "notion.com": "NotionHQ", "canva.com": "canva", "figma.com": "figma", "shopify.com": "Shopify", "wix.com": "Wix", "squarespace.com": "squarespace", "webflow.com": "webflow", "godaddy.com": "GoDaddy", "namecheap.com": "Namecheap", "mailchimp.com": "Mailchimp", "hubspot.com": "HubSpot", "salesforce.com": "salesforce", "asana.com": "asana", "trello.com": "trello", "linear.app": "linear", "atlassian.com": "Atlassian", "github.com": "github", "gitlab.com": "gitlab", "vercel.com": "vercel", "netlify.com": "Netlify", "stripe.com": "stripe", "paypal.com": "PayPal", "openai.com": "OpenAI", "anthropic.com": "AnthropicAI", "perplexity.ai": "perplexity_ai", "midjourney.com": "midjourney", "huggingface.co": "huggingface", "elevenlabs.io": "elevenlabsio", "runwayml.com": "runwayml", "cursor.com": "cursor_ai", "lovable.dev": "lovable_dev", "bolt.new": "boltdotnew", "netflix.com": "netflix", "disneyplus.com": "DisneyPlus", "max.com": "StreamOnMax", "primevideo.com": "PrimeVideo", "open.spotify.com": "Spotify", "soundcloud.com": "SoundCloud", "twitch.tv": "Twitch", "youtube.com": "YouTube", "vimeo.com": "Vimeo", "coca-cola.com": "CocaCola", "pepsi.com": "pepsi", "starbucks.com": "Starbucks", "dominos.com": "dominos", "pizzahut.com": "pizzahut", "kfc.com": "KFC", "popeyes.com": "PopeyesChicken", "subway.com": "SUBWAY", "chipotle.com": "ChipotleTweets", "redbull.com": "redbull", "doordash.com": "DoorDash", "ubereats.com": "UberEats", "wendys.com": "Wendys", "burgerking.com": "BurgerKing", "timhortons.ca": "TimHortons", "nike.com": "Nike", "adidas.com": "adidas", "puma.com": "PUMA", "reebok.com": "Reebok", "zara.com": "ZARA", "hm.com": "hm", "lululemon.com": "lululemon", "gymshark.com": "Gymshark", "converse.com": "Converse", "vans.com": "VANS_66", "amazon.com": "amazon", "walmart.com": "Walmart", "target.com": "Target", "costco.com": "Costco", "ebay.com": "eBay", "etsy.com": "Etsy", "bestbuy.com": "BestBuy", "ikea.com": "IKEA", "wayfair.com": "Wayfair", "sephora.com": "Sephora", "ulta.com": "ultabeauty", "uber.com": "Uber", "lyft.com": "lyft", "airbnb.com": "Airbnb", "expedia.com": "Expedia", "kayak.com": "KAYAK", "delta.com": "Delta", "united.com": "united", "aircanada.com": "AirCanada", "westjet.com": "WestJet", "marriott.com": "Marriott", "hilton.com": "HiltonHotels", "robinhood.com": "RobinhoodApp", "coinbase.com": "coinbase", "kraken.com": "krakenfx", "wise.com": "Wise", "revolut.com": "RevolutApp", "chase.com": "Chase", "bankofamerica.com": "BankofAmerica", "nerdwallet.com": "NerdWallet", "duolingo.com": "duolingo", "babbel.com": "babbel", "coursera.org": "coursera", "udemy.com": "udemy", "khanacademy.org": "khanacademy", "grammarly.com": "Grammarly", "instagram.com": "instagram", "tiktok.com": "tiktok_us", "x.com": "X", "threads.net": "Threads", "reddit.com": "Reddit", "quora.com": "Quora", "linkedin.com": "LinkedIn", "indeed.com": "Indeed", "pinterest.com": "Pinterest", "tumblr.com": "tumblr", "bumble.com": "bumble", "tinder.com": "Tinder", "snapchat.com": "Snapchat", "tesla.com": "Tesla", "rivian.com": "Rivian", "ford.com": "Ford", "chevrolet.com": "chevrolet", "toyota.com": "Toyota", "honda.com": "Honda", "bmw.com": "BMW", "mercedes-benz.com": "MercedesBenz", "carvana.com": "Carvana", "carmax.com": "CarMax", "playstation.com": "PlayStation", "xbox.com": "Xbox", "nintendo.com": "NintendoAmerica", "steampowered.com": "Steam", "epicgames.com": "EpicGames", "roblox.com": "Roblox", "chess.com": "chesscom", "peloton.com": "onepeloton", "strava.com": "Strava", "garmin.com": "Garmin", "fitbit.com": "fitbit", "whoop.com": "WHOOP", "ring.com": "ring", "dyson.com": "Dyson", "homedepot.com": "HomeDepot", "lowes.com": "Lowes" };
let SHARE_TEXT = "Who wins this SEO fight?";
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(done); } catch { toast("Select and copy the text manually"); } ta.remove(); }
}

/* ---------- sign-up (until checkout is live) ---------- */
const LEADS = {
  pro: ["Founding member", "Get Pro", "Pro is $19/month. Leave your email and we'll send your checkout link with the founding price locked."],
  agency: ["For agencies", "Get Agency", "Agency is $99/month with Prospect Hunter: find local businesses losing to rivals, with a pitch for each."],
  lifetime: ["Founder price", "Get lifetime", "Lifetime is $__LIFEPRICE__ once, and the price goes up as spots sell. Leave your email to lock it."],
  fix: ["Done for you", "Fix my site", "Leave your email and website. We'll reply with a fix plan and a price."],
  battle: ["Free account", "Keyword Battle", "Sign in free: 1 Keyword Battle a week. Pro unlocks all 10 keywords in 37 countries."],
  rivals: ["Pro feature", "Rival finder", "Leave your email and we'll send your top 5 rivals."],
  ai: ["Pro feature", "AI strategy", "AI strategy is part of Pro ($19/month). Leave your email and we'll send your checkout link."],
  watch: ["Pro feature", "Monday reports", "Monday movement reports are part of Pro ($19/month). Leave your email and we'll send your checkout link."],
  more: ["Out of free fights", "Want more fights?", "You get 1 free fight a week. Pro gives you 40 a month for $19."],
};
let leadPlan = "pro";
const checkoutLink = plan => { const el = document.querySelector(\`#pricing [data-lead="\${plan}"]\`); const h = el && el.getAttribute("href"); return h && !h.startsWith("#") ? h : null; };
const withEmail = h => { const e = store.get("fan"); return e ? h + (h.includes("?") ? "&" : "?") + "prefilled_email=" + encodeURIComponent(e) : h; };
function openLead(plan) {
  const direct = checkoutLink(plan === "more" || plan === "ai" || plan === "watch" || plan === "battle" || plan === "rivals" ? "pro" : plan);
  if (direct && plan !== "fix") { location.href = withEmail(direct); return; }
  leadPlan = LEADS[plan] ? plan : "pro";
  const [eb, t, p] = LEADS[leadPlan];
  $("#leadEyebrow").textContent = eb; $("#leadTitle").textContent = t; $("#leadText").textContent = p;
  $("#leadSite").value = $("#a").value || "";
  $("#leadModal").hidden = false; setTimeout(() => $("#leadEmail").focus(), 50);
}
document.querySelectorAll("[data-lead]").forEach(el => el.addEventListener("click", e => {
  const href = el.getAttribute("href");
  if (href && !href.startsWith("#")) { e.preventDefault(); location.href = withEmail(href); return; } // real checkout link
  e.preventDefault(); openLead(el.dataset.lead);
}));
$("#leadClose").addEventListener("click", () => $("#leadModal").hidden = true);
$("#leadModal").addEventListener("click", e => { if (e.target.id === "leadModal") $("#leadModal").hidden = true; });
$("#leadForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#leadEmail").value.trim();
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) { toast("Enter a valid email"); return; }
  $("#leadBtn").disabled = true;
  try {
    const r = await fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, plan: leadPlan, site: $("#leadSite").value.trim(), fight: D && D.slug }) });
    if (!r.ok) throw new Error();
    $("#leadForm").innerHTML = \`<span class="eyebrow">You're in</span><h3 class="display">Spot locked \u{1F94A}</h3><p>We'll email \${esc(email)} soon.</p><button class="btn" type="button" onclick="document.getElementById('leadModal').hidden=true">Done</button>\`;
  } catch { toast("That didn't go through. Try again."); }
  finally { const b = $("#leadBtn"); if (b) b.disabled = false; }
});

/* ---------- start a fight ---------- */
{ const q = new URLSearchParams(location.search); if (q.get("b") && $("#b")) { $("#b").value = q.get("b").slice(0, 100); setTimeout(() => $("#a") && $("#a").focus(), 300); } }
$("#duelForm").addEventListener("submit", async e => {
  e.preventDefault();
  const a = $("#a").value.trim(), b = $("#b").value.trim(), err = $("#err");
  err.hidden = true;
  if (!a || !b) { err.textContent = "Enter both websites to start the fight."; err.hidden = false; return; }
  await meReady;
  const _n = new Date(), today = new Date(Date.UTC(_n.getUTCFullYear(), _n.getUTCMonth(), _n.getUTCDate() - ((_n.getUTCDay() + 6) % 7))).toISOString().slice(0, 10), keepGoing = () => withAccount(() => $("#duelForm").requestSubmit(), "Sign up free to keep fighting", "You've used this week's free fight. A free account gives you another fight every week, plus all 31 checks and the fix list. Takes 5 seconds.");
  if (!ME && store.get("anonFight") === today) { keepGoing(); return; }
  const btn = $("#fightBtn"); btn.disabled = true; btn.textContent = "Fighting\u2026";
  try {
    store.set("mysite", a);
    const r = await fetch(\`/api/duel?a=\${encodeURIComponent(a)}&b=\${encodeURIComponent(b)}\${window.FRESH ? "&fresh=1" : ""}\`);
    const j = await r.json();
    if (r.status === 401 && !ME) { store.set("anonFight", today); btn.disabled = false; btn.textContent = "Fight"; keepGoing(); return; }
    if (!(await gateCheck(r))) { btn.disabled = false; btn.textContent = "Fight"; return; }
    if (!r.ok) throw new Error(j.error || "Fight failed");
    if (!ME) store.set("anonFight", today);
    store.set("pick:" + j.slug, "own");
    location.href = \`/fight/\${j.slug}?r=1\`;
  } catch (x) {
    err.textContent = x.message && x.message !== "Failed to fetch" && !/JSON/.test(x.message) ? x.message : "Live fights run on the real site.";
    err.hidden = false;
    btn.disabled = false; btn.textContent = "Fight";
  }
});

$("#rivalBtn").addEventListener("click", async () => {
  const a = $("#a").value.trim(); if (!a) { toast("Enter your website first"); $("#a").focus(); return; }
  await meReady; if (!ME) { withAccount(() => $("#rivalBtn").click(), "Sign up to find your rivals", "Free account: find your top rivals once a week, plus 1 fight a week."); return; }
  const btn = $("#rivalBtn"); btn.textContent = "Finding rivals\u2026";
  try {
    const r = await fetch(\`/api/rivals?site=\${encodeURIComponent(a)}\`); const j = await r.json();
    if (r.status === 503) { openLead("rivals"); return; }
    if (!(await gateCheck(r))) return;
    if (!r.ok) throw new Error(j.error);
    const list = $("#rivalList");
    list.innerHTML = j.rivals.length ? j.rivals.map(x => \`<button type="button" data-h="\${esc(x.host)}">\${esc(x.host)}</button>\`).join("") : "<span>No clear rivals found. Try entering one.</span>";
    list.hidden = false;
    list.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { $("#b").value = b.dataset.h; $("#duelForm").requestSubmit(); }));
  } catch (x) { toast(x.message && !/fetch|JSON/.test(x.message) ? x.message : "Rival finder runs on the live site"); }
  finally { btn.textContent = "Find SEO rivals for me"; }
});

/* ---------- free plan button: sign up, then go fight ---------- */
$("#freeBtn") && $("#freeBtn").addEventListener("click", async e => {
  e.preventDefault();
  const go = () => { if (location.pathname !== "/") { location.href = "/#test"; return; } $("#test").scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => $("#a").focus(), 500); };
  await meReady;
  if (ME) { toast("You're already in. Put your site in the ring \u{1F94A}"); go(); return; }
  withAccount(go, "Create your free account", "Free forever, no card: 1 fight a week, every fight result, and 1 try of each tool a week.", "/#test");
});

/* ---------- live showdowns strip ---------- */
if (VIEW === "home" && location.pathname === "/") fetch("/api/showdowns?n=3").then(r => r.json()).then(j => {
  const list = (j && j.live) || []; if (!list.length) return;
  const rk = p => p == null ? "30+" : "#" + p, P = p => p == null ? 999 : p;
  $("#sdHome").innerHTML = list.map(s => { const lead = P(s.a_now) < P(s.b_now) ? "a" : P(s.b_now) < P(s.a_now) ? "b" : "";
    return \`<a class="sdh" href="/showdown/\${encodeURIComponent(s.id)}"><span class="kw">\u201C\${esc(s.keyword)}\u201D</span><span class="rw \${lead === "a" ? "lead" : ""}"><b class="ra">\${ico(s.a)}\${esc(brandName(s.a))}</b><i>\${rk(s.a_now)}</i></span><span class="rw \${lead === "b" ? "lead" : ""}"><b class="rb">\${ico(s.b)}\${esc(brandName(s.b))}</b><i>\${rk(s.b_now)}</i></span><span class="ft">Day \${s.day} of 14 \xB7 pick a winner \u2192</span></a>\`; }).join("");
  $("#showdowns").hidden = false;
}).catch(() => {});
/* ---------- main card ---------- */
const ALL_FIGHTS = location.pathname === "/fights"; if (ALL_FIGHTS) document.documentElement.classList.add("fights-page");
function splitHTML(c, p) {
  const va = c.votes_a || 0, vb = c.votes_b || 0, t = va + vb || 1, sa = Math.round((va / t) * 100), sb = 100 - sa;
  return \`<div class="pg-split" role="img" aria-label="\${sa}% picked \${esc(brandName(c.a))}, \${sb}% picked \${esc(brandName(c.b))}"><i class="a" style="width:\${sa}%"></i><i class="b" style="width:\${sb}%"></i></div>
    <div class="pg-row"><span><b class="ra">\${sa}%</b> \xB7 <b class="rb">\${sb}%</b></span><span>You picked \${esc(brandName(c[p]))}</span></div>
    <a class="pg-go" href="/fight/\${encodeURIComponent(c.slug)}">See who really won \u2192</a>\`;
}
function posterHTML(c) {
  const p = store.get("pick:" + c.slug), picked = p === "a" || p === "b", tot = (c.votes_a || 0) + (c.votes_b || 0);
  const A = brandName(c.a), B = brandName(c.b), night = c.slug === FOTN;
  const fit = t => { const n = Math.max(...String(t).split(/\\s+/).map(w => w.length)); return n <= 5 ? 30 : n <= 6 ? 26 : n <= 8 ? 21 : n <= 10 ? 18 : 15; };
  return \`<article class="pg\${picked ? " picked" : ""}\${night ? " night" : ""}" data-slug="\${esc(c.slug)}">
    <div class="pg-top"><span class="pg-cat">\${night ? "\u{1F319} Tonight" : esc(c.category || "Featured")}</span><span class="pg-q">Who wins?</span></div>
    <div class="pg-sides"><button type="button" class="pg-s a\${p === "a" ? " mine" : ""}" data-side="a" aria-label="Pick \${esc(A)}" style="--fs:\${fit(A)}px"\${picked ? " disabled" : ""}>\${ico(c.a)}<span>\${esc(A)}</span></button><span class="pg-vs">VS</span><button type="button" class="pg-s b\${p === "b" ? " mine" : ""}" data-side="b" aria-label="Pick \${esc(B)}" style="--fs:\${fit(B)}px"\${picked ? " disabled" : ""}>\${ico(c.b)}<span>\${esc(B)}</span></button></div>
    <div class="pg-res">\${picked ? splitHTML(c, p) : \`<span class="pg-hint"><b>\u{1F446} Pick a side</b>\${tot ? " \xB7 " + tot.toLocaleString() + (tot === 1 ? " pick" : " picks") + " so far" : ""}</span>\`}</div>
  </article>\`;
}
function renderCards(cat) {
  const list = CARDS.filter(c => (!cat || c.category === cat) && !(NIGHT && location.pathname === "/" && c.slug === NIGHT.slug));
  const show = ALL_FIGHTS ? list : list.slice(0, 8);
  $("#cards").innerHTML = show.map(posterHTML).join("") || \`<p class="sub">No fights here yet.</p>\`;
  const mb = $("#mcMoreBtn"); if (mb) mb.textContent = \`See all \${CARDS.length} fights \u2192\`;
}
$("#cards").addEventListener("click", async e => {
  const go = e.target.closest(".pg-go");
  if (go) {
    await meReady;
    if (!ME) { e.preventDefault(); withAccount(() => { location.href = go.getAttribute("href"); }, "Sign up free to see if you called it", "Free account, no card. See who really won every big rivalry, plus 1 fight of your own every week.", go.getAttribute("href")); }
    return;
  }
  const s = e.target.closest(".pg-s");
  if (!s) { const card = e.target.closest(".pg:not(.picked)"); if (card) { card.classList.remove("nudge"); void card.offsetWidth; card.classList.add("nudge"); toast("Pick a side: tap the red or the blue corner"); } return; }
  const card = s.closest(".pg"), slug = card.dataset.slug, side = s.dataset.side, c = CARDS.find(x => x.slug === slug);
  if (!c || card.classList.contains("picked")) return;
  store.set("pick:" + slug, side);
  c["votes_" + side] = (c["votes_" + side] || 0) + 1;
  card.classList.add("picked", "just"); s.classList.add("mine"); card.querySelectorAll(".pg-s").forEach(x => { x.disabled = true; });
  card.querySelector(".pg-res").innerHTML = splitHTML(c, side);
  toast(\`Locked in: \${brandName(c[side])} \u{1F94A} Now see who really won\`);
  try {
    const r = await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, side }) });
    if (r.ok) { const v = await r.json(); if (v.votes_a + v.votes_b >= 1) { c.votes_a = v.votes_a; c.votes_b = v.votes_b; card.querySelector(".pg-res").innerHTML = splitHTML(c, side); } }
  } catch {}
});
const WHY_L = { "Title tag": "The clickable headline people see on Google.", "Meta description": "The text Google shows under your link.", "One H1 heading": "Tells Google the main topic of the page.", "H2/H3 structure": "Helps Google and AI skim the page.", "Image alt text": "Lets images show up in search.", "Canonical URL": "Stops Google splitting your rank across copies.", "Internal links": "Spreads ranking power to your other pages.", "Content depth": "More useful text means more searches you can win.", "Language set": "Helps Google show the page to the right country.", "HTTPS": "Google and browsers distrust sites without it.", "Server response": "A slow server delays everything after it.", "Real load speed (LCP)": "Slow pages lose rankings and visitors.", "Mobile viewport": "Most searches are on phones.", "Google can index it": "If Google can't index it, it can't rank.", "Sitemap": "Shows Google every page you want found.", "robots.txt": "Tells crawlers where they can go.", "AI crawlers allowed": "Decides if ChatGPT and Perplexity can read you.", "llms.txt": "A short guide that helps AI tools quote you.", "Structured data": "Gives Google and AI clean facts about the page.", "Who-you-are schema": "Helps AI know who the business is.", "Answers questions": "Question-style content gets quoted in AI answers.", "Share preview (Open Graph)": "Controls how the link looks when shared.", "Share description": "The text people see when the link is shared.", "X/Twitter card": "Makes the link stand out on X.", "Favicon": "The little icon next to your name in Google." };
const WHY = { onpage: "Google reads this first to understand the page.", content: "More useful text means more searches you can show up for.", technical: "Slow or broken pages lose rankings.", ai: "Decides if ChatGPT and Perplexity can read and quote the site.", social: "Controls how the link looks when people share it." };
function renderNight() {
  if (!NIGHT || VIEW !== "home" || location.pathname !== "/") return;
  const A = brandName(NIGHT.a.host), B = brandName(NIGHT.b.host), W = NIGHT.winner, name = { a: A, b: B };
  $("#ncA").innerHTML = ico(NIGHT.a.host, "lg") + esc(A); $("#ncB").innerHTML = ico(NIGHT.b.host, "lg") + esc(B);
  $("#ncSA").textContent = NIGHT.a.score; $("#ncSB").textContent = NIGHT.b.score;
  $("#ncBA").textContent = W === "a" ? "\u2605 Winner" : ""; $("#ncBB").textContent = W === "b" ? "\u2605 Winner" : "";
  $("#ncSideA").classList.toggle("won", W === "a"); $("#ncSideB").classList.toggle("won", W === "b");
  $("#ncSideA").classList.toggle("lost", W === "b"); $("#ncSideB").classList.toggle("lost", W === "a");
  const votes = (NIGHT.votes_a || 0) + (NIGHT.votes_b || 0); $("#ncVotes").textContent = votes ? votes.toLocaleString() + (votes === 1 ? " fan picked" : " fans picked") : "";
  let ra = 0, rb = 0, swing = null, sw = -1;
  $("#ncRounds").innerHTML = CATS.map(([k, , rn]) => {
    const x = NIGHT.a.scores[k] || 0, y = NIGHT.b.scores[k] || 0, share = x + y ? Math.round((x / (x + y)) * 100) : 50;
    if (x > y) ra++; else if (y > x) rb++;
    if (Math.abs(x - y) > sw) { sw = Math.abs(x - y); swing = rn; }
    const took = x > y ? "a" : y > x ? "b" : "";
    return \`<div class="tg"><div class="tg-l"><span class="tg-v a\${took === "a" ? " w" : ""}">\${x}</span><span class="tg-n">\${rn}</span><span class="tg-v b\${took === "b" ? " w" : ""}">\${y}</span></div><div class="tg-bar" role="img" aria-label="\${rn}: \${A} \${x}, \${B} \${y}"><i class="a" style="width:\${share}%"></i><i class="b"></i><b class="tg-mid"></b></div></div>\`;
  }).join("");
  { const t = 5 - ra - rb; $("#ncTally").textContent = ra === rb ? \`Rounds split \${ra}\u2013\${rb}\` : \`\${ra > rb ? A : B} took \${Math.max(ra, rb)} of 5 rounds\${t ? \` \xB7 \${t} tied\` : ""}\`; }
  const gap = Math.abs(NIGHT.a.score - NIGHT.b.score);
  $("#ncVerdict").textContent = W ? \`\${name[W]} wins by \${gap}. The biggest swing was the \${swing} round.\` : \`Dead even at \${NIGHT.a.score}.\`;
  const rows = NIGHT.rows || [], lv = { good: 2, warn: 1, bad: 0 };
  const ko = rows.map(r => ({ r, d: Math.abs((lv[r[3]] ?? 1) - (lv[r[5]] ?? 1)) })).filter(o => o.d > 0 && o.r[6]).sort((p, q) => q.d - p.d).slice(0, 3);
  $("#ncKO").innerHTML = ko.map(({ r: [cat, label, av, as, bv, bs, edge] }) => \`<div class="ko"><span class="ko-r">\${esc((CATS.find(c => c[0] === cat) || [, , cat])[2])}</span><b class="ko-l">\${esc(label)}</b>
    <span class="ko-v \${edge === "a" ? "w" : ""}"><i class="dot \${as}"></i><em>\${esc(A)}</em>\${esc(av)}</span><span class="ko-v \${edge === "b" ? "w" : ""}"><i class="dot \${bs}"></i><em>\${esc(B)}</em>\${esc(bv)}</span>
    <p>\${esc(WHY_L[label] || WHY[cat] || "")}</p></div>\`).join("");
  document.querySelector(".bc-ko").hidden = !ko.length;
  const groups = CATS.map(([k, , rn]) => { const rs = rows.filter(r => r[0] === k); const ta = rs.filter(r => r[6] === "a").length, tb = rs.filter(r => r[6] === "b").length;
    return rs.length ? \`<details class="nacc"><summary><span class="nacc-n">\${rn}</span><span class="nacc-t"><b class="ra">\${esc(A)} \${ta}</b> \xB7 <b class="rb">\${esc(B)} \${tb}</b></span><span class="nacc-open"><span class="o1">\${rs.length} checks \xB7 Open</span><span class="o2">Close</span></span></summary><div class="nacc-b"><div class="nacc-head"><span></span><span class="ra">\${esc(A)}</span><span class="rb">\${esc(B)}</span></div>\${rs.map(([, label, av, as, bv, bs, edge]) => \`<div class="ncc-row"><span class="ncc-l">\${esc(label)}</span><span class="ncc-v \${edge === "a" ? "w" : ""}"><i class="dot \${as}"></i>\${esc(av)}</span><span class="ncc-v \${edge === "b" ? "w" : ""}"><i class="dot \${bs}"></i>\${esc(bv)}</span></div>\`).join("")}</div></details>\` : ""; }).join("");
  $("#ncChecks").innerHTML = \`<div class="nacc-cap"><b>All \${rows.length || 31} checks</b><span>Tap a round to see every check</span></div>\` + groups;
  $("#ncAll").textContent = "Open every round";
  $("#ncAll").addEventListener("click", () => { const ds = [...document.querySelectorAll("#ncChecks details")], open = ds.some(d => !d.open); ds.forEach(d => { d.open = open; }); $("#ncAll").setAttribute("aria-expanded", String(open)); $("#ncAll").textContent = open ? "Close every round" : "Open every round"; });
  const champ = W ? NIGHT[W].host : NIGHT.b.host;
  $("#ncMine").textContent = \`Can your site beat \${brandName(champ)}?\`;
  $("#ncMine").addEventListener("click", e => { e.preventDefault(); $("#b").value = champ; $("#a").value = (window.ME && (ME.site || store.get("mysite"))) || ""; $("#test").scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => $("#a").focus(), 500); });
  $("#ncFull").href = \`/fight/\${encodeURIComponent(NIGHT.slug)}\`;
  $("#night").hidden = false;
}
renderNight();
function headerRivals() {
  if (VIEW !== "home" || location.pathname !== "/") return;
  const h1 = document.querySelector(".hero h1"); if (!h1) return;
  const pairs = [], seen = new Set();
  const add = (a, b) => { const k = a + b; if (!seen.has(k)) { seen.add(k); pairs.push([brandName(a), brandName(b)]); } };
  if (NIGHT) add(NIGHT.a.host, NIGHT.b.host);
  ["apple.com-vs-samsung.com", "nike.com-vs-adidas.com", "coca-cola.com-vs-pepsi.com", "openai.com-vs-anthropic.com", "uber.com-vs-lyft.com", "netflix.com-vs-disneyplus.com", "playstation.com-vs-xbox.com", "instagram.com-vs-tiktok.com"].forEach(sl => { const c = CARDS.find(x => x.slug === sl); if (c) add(c.a, c.b); });
  CARDS.filter(c => c.category).slice(0, 8).forEach(c => add(c.a, c.b));
  if (!pairs.length) return;
  const items = [\`<span class="r">You</span> <small>or</small> <span class="b">your rival?</span>\`, ...pairs.slice(0, 10).map(([a, b]) => \`<span class="r">\${esc(a)}</span> <small>or</small> <span class="b">\${esc(b)}?</span>\`)];
  h1.innerHTML = \`<span class="l1">Whose <span class="r">SEO</span> wins?</span><span class="rot" aria-live="polite"><span class="rot-in">\${items[0]}</span></span>\`;
  const rot = h1.querySelector(".rot"), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fit = el => { el.style.fontSize = ""; let f = 1; while (el.scrollWidth > rot.clientWidth + 2 && f > .45) { f -= .05; el.style.fontSize = f + "em"; } };
  const l1 = h1.querySelector(".l1"); { let f = 1; while (l1.scrollWidth > l1.clientWidth + 2 && f > .4) { f -= .04; l1.style.fontSize = f + "em"; } }
  fit(rot.firstChild);
  let i = 0;
  setInterval(() => {
    i = (i + 1) % items.length;
    const old = rot.firstChild, nx = document.createElement("span");
    nx.className = "rot-in enter"; nx.innerHTML = items[i]; rot.appendChild(nx); fit(nx);
    if (still) { old.remove(); nx.classList.remove("enter"); return; }
    requestAnimationFrame(() => { old.classList.add("leave"); nx.classList.remove("enter"); });
    setTimeout(() => old.remove(), 600);
  }, i === 0 ? 2600 : 2200);
}
headerRivals();
// Posters open the fight page for everyone: signed out sees scores and rounds, members see everything.
if (VIEW === "home") {
  const cats = [...new Set(CARDS.map(c => c.category).filter(Boolean))];
  $("#catChips").innerHTML = [\`<button type="button" class="chip on" data-c="">All</button>\`, ...cats.map(c => \`<button type="button" class="chip" data-c="\${esc(c)}">\${esc(c)}</button>\`)].join("");
  $("#catChips").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    document.querySelectorAll("#catChips .chip").forEach(x => x.classList.toggle("on", x === b));
    renderCards(b.dataset.c);
  });
  renderCards("");
  if (ALL_FIGHTS) { $("#mcTitle").textContent = "Every fight"; $("#mcMore").hidden = true; }
}

/* ---------- signed-in homepage: ringside bar, your corner, hunt clients mode ---------- */
const IS_HOME = VIEW === "home" && location.pathname === "/";
const HUNTERS = ["agency", "owner"];
const shortDate = t => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
function setMode(m, save) {
  const hunt = m === "hunt";
  document.querySelectorAll("#modes button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.mode === m)));
  $("#duelForm").hidden = hunt; $("#huntForm").hidden = !hunt; $("#rivalsQ").hidden = hunt; if (hunt) $("#rivalList").hidden = true;
  $("#huntZone").hidden = !hunt; $("#yourCorner").hidden = hunt || !$("#csList").children.length; $("#err").hidden = true;
  $("#testYours").textContent = hunt ? "Find clients losing on Google" : "Now put your site in the ring";
  if (save) store.set("ringMode", m);
}
const prospectCard = (x, id) => \`<div class="prospect"><div class="pr-top"><b>\${ico(x.host)}\${esc(x.host)}</b><span class="pr-score"><i class="r">\${x.score}</i> vs <i class="b">\${x.rivalScore}</i></span></div>
  <p class="sub" style="margin:0">\${x.gap > 0 ? \`Google rank #\${esc(x.rank)}. Losing by \${esc(x.gap)} points to \${esc(x.rival)}.\` : \`Google rank #\${esc(x.rank)}. Beats \${esc(x.rival)} on the page by \${esc(-x.gap)}, but still ranks below it.\`} Top gaps: \${(x.fixes || []).map(esc).join(", ") || "polish"}.</p>
  <pre class="out pitch" id="\${id}">\${esc(x.pitch || "Pitch unavailable for this one. Open the fight and write your own.")}</pre>
  <div class="pr-act"><button class="btn sm" type="button" data-pitch="\${id}">Copy pitch</button><a class="btn ghost sm" href="\${esc(x.fight)}" target="_blank" rel="noopener">Open the fight</a></div></div>\`;
document.addEventListener("click", e => { const b = e.target.closest("[data-pitch]"); if (b) copy($("#" + b.dataset.pitch).textContent); });
let huntsLoaded = false;
async function loadHunts() {
  if (huntsLoaded) return; huntsLoaded = true;
  try {
    const r = await fetch("/api/hunts?n=3"); if (!r.ok) return; const j = await r.json();
    if (!j.hunts.length) return;
    $("#rhList").innerHTML = j.hunts.map(h => \`<details class="rh"><summary><span><b>\${esc(h.industry)} in \${esc(h.city)}</b><small>\${h.prospects.length} prospect\${h.prospects.length === 1 ? "" : "s"} \xB7 \${shortDate(h.at)}</small></span></summary><div class="prospects">\${h.prospects.map((x, k) => prospectCard(x, \`rh\${h.id}-\${k}\`)).join("")}</div></details>\`).join("");
    $("#recentHunts").hidden = false;
  } catch {}
}
function ringsideBar(me) {
  const f = me.ring && me.ring.fights, h = me.ring && me.ring.hunts; if (!f) return;
  const per = f.per === "week" ? "this week" : "this month";
  const label = me.plan === "free" ? "Free plan" : me.name;
  const txt = me.plan === "owner" ? "<b>Unlimited</b> fights and hunts" : HUNTERS.includes(me.plan) ? \`<b>\${f.left}</b> fights \xB7 <b>\${h.left}</b> hunts left\` : \`<b>\${f.left}</b> of \${f.max} fights left \${per}\`;
  const up = me.plan === "free" ? \`<span class="sep">\xB7</span><a class="up" href="/go/pro">Go Pro</a>\` : "";
  $("#ringside").innerHTML = \`<a class="main" href="/account"><span class="pl \${esc(me.plan)}">\${esc(label)}</span><span class="txt">\${txt}</span></a>\${up}<span class="sep g">\xB7</span><a class="go" href="/account">Account \u2192</a>\`;
  $("#ringside").hidden = false;
}
function yourCorner(list) {
  if (!list || !list.length) return;
  $("#csList").innerHTML = list.map(f => {
    const wa = f.winner === "a", wb = f.winner === "b", who = wa ? f.a : wb ? f.b : null;
    return \`<div class="mini"><a class="mini-link" href="/fight/\${encodeURIComponent(f.slug)}" aria-label="\${esc(f.a)} vs \${esc(f.b)}">
      <span class="mini-row"><span class="mh a\${wa ? " w" : ""}">\${ico(f.a)}\${esc(pretty(f.a))}</span><span class="ms a">\${f.a_score ?? "\u2013"}</span></span><span class="mvs">VS</span>
      <span class="mini-row"><span class="mh b\${wb ? " w" : ""}">\${ico(f.b)}\${esc(pretty(f.b))}</span><span class="ms b">\${f.b_score ?? "\u2013"}</span></span></a>
      <div class="mini-foot"><span>\${shortDate(f.at)} \xB7 \${who ? esc(pretty(who)) + " won" : "Tie"}</span><button class="btn sm rematch" type="button" data-a="\${esc(f.a)}" data-b="\${esc(f.b)}">Rematch</button></div></div>\`;
  }).join("");
  $("#csList").querySelectorAll(".rematch").forEach(b => b.addEventListener("click", () => {
    setMode("fight", false); $("#a").value = b.dataset.a; $("#b").value = b.dataset.b; window.FRESH = true;
    $("#test").scrollIntoView({ behavior: "smooth", block: "center" }); b.textContent = "Fighting\u2026"; setTimeout(() => { b.textContent = "Rematch"; }, 5000); $("#duelForm").requestSubmit();
  }));
  $("#yourCorner").hidden = false;
}
if (IS_HOME) {
  $("#modes").hidden = false;
  $("#modes").addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.mode === "fight") { setMode("fight", true); return; }
    await meReady;
    const pw = () => paywall("Prospect Hunter finds local businesses losing on Google and writes the pitch for you.", "agency");
    if (!ME) { withAccount(() => { if (HUNTERS.includes(ME.plan)) { setMode("hunt", true); loadHunts(); } else pw(); }, "Sign up to hunt clients", "Free account first, 5 seconds. Prospect Hunter is part of the Agency plan."); return; }
    if (!HUNTERS.includes(ME.plan)) { pw(); return; }
    setMode("hunt", true); loadHunts();
  });
  $("#huntForm").addEventListener("submit", async e => {
    e.preventDefault();
    const industry = $("#hIndustry").value.trim(), city = $("#hCity").value.trim(), msg = $("#huntMsg");
    const say = t => { msg.textContent = t; msg.hidden = !t; };
    if (industry.length < 2 || city.length < 2) { say("Enter an industry and a city."); return; }
    await meReady; if (!ME || !HUNTERS.includes(ME.plan)) { paywall("Prospect Hunter finds local businesses losing on Google and writes the pitch for you.", "agency"); return; }
    const btn = $("#huntBtn"); btn.disabled = true; btn.textContent = "Hunting\u2026 about a minute";
    say("Searching Google, then fighting each business against the #1 site.");
    try {
      const r = await fetch("/api/prospects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ industry, city, country: $("#hCountry").value }) });
      if (r.status === 402) { paywall("Prospect Hunter finds local businesses losing on Google and writes the pitch for you.", "agency"); say(""); return; }
      if (!(await gateCheck(r))) { say(""); return; }
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      if (!j.prospects.length) { say("No local businesses found for that search. Try a broader industry or a bigger city."); return; }
      say("");
      $("#huntTitle").textContent = \`\${j.prospects.length} \${j.industry} in \${j.city} ranking below \${j.leader.host}\`;
      $("#huntSub").textContent = "Behind on the page first, biggest gap first.";
      $("#huntList").innerHTML = j.prospects.map((x, k) => prospectCard(x, "hn" + k)).join("");
      $("#huntOut").hidden = false; $("#huntOut").scrollIntoView({ behavior: "smooth", block: "start" });
      if (window.ME && ME.ring) { ME.ring.hunts.left = Math.max(0, ME.ring.hunts.left - 1); ringsideBar(ME); }
    } catch (x) { say(x && x.message && !/fetch|JSON/i.test(x.message) ? x.message : "Prospect Hunter runs on the live site."); }
    finally { btn.disabled = false; btn.textContent = "Hunt clients"; }
  });
  meReady.then(me => {
    if (!me) return;
    if (!$("#a").value) $("#a").value = me.site || store.get("mysite") || "";
    ringsideBar(me); yourCorner(me.corner);
    
    document.querySelector("#test .proof").hidden = true;
    if (HUNTERS.includes(me.plan)) { $("#agTag").hidden = true; loadHunts(); if (store.get("ringMode") === "hunt") setMode("hunt", false); }
  });
}

/* ---------- fight page: pick, then reveal ---------- */
function reveal(pick, votes) {
  document.documentElement.dataset.revealed = "1";
  $("#gate").hidden = true; $("#unlock").hidden = true;
  render(D, true, true);
  const sum = document.querySelector(".seo-sum"); if (sum) sum.hidden = false;
  if (pick === "a" || pick === "b") {
    const right = D.winner === pick;
    const va = votes ? votes.votes_a : D.votes_a || 0, vb = votes ? votes.votes_b : D.votes_b || 0;
    const total = va + vb, share = total ? Math.round(((pick === "a" ? va : vb) / total) * 100) : 100;
    const v = $("#verdict");
    v.className = "verdict " + (right ? "win" : "lose");
    v.innerHTML = \`<b>\${right ? "You called it \u{1F3AF}" : "Upset! \u{1F62E}"}</b><span>\${share}% of \${total.toLocaleString()} fans picked \${esc(D[pick].host)}.</span>\`;
    v.hidden = false;
  } else if (store.get("pick:" + D.slug) === "own" || new URLSearchParams(location.search).get("r") === "1") { // your own fight
    const v = $("#verdict"), gap = Math.abs(D.a.score - D.b.score);
    v.className = "verdict " + (D.winner === "a" ? "win" : "lose");
    v.innerHTML = D.winner === "a" ? \`<b>You win \u{1F3C6}</b><span>\${esc(D.a.host)} beats \${esc(D.b.host)} by \${gap}.</span>\` : D.winner === "b" ? \`<b>You lost \u{1F94A}</b><span>\${esc(D.b.host)} wins by \${gap}. Here's how to take the belt back.</span>\` : \`<b>Dead even</b><span>\${D.a.score} each. One fix breaks the tie.</span>\`;
    v.hidden = false;
  }
  personalizeUpsell(pick);
  document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
}
let pendingPick = null, pendingVotes = null;
async function fullFight() { // locked pages only carry the names; fetch the result once signed in
  if (!D.locked) return true;
  try { const r = await fetch("/api/fight?slug=" + encodeURIComponent(D.slug)); if (!(await gateCheck(r))) return false; const j = await r.json(); if (!r.ok) throw 0; D = j; return true; }
  catch { toast("Couldn't load the result. Refresh the page."); return false; }
}
async function needUnlock(pick, votes) {
  await meReady;
  if (window.AUTH && AUTH.google) { const g = $("#unlockGoogle"); g.href = "/auth/google?next=" + encodeURIComponent(location.pathname); g.hidden = false; }
  if (ME || D.slug === FOTN) { if (await fullFight()) reveal(pick, votes); return; }
  pendingPick = pick; pendingVotes = votes;
  if (D.tease) { reveal(pick, votes); return; } // signed out: scores, rounds and verdict now; checks and fixes after sign-up
  $("#gate").hidden = true; $("#unlock").hidden = false;
  $("#unlockEyebrow").textContent = pick === "a" || pick === "b" ? \`You picked \${D[pick].host}\` : "Result is ready";
  setTimeout(() => $("#unlockEmail").focus(), 60);
}
$("#unlock").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#unlockEmail").value.trim();
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) { toast("Enter a valid email to see the result"); return; }
  $("#unlockBtn").disabled = true; $("#unlockBtn").textContent = "Unlocking\u2026";
  try {
    const r = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, next: location.pathname }) });
    const j = await r.json();
    if (!r.ok) { toast(j.error || "Try again"); $("#unlockBtn").disabled = false; $("#unlockBtn").textContent = "Show me"; return; }
    if (j.sent) { $("#unlock").innerHTML = \`<span class="eyebrow">Almost there</span><h2 class="display">Check your inbox \u{1F4EC}</h2><p class="gate-note">We sent a sign-in link to \${esc(email)}. Tap it and this result opens.</p>\`; return; }
    window.ME = j; window.dashBtn && window.dashBtn();
  } catch { toast("Try again"); $("#unlockBtn").disabled = false; $("#unlockBtn").textContent = "Show me"; return; }
  store.set("fan", email);
  $("#unlock").hidden = true;
  if (await fullFight()) reveal(pendingPick, pendingVotes);
});
if (VIEW === "fight") {
  $("#pickA").textContent = D.a.host; $("#pickB").textContent = D.b.host;
  const saved = store.get("pick:" + D.slug);
  const own = new URLSearchParams(location.search).get("r") === "1";
  if (own || saved) needUnlock(saved === "a" || saved === "b" ? saved : null);
  else {
    $("#gate").hidden = false;
    document.querySelectorAll(".pick").forEach(btn => btn.addEventListener("click", async () => {
      const side = btn.dataset.side; store.set("pick:" + D.slug, side);
      let votes = null;
      try { const r = await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: D.slug, side }) }); if (r.ok) votes = await r.json(); } catch {}
      needUnlock(side, votes);
    }));
    $("#skipGate").addEventListener("click", () => { store.set("pick:" + D.slug, "skip"); needUnlock(null); });
  }
}

/* ---------- buttons on a fight ---------- */
const unlockFight = () => withAccount(async () => { if (await fullFight()) reveal(pendingPick, pendingVotes); }, "See every check", "Free account, no card. See all 31 checks and the fix list on every fight.", location.pathname + location.search);
$("#lkEmail").addEventListener("click", unlockFight);
$("#copyBtn").addEventListener("click", () => D.tease ? unlockFight() : copy(D.markdown, "Fix list copied. Paste it into Claude Code."));
$("#shareBtn").addEventListener("click", async () => {
  const url = \`\${location.origin}/fight/\${D.slug}\`;
  if (navigator.share) { try { await navigator.share({ title: \`\${brandName(D.a.host)} vs \${brandName(D.b.host)}\`, text: SHARE_TEXT, url }); return; } catch {} }
  copy(url, "Fight link copied");
});
$("#badgeCopy").addEventListener("click", () => copy($("#badgeCode").textContent, "Badge code copied. Paste it into your site."));
$("#aiBtn").addEventListener("click", async () => {
  const btn = $("#aiBtn"); btn.disabled = true; btn.textContent = "Thinking\u2026";
  try {
    const r = await fetch("/api/strategy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: D.a.host, b: D.b.host }) });
    const j = await r.json();
    if (r.status === 402 || r.status === 503) { openLead("ai"); return; }
    if (!r.ok) throw new Error(j.error);
    $("#aiOut").innerHTML = mdLite(j.strategy); $("#aiOut").hidden = false;
  } catch (x) { toast(x.message && !/fetch|JSON/.test(x.message) ? x.message : "AI strategy runs on the live site"); }
  finally { btn.disabled = false; btn.textContent = "Get AI strategy"; }
});
$("#watchForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const r = await fetch("/api/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: D.a.host, b: D.b.host }) });
    const j = await r.json();
    if (r.status === 402) { openLead("watch"); return; }
    if (!r.ok) throw new Error(j.error);
    $("#watchForm").innerHTML = \`<b>Watching \${esc(D.b.host)}</b><p>Reports go to \${esc(j.email)} every Monday the score moves.</p>\`;
  } catch (x) { toast(x.message && !/fetch|JSON/.test(x.message) ? x.message : "Watching works on the live site"); }
});

/* ---------- TikTok card + video (1080\xD71920) ---------- */
const RED = "#ff3b4e", BLUE = "#3d6bff", GOLD = "#f2c14e";
const DF = '"Big Shoulders Display", Impact, sans-serif', BF = '"Geist", -apple-system, sans-serif', MF = '"Geist Mono", Menlo, monospace';
async function fonts() { try { await Promise.all([document.fonts.load(\`900 100px \${DF}\`), document.fonts.load(\`700 40px \${BF}\`), document.fonts.load(\`600 30px \${MF}\`)]); } catch {} }
function fit(x, t, max, size, weight, fam) { let s = size; x.font = \`\${weight} \${s}px \${fam}\`; while (x.measureText(t).width > max && s > 24) { s -= 2; x.font = \`\${weight} \${s}px \${fam}\`; } }
// p: 0..1 animation progress. 1 = final frame.
function drawFrame(p) {
  const c = $("#card"), x = c.getContext("2d"), W = 1080, H = 1920;
  const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0b0d13"); g.addColorStop(1, "#05060a"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = (cx, col) => { const r = x.createRadialGradient(cx, 820, 0, cx, 820, 760); r.addColorStop(0, col); r.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = r; x.fillRect(0, 0, W, H); };
  glow(0, "rgba(255,59,78,.38)"); glow(W, "rgba(61,107,255,.38)");
  x.textAlign = "center";
  x.fillStyle = "rgba(255,255,255,.6)"; x.font = \`600 34px \${MF}\`; x.fillText("SEO FIGHT NIGHT", W / 2, 150);
  const intro = ease(p / 0.18);
  x.globalAlpha = intro;
  x.fillStyle = RED; fit(x, D.a.host.toUpperCase(), 960, 150, 900, DF); x.fillText(D.a.host.toUpperCase(), W / 2, 330);
  x.fillStyle = "#fff"; x.font = \`900 110px \${DF}\`; x.fillText("VS", W / 2, 460);
  x.fillStyle = BLUE; fit(x, D.b.host.toUpperCase(), 960, 150, 900, DF); x.fillText(D.b.host.toUpperCase(), W / 2, 610);
  x.globalAlpha = 1;
  const sp = ease((p - 0.2) / 0.4);
  [["a", RED, W * 0.27], ["b", BLUE, W * 0.73]].forEach(([k, col, cx]) => {
    x.fillStyle = col; x.font = \`900 280px \${DF}\`; x.fillText(String(Math.round(D[k].score * sp)), cx, 980);
    x.fillStyle = "rgba(255,255,255,.55)"; x.font = \`600 30px \${MF}\`; x.fillText(k === "a" ? "RED CORNER" : "BLUE CORNER", cx, 700);
  });
  if (p > 0.66 && D.winner) {
    const s = ease((p - 0.66) / 0.08), cx = D.winner === "a" ? W * 0.27 : W * 0.73;
    x.save(); x.translate(cx, 1060); x.scale(0.6 + 0.4 * s, 0.6 + 0.4 * s); x.globalAlpha = s;
    x.fillStyle = GOLD; x.font = \`800 54px \${DF}\`; x.fillText("\u2605 WINNER \u2605", 0, 0); x.restore(); x.globalAlpha = 1;
  }
  CATS.forEach(([k, , n], i) => {
    const y = 1190 + i * 108, half = 360, rp = ease((p - 0.25 - i * 0.05) / 0.35);
    const a = (D.a.scores[k] ?? 0) * rp, b = (D.b.scores[k] ?? 0) * rp;
    x.fillStyle = "rgba(255,255,255,.75)"; x.font = \`600 30px \${BF}\`; x.fillText(n.toUpperCase(), W / 2, y - 22);
    x.fillStyle = "rgba(255,255,255,.1)"; x.fillRect(W / 2 - 40 - half, y, half, 22); x.fillRect(W / 2 + 40, y, half, 22);
    x.fillStyle = RED; x.fillRect(W / 2 - 40 - half * a / 100, y, half * a / 100, 22);
    x.fillStyle = BLUE; x.fillRect(W / 2 + 40, y, half * b / 100, 22);
  });
  x.fillStyle = "#fff"; x.font = \`800 64px \${DF}\`; x.fillText("WHO WINS YOURS?", W / 2, 1790);
  x.fillStyle = "rgba(255,255,255,.65)"; x.font = \`600 36px \${MF}\`; x.fillText(site, W / 2, 1850);
}
let saveAs = "image";
function openModal(kind) { saveAs = kind; $("#modal").hidden = false; $("#vid").hidden = true; $("#card").hidden = false; $("#recNote").hidden = true; $("#dlBtn").textContent = kind === "video" ? "Save video" : "Save image"; }
$("#cardBtn").addEventListener("click", async () => { openModal("image"); await fonts(); drawFrame(1); });
let videoBlob = null;
$("#videoBtn").addEventListener("click", async () => {
  openModal("video"); await fonts(); drawFrame(0);
  const c = $("#card");
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const type = window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported(t));
  if (!type || !c.captureStream) { drawFrame(1); toast("Your browser can't record video. Saving the image instead."); saveAs = "image"; $("#dlBtn").textContent = "Save image"; return; }
  $("#recNote").hidden = false;
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r);
  rec.start();
  const dur = 7000, t0 = performance.now();
  await new Promise(res => { const tick = t => { const p = Math.min(1, (t - t0) / (dur * 0.75)); drawFrame(p); if (t - t0 < dur) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  rec.stop(); await done;
  videoBlob = new Blob(chunks, { type: type.split(";")[0] });
  const v = $("#vid"); v.src = URL.createObjectURL(videoBlob); v.hidden = false; $("#card").hidden = true; $("#recNote").hidden = true; v.play().catch(() => {});
});
$("#closeBtn").addEventListener("click", () => { $("#modal").hidden = true; $("#vid").pause(); });
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") { $("#modal").hidden = true; $("#vid").pause(); } });
$("#dlBtn").addEventListener("click", () => {
  const save = (blob, ext) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = \`seofight-\${D.a.host}-vs-\${D.b.host}.\${ext}\`; document.body.appendChild(a); a.click(); a.remove(); toast("Saving\u2026 on a phone, long-press to save"); };
  if (saveAs === "video" && videoBlob) save(videoBlob, videoBlob.type.includes("mp4") ? "mp4" : "webm");
  else $("#card").toBlob(b => save(b, "png"));
});

if (VIEW !== "fight" && VIEW !== "home") render(D, LIVE, true);
if (location.pathname === "/") document.querySelectorAll('a[href="/pricing"]').forEach(a => a.setAttribute("href", "#pricing")); // homepage keeps the in-page jump
const q = new URLSearchParams(location.search);
if (q.get("a") && q.get("b")) { $("#a").value = q.get("a"); $("#b").value = q.get("b"); $("#duelForm").requestSubmit(); }
if (q.get("plan")) openLead(q.get("plan"));
if (q.get("deleted")) toast("Your account is deleted. Thanks for fighting with us.");
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
body { background: var(--bg); color: var(--ink); font: 400 17px/1.6 var(--f-body); -webkit-font-smoothing: antialiased }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg) }
.wrap { max-width: 1120px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)) }
a { color: inherit }
h1, h2, h3 { text-wrap: balance; margin: 0 }
.eyebrow { font: 600 14px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted) }
.display { font-family: var(--f-display); font-weight: 900; text-transform: uppercase; letter-spacing: .005em; line-height: .9 }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: 8px }

/* header */
header.top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 9; background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: saturate(1.6) blur(14px); -webkit-backdrop-filter: saturate(1.6) blur(14px); border-bottom: 1px solid var(--line) }
header.top .wrap { display: flex; align-items: center; gap: 24px; height: 60px }
.logo { display: flex; align-items: center; gap: 8px; font: 900 24px/1 var(--f-display); text-transform: uppercase; text-decoration: none; letter-spacing: .02em }
.logo i { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(90deg, var(--red) 50%, var(--blue) 50%); display: block; transform: rotate(45deg) scale(.78) }
nav.links { display: flex; gap: 22px; margin-left: auto; font-size: 15px; color: var(--muted) }
nav.links a { text-decoration: none } nav.links a:hover { color: var(--ink) }
.btn { appearance: none; border: 0; cursor: pointer; font: 600 16px/1 var(--f-body); border-radius: 999px; padding: 12px 20px; background: var(--ink); color: var(--bg); text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: transform .15s ease, opacity .15s }
.btn:hover { transform: translateY(-1px) } .btn:active { transform: none; opacity: .85 }
.btn.ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1px var(--line) }
.btn.sm { padding: 9px 16px; font-size: 15px }
@media (max-width: 720px) { nav.links { display: none } header.top .btn { margin-left: auto } }

/* hero */
.hero { padding-block: 64px 32px; text-align: center }
.hero .live { display: inline-flex; gap: 8px; align-items: center; padding: 7px 12px; border-radius: 999px; background: var(--surface); box-shadow: var(--shadow); font: 500 15px/1 var(--f-body); color: var(--muted) }
.hero .live b { width: 8px; height: 8px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 4px var(--red-soft); animation: pulse 1.6s infinite }
@keyframes pulse { 50% { box-shadow: 0 0 0 7px transparent } }
.hero h1 { font-size: clamp(56px, 11vw, 132px); margin-top: 22px }
.hero h1 .r { color: var(--red) } .hero h1 .b { color: var(--blue) }
.hero p.lede { max-width: 560px; margin: 18px auto 0; color: var(--muted); font-size: 18px }

.ring { margin: 36px auto 0; max-width: 860px; display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; background: var(--surface); padding: 12px; border-radius: 26px; box-shadow: var(--shadow) }
.corner { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 12px 16px; border-radius: 16px; min-width: 0 }
.corner.red { background: var(--red-soft) } .corner.blue { background: var(--blue-soft) }
.corner label { font: 600 13px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase }
.corner.red label { color: var(--red) } .corner.blue label { color: var(--blue) }
.corner input { border: 0; background: transparent; font: 600 19px/1.3 var(--f-body); color: var(--ink); width: 100%; padding: 4px 0; outline: none }
.corner input::placeholder { color: color-mix(in srgb, var(--ink) 35%, transparent) }
.vs { align-self: center; font: 900 30px/1 var(--f-display); color: var(--muted); padding-inline: 4px }
.fight { grid-column: 1 / -1; justify-content: center; font: 900 26px/1 var(--f-display); text-transform: uppercase; letter-spacing: .04em; padding: 18px; border-radius: 16px; background: linear-gradient(90deg, var(--red), color-mix(in srgb, var(--red) 50%, var(--blue)), var(--blue)) ; color: #fff }
.fight[disabled] { opacity: .7; cursor: progress }
.proof { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; margin-top: 18px; font-size: 15px; color: var(--muted) }
.proof span::before { content: "\u2713"; color: var(--good); font-weight: 700; margin-right: 6px }
.err { color: var(--bad); margin-top: 14px; font-weight: 500 }
@media (max-width: 640px) { .ring { grid-template-columns: 1fr } .vs { justify-self: center; padding: 2px } }

/* results */
section { padding-block: 56px }
.sec-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px }
.sec-head h2 { font-size: clamp(40px, 6vw, 64px) }
.tag { font: 600 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 7px 10px; border-radius: 999px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted) }

.tape { background: var(--surface); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden }
.tape-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 32px 28px 24px }
.fighter { min-width: 0 } .fighter.b { text-align: right }
.fighter .corner-name { font: 600 13px/1 var(--f-mono); letter-spacing: .14em; text-transform: uppercase }
.fighter.a .corner-name { color: var(--red) } .fighter.b .corner-name { color: var(--blue) }
.fighter .host { font: 700 clamp(16px, 2.4vw, 22px)/1.2 var(--f-body); margin-top: 8px; overflow-wrap: anywhere }
.fighter .score { font: 900 clamp(84px, 13vw, 150px)/.85 var(--f-display); margin-top: 10px; font-variant-numeric: tabular-nums }
.fighter.a .score { color: var(--red) } .fighter.b .score { color: var(--blue) }
.belt { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; padding: 6px 12px; border-radius: 999px; background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--gold); font: 700 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase }
.center-stat { text-align: center; font: 900 22px/1 var(--f-display); color: var(--muted) }
.center-stat small { display: block; font: 500 14px/1.4 var(--f-mono); letter-spacing: .06em; margin-top: 6px; text-transform: uppercase }

.rounds { border-top: 1px solid var(--line); padding: 8px 28px 20px }
.round { display: grid; grid-template-columns: 1fr 170px 1fr; align-items: center; gap: 14px; padding-block: 12px }
.round + .round { border-top: 1px dashed var(--line) }
.round .name { text-align: center; font: 600 15px/1.2 var(--f-body) }
.round .name small { display: block; font: 500 13px/1 var(--f-mono); color: var(--muted); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px }
.bar { height: 10px; border-radius: 999px; background: var(--line); position: relative; overflow: hidden }
.bar > i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; transition: width .9s cubic-bezier(.2,.8,.2,1) }
.bar.a { transform: scaleX(-1) } .bar.a > i { background: var(--red) } .bar.b > i { background: var(--blue) }
.round .val { font: 600 15px/1 var(--f-mono); font-variant-numeric: tabular-nums; display: flex; gap: 10px; align-items: center }
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
.panel .sub { color: var(--muted); font-size: 15px; margin: 0 0 14px }

.tbl-wrap { overflow-x: auto; margin-inline: -6px }
table { width: 100%; border-collapse: collapse; font-size: 15px; min-width: 460px }
th { font: 600 13px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .1em; color: var(--muted); text-align: left; padding: 10px 6px; border-bottom: 1px solid var(--line) }
td { padding: 9px 6px; border-bottom: 1px solid var(--line); vertical-align: middle }
td.v { font-family: var(--f-mono); font-size: 15px; font-variant-numeric: tabular-nums }
tr.cat td { font: 700 13px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .12em; color: var(--muted); padding-top: 18px; border-bottom: 0 }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: 1px }
.dot.good { background: var(--good) } .dot.warn { background: var(--warn) } .dot.bad { background: var(--bad) }
.edge { font: 700 13px/1 var(--f-mono); padding: 4px 7px; border-radius: 6px; white-space: nowrap }
.edge.a { background: var(--red-soft); color: var(--red) } .edge.b { background: var(--blue-soft); color: var(--blue) }
.new { font: 700 12px/1 var(--f-mono); letter-spacing: .08em; padding: 3px 6px; border-radius: 5px; background: color-mix(in srgb, var(--gold) 18%, transparent); color: var(--gold); margin-left: 6px; vertical-align: 1px }

.plan { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px }
.plan li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; padding: 14px; border-radius: 14px; background: var(--bg) }
.plan .sev { font: 700 12px/1 var(--f-mono); letter-spacing: .08em; padding: 5px 7px; border-radius: 6px; text-transform: uppercase; margin-top: 2px }
.sev.bad { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad) }
.sev.warn { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn) }
.plan b { display: block; font-weight: 600 } .plan p { margin: 2px 0 0; color: var(--muted); font-size: 15px }
.plan .gain { font: 700 15px/1 var(--f-mono); color: var(--good); white-space: nowrap; margin-top: 3px }
.watch { margin-top: 14px; padding: 16px; border-radius: 14px; box-shadow: inset 0 0 0 1px var(--line); display: grid; gap: 6px }
.watch p { margin: 0; color: var(--muted); font-size: 15px }
.wrow { display: flex; gap: 8px; margin-top: 4px } .wrow input { flex: 1; min-width: 0; border: 0; border-radius: 999px; padding: 10px 14px; background: var(--bg); color: var(--ink); font: 500 16px var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.seo-sum { color: var(--muted); max-width: 760px } .seo-sum h2 { font: 800 30px/1.1 var(--f-display); text-transform: uppercase; color: var(--ink); margin-bottom: 10px }
.board { display: grid; gap: 10px } .bout { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 16px 20px; border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); text-decoration: none }
.bout:hover { transform: translateY(-1px) } .bout .h { font-weight: 600; overflow-wrap: anywhere; min-width: 0 } .bout .h.b { text-align: right }
.bout .s { font: 900 34px/1 var(--f-display); font-variant-numeric: tabular-nums; display: flex; gap: 10px } .bout .s .ra { color: var(--red) } .bout .s .rb { color: var(--blue) } .bout .s i { font-style: normal; color: var(--muted); font-size: 20px; align-self: center }
.rivals-q { margin: 14px 0 0; color: var(--muted); font-size: 16px } .linkbtn { appearance: none; border: 0; background: none; color: var(--ink); font: 600 16px var(--f-body); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 0 }
.rival-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 12px } .rival-list button { border: 0; cursor: pointer; padding: 8px 14px; border-radius: 999px; background: var(--blue-soft); color: var(--blue); font: 600 15px var(--f-body) }
.ai-out { margin-top: 14px; padding: 16px; border-radius: 14px; background: var(--bg); font-size: 16px; white-space: pre-wrap; overflow-wrap: anywhere }
.agent { margin-top: 14px; padding: 16px; border-radius: 14px; background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)); display: flex; gap: 12px; align-items: center; flex-wrap: wrap }
.agent p { margin: 0; flex: 1 1 220px; font-size: 15px } .agent b { display: block; font-size: 16px }

/* features */
.feats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px }
.feat { padding: 22px; border-radius: 20px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line) }
.feat .k { font: 900 44px/1 var(--f-display); }
.feat h3 { font: 600 17px/1.3 var(--f-body); margin: 12px 0 6px }
.feat p { margin: 0; color: var(--muted); font-size: 16px }
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
.price .pill { position: absolute; top: -12px; left: 26px; background: var(--red); color: #fff; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 6px 10px; border-radius: 999px }
.price h3 { font: 800 26px/1 var(--f-display); text-transform: uppercase }
.price .amt { font: 900 64px/.9 var(--f-display); font-variant-numeric: tabular-nums } .price .amt small { font: 500 16px var(--f-body); color: var(--muted); margin-left: 4px }
.price ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; font-size: 16px; flex: 1 }
.price li::before { content: "\u2713"; color: var(--good); font-weight: 700; margin-right: 8px }
.price .btn { justify-content: center }
.price.pop .btn { background: var(--red); color: #fff }
@media (max-width: 860px) { .prices { grid-template-columns: 1fr } }

details { background: var(--surface); border-radius: 16px; padding: 18px 20px; box-shadow: inset 0 0 0 1px var(--line) }
details + details { margin-top: 10px }
summary { cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px }
summary::after { content: "+"; font: 500 20px/1 var(--f-mono); color: var(--muted) } details[open] summary::after { content: "\u2013" }
details p { margin: 10px 0 0; color: var(--muted) }
footer { padding-block: 40px 56px; color: var(--muted); font-size: 15px; border-top: 1px solid var(--line); margin-top: 32px }
footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px }

/* fight card modal */
.modal { position: fixed; inset: 0; z-index: 20; background: rgba(5,7,12,.72); backdrop-filter: blur(8px); display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)) }
.modal .box { background: var(--surface); border-radius: 24px; padding: 18px; display: grid; gap: 14px; max-height: 100%; overflow: auto; width: min(420px, 100%) }
.modal canvas { width: 100%; height: auto; border-radius: 14px; display: block; aspect-ratio: 9 / 16; max-width: 100% }
.modal .row { display: flex; gap: 8px; flex-wrap: wrap } .modal .row .btn { flex: 1; justify-content: center }
.toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 12px 18px; border-radius: 999px; font-weight: 600; font-size: 15px; z-index: 30 }
.loading .tape, .loading .grid2 { opacity: .45; filter: saturate(.4); transition: opacity .2s }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }

/* ---- views ---- */
html[data-view=home] #fight, html[data-view=home] .seo-sum { display: none }
html[data-view=pricing] #test, html[data-view=pricing] #night, html[data-view=pricing] #maincard, html[data-view=pricing] #fight, html[data-view=pricing] #why, html[data-view=pricing] .seo-sum { display: none }
html[data-view=pricing] #pricing { padding-top: 8px } html[data-view=pricing] #pricing .sec-head h2 { display: none }
html[data-view=fight] #maincard, html[data-view=fight] #night, html[data-view=fight] #testYours { display: none }
html[data-view=fight]:not([data-revealed]) #sealed, html[data-view=fight]:not([data-revealed]) .seo-sum { display: none }
/* ---- main card posters ---- */
.cat-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px }
.chip { border: 0; cursor: pointer; padding: 9px 14px; border-radius: 999px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); font: 600 15px var(--f-body) }
.chip.on { background: var(--ink); color: var(--bg); box-shadow: none }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px }
@media (max-width: 900px) { .cards { grid-template-columns: repeat(2, 1fr) } }
@media (max-width: 560px) { .cards { grid-template-columns: 1fr } }
.poster { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 34px 18px 18px; min-height: 270px; border-radius: 24px; text-decoration: none; color: #fff; overflow: hidden; min-width: 0;
  background: radial-gradient(110% 90% at 0% 30%, rgba(255,59,78,.38), transparent 60%), radial-gradient(110% 90% at 100% 70%, rgba(61,107,255,.38), transparent 60%), #0b0d13; transition: transform .2s ease }
.poster:hover { transform: translateY(-3px) }
.pc-cat { position: absolute; top: 14px; left: 16px; font: 600 13px/1 var(--f-mono); letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.6) }
.pc-a, .pc-b { font: 900 clamp(40px, 5vw, 60px)/.88 var(--f-display); text-transform: uppercase; max-width: 100%; overflow-wrap: anywhere }
.pc-a { color: #ff4d5e } .pc-b { color: #6b8fff }
.pc-vs { font: 900 30px/1 var(--f-display); margin: 6px 0 }
.pc-foot { display: flex; justify-content: space-between; gap: 8px; width: 100%; margin-top: 18px; font: 500 15px/1.2 var(--f-body); color: rgba(255,255,255,.7) }
.pc-foot b { color: #fff; font-weight: 700 }
.more { text-align: center; margin-top: 22px }
/* ---- pick your champion ---- */
.gate { text-align: center; padding: 44px 20px; border-radius: 28px; background: var(--surface); box-shadow: var(--shadow) }
.gate h2 { font-size: clamp(46px, 8vw, 88px); margin: 12px 0 26px }
.picks { display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; align-items: center; max-width: 780px; margin: 0 auto }
.pick { border: 0; cursor: pointer; padding: 28px 16px; border-radius: 22px; color: #fff; font: 900 clamp(28px, 4.4vw, 48px)/1 var(--f-display); text-transform: uppercase; overflow-wrap: anywhere; transition: transform .15s ease }
.pick.a { background: var(--red) } .pick.b { background: var(--blue) }
.pick:hover { transform: scale(1.03) } .pick:active { transform: scale(.98) }
.pvs { font: 900 30px/1 var(--f-display); color: var(--muted) }
.gate-note { color: var(--muted); margin: 20px 0 8px }
.unlock h2 { margin-bottom: 6px }
.unlock-row { display: flex; gap: 10px; max-width: 560px; margin: 18px auto 10px }
.unlock-row input { flex: 1; min-width: 0; border: 0; border-radius: 16px; padding: 18px; background: var(--bg); color: var(--ink); font: 500 18px var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.unlock-row .btn { padding: 18px 28px; font-size: 24px; border-radius: 16px }
.fine { color: var(--muted); font-size: 15px; margin: 0 }
@media (max-width: 560px) { .unlock-row { flex-direction: column } }
@media (max-width: 560px) { .picks { grid-template-columns: 1fr } }
.verdict { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; justify-content: center; text-align: center; padding: 16px 20px; border-radius: 18px; margin-bottom: 22px }
.verdict b { font: 900 30px/1 var(--f-display); text-transform: uppercase }
.verdict.win { background: color-mix(in srgb, var(--good) 15%, transparent) }
.verdict.lose { background: color-mix(in srgb, var(--gold) 18%, transparent) }
/* ---- badge, fix-it, sign-up ---- */
.badge-prev { padding: 14px; border-radius: 14px; background: var(--bg); display: flex; justify-content: center; margin-bottom: 12px }
pre.code { margin: 0 0 12px; padding: 12px; border-radius: 12px; background: var(--bg); color: var(--muted); font: 14px/1.5 var(--f-mono); white-space: pre-wrap; overflow-wrap: anywhere }
.fixit { display: flex; flex-direction: column; justify-content: center; background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)) }
.fixit .btn { align-self: flex-start; padding: 16px 26px; font-size: 22px }
.lead { display: grid; gap: 12px; width: min(440px, 100%) }
.lead h3 { font-size: 46px }
.lead p { margin: 0; color: var(--muted) }
.lead input { border: 0; border-radius: 12px; padding: 14px; background: var(--bg); color: var(--ink); font: 500 16px var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.lead .linkbtn { justify-self: center; font-size: 15px; color: var(--muted) }
.modal video { width: 100%; border-radius: 14px; aspect-ratio: 9 / 16; background: #000 }
.rec { margin: 0; text-align: center; color: var(--muted); font: 600 15px var(--f-mono) }
.prices { grid-template-columns: repeat(4, 1fr) }
@media (max-width: 1100px) { .prices { grid-template-columns: repeat(2, 1fr) } }
@media (max-width: 620px) { .prices { grid-template-columns: 1fr } }
.price.agency { box-shadow: 0 0 0 2px var(--blue), var(--shadow) }
.price.agency .btn { background: var(--blue); color: #fff }
.final { text-align: center; color: var(--muted); font-size: 15px; margin: 18px auto 0; max-width: 640px } .final a { color: inherit }
footer a { color: inherit }
.nc-checks { position: relative; border-radius: 18px; overflow: hidden; background: rgba(255,255,255,.04) }
.nc-checks.open .ncc-grid { filter: none; user-select: text; pointer-events: auto; grid-template-columns: 1fr; max-height: 420px; overflow: auto }
.ncc-head { display: grid; grid-template-columns: 1fr 150px 150px; gap: 10px; padding: 12px 16px 6px; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: #f2c14e }
.ncc-head .ncc-hh:nth-child(2) { color: #ff3b4e } .ncc-head .ncc-hh:nth-child(3) { color: #5b82ff }
.nc-checks.open .ncc-row { grid-template-columns: 1fr 150px 150px }
.ncc-cat { padding: 12px 0 4px; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.45) }
.ncc-v { display: flex; gap: 6px; align-items: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis } .ncc-v.w { color: #fff; font-weight: 700 }
.ncc-v .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #f2c14e } .ncc-v .dot.good { background: #22c55e } .ncc-v .dot.bad { background: #ef4444 }
.nc-note { margin: 0; text-align: center; font-size: 15px; color: rgba(255,255,255,.6) }
@media (max-width: 640px) { .ncc-head, .nc-checks.open .ncc-row { grid-template-columns: 1fr 88px 88px; gap: 6px } .ncc-row { font-size: 14px } }
.ncc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; padding: 14px 16px; filter: blur(5px); user-select: none; pointer-events: none }
.ncc-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 15px }
.ncc-l { color: rgba(255,255,255,.85) } .ncc-v { color: rgba(255,255,255,.6); font-family: var(--f-mono) }
.ncc-lock { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 6px; text-align: center; padding: 16px; background: linear-gradient(180deg, rgba(11,13,19,.35), rgba(11,13,19,.85)) }
.ncc-lock .ncc-ico { font-size: 26px } .ncc-lock b { font: 800 clamp(22px, 3.4vw, 30px)/1 var(--f-display); text-transform: uppercase } .ncc-lock span { color: rgba(255,255,255,.7); font-size: 15px } .ncc-lock .btn { margin-top: 6px }
@media (max-width: 640px) { .ncc-grid { grid-template-columns: 1fr } }

.hero h1 .l1 { display: block; white-space: nowrap }
.hero h1 .rot { position: relative; display: block; height: 1.05em; overflow: hidden }
.hero h1 .rot-in { position: absolute; inset: 0; display: block; white-space: nowrap; transition: transform .55s cubic-bezier(.2,.8,.2,1), opacity .55s; line-height: 1.05 }
.hero h1 .rot-in.enter { transform: translateY(100%); opacity: 0 } .hero h1 .rot-in.leave { transform: translateY(-100%); opacity: 0 }
.hero h1 .rot-in small { font-size: .42em; color: var(--muted); vertical-align: middle; margin: 0 .1em }
.test-wrap { padding-block: 0 28px } #test { padding-top: 0 } #night { padding-top: 0 }

.tonight { display: inline-grid; justify-items: center; gap: 6px; margin: 22px auto 4px; padding: 16px 26px; border-radius: 24px; background: #0b0d13; color: #fff; text-decoration: none; box-shadow: 0 20px 60px rgba(11,13,19,.25); outline: 2px solid #f2c14e; outline-offset: -2px }
.tonight .tn-tag { font: 700 14px/1 var(--f-mono); letter-spacing: .12em; text-transform: uppercase; color: #f2c14e }
.tonight .tn-m { font: 800 clamp(30px, 6vw, 52px)/1 var(--f-display); text-transform: uppercase; display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; justify-content: center }
.tonight .tn-m .r { color: #ff3b4e } .tonight .tn-m .b { color: #5b82ff } .tonight .tn-m i { font-style: normal; font-size: .45em; color: rgba(255,255,255,.55) }
.tonight .tn-go { font-size: 15px; color: rgba(255,255,255,.7) }
.test-yours { margin: 26px 0 0; font: 800 clamp(20px, 3vw, 26px)/1.1 var(--f-display); text-transform: uppercase; color: var(--ink) }
.test-yours + .ring { margin-top: 14px; outline: 3px solid transparent; box-shadow: 0 0 0 3px rgba(224,38,58,.18), 0 24px 70px rgba(36,87,245,.18) }
#night { padding-block: 8px 24px }
.night-card { background: #0b0d13; color: #fff; border-radius: 28px; padding: 22px; display: grid; gap: 18px; outline: 2px solid #f2c14e; outline-offset: -2px }
.nc-head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font: 700 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase } .nc-tag { color: #f2c14e } .nc-votes { color: rgba(255,255,255,.55) }
.nc-tape { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; text-align: center }
.nc-f { display: grid; gap: 4px; opacity: .75 } .nc-f.won { opacity: 1 }
.nc-host { font: 800 clamp(22px, 4vw, 34px)/1 var(--f-display); text-transform: uppercase }
.nc-f.a .nc-host, .nc-f.a .nc-score { color: #ff3b4e } .nc-f.b .nc-host, .nc-f.b .nc-score { color: #5b82ff }
.nc-score { font: 800 clamp(56px, 10vw, 96px)/1 var(--f-display) } .nc-belt { font: 700 14px/1 var(--f-mono); color: #f2c14e; letter-spacing: .1em; text-transform: uppercase; min-height: 12px }
.nc-vs { font: 800 20px var(--f-display); color: rgba(255,255,255,.4) }
.nc-rounds { display: grid; gap: 8px }
.nr { display: grid; grid-template-columns: 34px 1fr 96px 1fr 34px; gap: 10px; align-items: center; font-size: 15px }
.nr .v { font-weight: 700; color: rgba(255,255,255,.55); text-align: center } .nr .v.w { color: #fff } .nr .nm { text-align: center; color: rgba(255,255,255,.7); font: 600 13px/1 var(--f-mono); text-transform: uppercase; letter-spacing: .08em }
.nr .bar { height: 8px; border-radius: 99px; background: rgba(255,255,255,.1); overflow: hidden; display: flex } .nr .bar.a { justify-content: flex-end } .nr .bar i { display: block; height: 100%; border-radius: 99px } .nr .bar.a i { background: #ff3b4e } .nr .bar.b i { background: #5b82ff }
.nc-cta { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center } .night-card .btn.ghost { color: #fff; border-color: rgba(255,255,255,.3); background: transparent }
@media (max-width: 640px) { .nr { grid-template-columns: 26px 1fr 70px 1fr 26px; gap: 6px } }

.upsell { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 26px }
.upsell .up { position: relative; padding-top: 30px; border: 2px solid transparent; display: grid; align-content: start; gap: 12px } .upsell .up .sub { margin: 0 } .upsell .up .btn { justify-self: start } .upsell .badge-prev img { width: 280px; height: 72px }
.upsell .up.fixit { border-color: var(--red, #e0263a); box-shadow: 0 18px 50px rgba(224,38,58,.18) }
.upsell .up.champ { border-color: #f2c14e }
.upsell .up h3 { font-size: 30px }
.upsell .up-tag { position: absolute; top: -12px; left: 20px; background: var(--red, #e0263a); color: #fff; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 6px 10px; border-radius: 999px }
.upsell .up-tag.gold { background: #f2c14e; color: #0b0d13 }
.upsell .up.first { order: -1 }
@media (max-width: 760px) { .upsell { grid-template-columns: 1fr } }
.price .pill.gold { background: #f2c14e; color: #0b0d13; left: auto; right: 22px }

.btn.google { display: inline-flex; gap: 10px; align-items: center; justify-content: center; background: #fff; color: #1f1f1f; border: 1px solid #dadce0; font-weight: 600 } .gate .btn.google { margin-top: 10px }
.poster.night { outline: 3px solid #f2c14e; outline-offset: -3px } .poster.night .pc-cat { background: #f2c14e; color: #0b0d13 }
footer .fcols { display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: 24px }
footer .fcols > div { display: grid; gap: 8px; align-content: start }
footer .fcols b { color: var(--ink); font-size: 15px }
footer .fcols a { text-decoration: none } footer .fcols a:hover { color: var(--ink) }
footer .fbrand span { font-size: 15px } footer .xlink { color: var(--ink) !important; display: inline-flex; align-items: center; gap: 10px; margin-top: 6px; padding: 8px 14px 8px 8px; border-radius: 999px; background: var(--surface); box-shadow: var(--shadow); justify-self: start } footer .xlink img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 2px #f2c14e } footer .xlink span { display: grid; line-height: 1.25 } footer .xlink b { font-size: 15px } footer .xlink small { font-size: 14px; color: var(--muted) }
footer .fcopy { margin-top: 24px; font-size: 15px }
@media (max-width: 760px) { footer .fcols { grid-template-columns: 1fr 1fr } footer .fbrand { grid-column: 1 / -1 } }
.cards-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px }
a.panel.post { text-decoration: none; color: inherit; display: grid; gap: 6px; transition: transform .15s } a.panel.post:hover { transform: translateY(-2px) }
a.panel.post h3 { font-size: 22px; line-height: 1.1 }
.post-body ul, .post-body ol { padding-left: 20px } .post-body li { margin: 6px 0 }
.about .founder { display: flex; gap: 14px; align-items: center; margin-bottom: 8px } .about .founder > div { display: grid }
.about .ava { width: 72px; height: 72px; object-fit: cover; box-shadow: 0 0 0 3px #fff, 0 0 0 5px #f2c14e; border-radius: 50%; display: grid; place-items: center; font: 800 26px var(--f-display); color: #fff; background: linear-gradient(135deg, var(--red, #e0263a), var(--blue, #2457f5)) }
.contact .field { display: grid; gap: 6px } .contact textarea, .contact select { font: inherit; padding: 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink) }
.price .left { color: var(--red, #e0263a); font-weight: 700 }


/* ===== 2026 polish: fight-poster type, arena navy, belt gold, punch buttons ===== */
:root { --bg: #EEF0F3; --ink: #10131A; --red: #E1232E; --blue: #1D4ED8; --gold: #E8B21C; --arena: #0F1B3D; --arena-2: #172654;
  --punch: 4px 4px 0 var(--ink) }
.logo { gap: 4px; font-size: 26px; letter-spacing: .01em } .logo .gloves { width: 40px; height: 25px; display: block; margin: 0 1px } .logo i { display: none }
.logo:hover .gloves { animation: touch .5s ease } @keyframes touch { 40% { transform: scaleX(.86) } }
.hero { padding-block: 52px 8px } .hero.test-wrap { padding-top: 0; padding-bottom: 28px } #test .test-yours { margin-top: 24px }
form.panel, .tool form.panel { border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink) }
.hero h1 { letter-spacing: -.005em }
/* the ring: hard edge, punch shadow */
.ring { border-radius: 22px; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink) !important; outline: 0 !important }
.corner { border-radius: 14px }
.fight { background: var(--red) !important; color: #fff; border-radius: 14px; box-shadow: var(--punch); border: 2px solid var(--ink); transition: transform .08s ease, box-shadow .08s ease }
.fight:hover { transform: translate(-1px, -1px); box-shadow: 5px 5px 0 var(--ink) }
.fight:active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--ink); opacity: 1 }
.night-card .fight, .upsell .fight { border-color: #fff; box-shadow: 4px 4px 0 #fff }
.night-card .fight:active, .upsell .fight:active { box-shadow: 0 0 0 #fff }
.test-yours { font-size: clamp(24px, 3.6vw, 34px); letter-spacing: .01em; margin-top: 8px }
/* arena navy instead of black */
.night-card { background: radial-gradient(120% 80% at 50% 0%, var(--arena-2), var(--arena) 70%); outline: 3px solid var(--gold); border-radius: 26px; box-shadow: 8px 8px 0 var(--ink) }
.nc-tag, .ncc-head { color: var(--gold) } .nc-belt { color: var(--gold) }
.nc-checks { background: rgba(255,255,255,.05) }
.poster { box-shadow: 5px 5px 0 var(--ink); border: 2px solid var(--ink) }
.poster.night { outline-color: var(--gold) }
.price { border: 2px solid var(--ink); box-shadow: 5px 5px 0 var(--ink) } .price.pop { border-color: var(--red); box-shadow: 5px 5px 0 var(--red) } .price.agency { border-color: var(--blue); box-shadow: 5px 5px 0 var(--blue) }
.price .pill.gold { background: var(--gold); color: var(--ink) }
.btn:not(.fight):not(.ghost):not(.google) { border: 2px solid var(--ink) }
@media (prefers-reduced-motion: reduce) { .fight, .logo .gloves { transition: none; animation: none } }
/* ===== prospect cards (homepage hunt mode, /agency, account) ===== */
.prospects { display: grid; gap: 14px; margin-top: 14px } .prospect { border: 2px solid var(--ink); border-radius: 16px; padding: 16px; display: grid; gap: 8px; background: var(--surface) }
.pr-top { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap } .pr-score i { font-style: normal; font-weight: 800 } .pr-score .r { color: var(--red) } .pr-score .b { color: var(--blue) }
.prospect .pitch { white-space: pre-wrap; max-height: 220px; overflow: auto; margin: 0 } .pr-act { display: flex; gap: 8px; flex-wrap: wrap }
pre.out { margin: 0; padding: 18px; border-radius: 16px; background: #0d1017; color: #e8ebf2; font: 15px/1.6 var(--f-mono); overflow-x: auto; white-space: pre; min-height: 160px }
/* ===== signed-in: header avatar, mode switch, ringside bar, your corner, hunt mode ===== */
header.top .btn.sm.hdr-fight { background: var(--red); color: #fff; border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); transition: transform .08s, box-shadow .08s }
header.top .btn.sm.hdr-fight:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--ink) } header.top .btn.sm.hdr-fight:active { transform: translate(3px, 3px); box-shadow: 0 0 0 var(--ink); opacity: 1 }
.avatar { flex: none; width: 38px; height: 38px; margin-left: -12px; border-radius: 50%; display: grid; place-items: center; text-decoration: none; color: #fff; font: 900 21px/1 var(--f-display); text-transform: uppercase; background: linear-gradient(135deg, var(--red) 50%, var(--blue) 50%); border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); transition: transform .08s, box-shadow .08s }
.avatar:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--ink) }
.modes { display: flex; width: max-content; max-width: 100%; gap: 4px; padding: 4px; margin: 16px auto 0; border-radius: 999px; background: var(--surface); border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink) }
.modes button { appearance: none; border: 0; cursor: pointer; border-radius: 999px; padding: 10px 16px; background: transparent; color: var(--ink); font: 600 16px/1 var(--f-body); display: inline-flex; align-items: center; gap: 8px; white-space: nowrap }
.modes button[aria-selected="true"][data-mode="fight"] { background: var(--red); color: #fff } .modes button[aria-selected="true"][data-mode="hunt"] { background: var(--blue); color: #fff }
.ag-tag { font: 700 12px/1 var(--f-mono); letter-spacing: .08em; text-transform: uppercase; padding: 4px 6px; border-radius: 6px; background: var(--gold); color: var(--ink) }
.modes ~ .ring { margin-top: 16px }
@media (max-width: 420px) { .modes button { padding: 10px 11px; font-size: 15px; gap: 6px } }
.ring.hunt .hunt-row { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(180px, 260px) 1fr; gap: 12px }
.ring.hunt .fight { grid-column: auto; background: var(--blue) !important }
.corner.gold { position: relative; background: color-mix(in srgb, var(--gold) 20%, transparent) } .corner.gold::after { content: "\u25BE"; position: absolute; right: 16px; bottom: 15px; font-size: 16px; color: var(--ink); pointer-events: none } .corner.gold label { color: color-mix(in srgb, var(--gold) 45%, var(--ink)) }
.corner select { border: 0; background: transparent; font: 600 17px/1.3 var(--f-body); color: var(--ink); width: 100%; padding: 4px 0; outline: none; appearance: none; cursor: pointer }
@media (max-width: 640px) { .ring.hunt .hunt-row { grid-template-columns: 1fr } }
.ringside { display: flex; align-items: center; justify-content: center; gap: 6px 10px; flex-wrap: wrap; max-width: 860px; margin: 14px auto 0; padding: 9px 14px; border-radius: 14px; background: var(--surface); border: 2px solid var(--ink); font: 500 15px/1.35 var(--f-body) }
.ringside a { color: inherit; text-decoration: none } .ringside .main { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center } .ringside .main:hover .txt { text-decoration: underline; text-underline-offset: 3px }
.ringside .pl { font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; padding: 5px 8px; border-radius: 6px; background: var(--ink); color: var(--bg) }
.ringside .pl.pro { background: var(--red); color: #fff } .ringside .pl.agency, .ringside .pl.owner { background: var(--blue); color: #fff } .ringside .pl.lifetime { background: var(--gold); color: var(--ink) }
@media (max-width: 560px) { .ringside { font-size: 15px; padding: 9px 10px; gap: 6px } .ringside .go, .ringside .sep.g { display: none } }
.ringside b { font-variant-numeric: tabular-nums } .ringside .sep { color: var(--muted) } .ringside .up { font-weight: 700; color: var(--red); text-decoration: underline; text-underline-offset: 3px } .ringside .go { color: var(--muted) }
.corner-strip, .hunt-zone { max-width: 860px; margin: 24px auto 0; text-align: left }
.cs-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px } .cs-head .eyebrow { color: var(--ink) } .cs-head a { font-size: 15px; color: var(--muted); text-decoration: none } .cs-head a:hover { color: var(--ink) }
.cs-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px }
.mini { display: grid; gap: 10px; padding: 14px; border-radius: 18px; color: #fff; border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); min-width: 0;
  background: radial-gradient(110% 90% at 0% 0%, rgba(225,35,46,.42), transparent 60%), radial-gradient(110% 90% at 100% 100%, rgba(29,78,216,.5), transparent 60%), var(--arena) }
.mini-link { display: grid; gap: 2px; text-decoration: none; color: inherit }
.mini-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; min-width: 0 }
.mh { font: 800 21px/1.1 var(--f-display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0 } .mh.w::before { content: "\u2605 "; color: var(--gold) }
.ms { font: 900 34px/1 var(--f-display); font-variant-numeric: tabular-nums } .a.mh, .a.ms { color: #ff5a66 } .b.mh, .b.ms { color: #8aa6ff }
.mvs { font: 700 12px/1 var(--f-mono); letter-spacing: .14em; color: rgba(255,255,255,.45) }
.mini-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid rgba(255,255,255,.14); padding-top: 10px; font: 500 14px/1.3 var(--f-mono); color: rgba(255,255,255,.72) }
.mini .rematch { flex: none; background: var(--red); color: #fff; border: 2px solid #fff !important; box-shadow: 3px 3px 0 #fff; padding: 7px 12px; font-size: 15px; font-weight: 700 }
.mini .rematch:active { transform: translate(3px, 3px); box-shadow: none }
@media (max-width: 760px) { .cs-list { grid-auto-flow: column; grid-template-columns: none; grid-auto-columns: 82%; overflow-x: auto; scroll-snap-type: x mandatory; padding: 2px 8px 10px 2px; margin-right: -16px; scrollbar-width: none } .cs-list::-webkit-scrollbar { display: none } .mini { scroll-snap-align: start } }
.hz-msg { margin: 0 0 12px; text-align: center; color: var(--muted) }
.rh-list { display: grid; gap: 10px }
details.rh { padding: 0; border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); border-radius: 14px; background: var(--surface) } details.rh + details.rh { margin-top: 0 }
details.rh > summary { padding: 13px 16px; align-items: center } details.rh > summary > span { display: flex; gap: 6px 12px; flex-wrap: wrap; align-items: baseline } details.rh small { color: var(--muted); font: 500 14px/1.2 var(--f-mono) }
details.rh .prospects { padding: 0 12px 12px; margin-top: 0 }
#huntOut { margin-bottom: 22px } #huntOut .prospects { margin-top: 0 }
/* ===== tease, then lock ===== */
.grid2.teased { position: relative; min-height: 520px }
.grid2.teased > .panel { filter: blur(6px); user-select: none; -webkit-user-select: none; pointer-events: none }
.lockcard { position: absolute; z-index: 3; top: 28px; left: 50%; transform: translateX(-50%); width: min(460px, calc(100% - 24px)); background: var(--surface); border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); border-radius: 22px; padding: 24px; display: grid; gap: 12px; text-align: center; justify-items: center }
.lockcard[hidden] { display: none !important }
.lockcard .eyebrow { color: var(--red) } .lockcard h3 { font-size: clamp(34px, 5vw, 46px); line-height: .95; margin: 0 }
.lockcard p { margin: 0; color: var(--muted); font-size: 16px } .lockcard p b { color: var(--ink) }
.lk-btns { display: grid; gap: 10px; width: 100%; margin-top: 4px } .lk-btns .btn { justify-content: center; width: 100% } .lockcard .btn.fight { font-size: 22px; padding: 15px }
.lk-fine { font: 600 14px/1 var(--f-mono) !important; letter-spacing: .1em; text-transform: uppercase }
@media (max-width: 560px) { .lockcard { top: 16px; padding: 20px 16px } }
.pc-vs i { font-style: normal } .pc-vs .ra { color: #ff5a66 } .pc-vs .rb { color: #8aa6ff }
/* ===== avatar menu ===== */
header.top .wrap { position: relative }
button.avatar { appearance: none; cursor: pointer; padding: 0 }
.avmenu { position: absolute; top: 56px; right: max(16px, env(safe-area-inset-right, 0px)); z-index: 30; min-width: 230px; background: var(--surface); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); border-radius: 16px; padding: 6px; display: grid }
.avmenu[hidden] { display: none !important }
.avmenu .who { padding: 10px 12px 10px; font: 500 15px/1.3 var(--f-body); color: var(--muted); border-bottom: 1px solid var(--line); margin-bottom: 4px; overflow-wrap: anywhere }
.avmenu .who b { display: block; color: var(--ink); font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 5px }
.avmenu a { padding: 12px; border-radius: 10px; text-decoration: none; font: 600 16px/1 var(--f-body); color: var(--ink) } .avmenu a:hover, .avmenu a:focus-visible { background: var(--bg) }
.avmenu a.out { color: var(--red); border-top: 1px solid var(--line); border-radius: 0 0 10px 10px; margin-top: 4px }
/* ===== footer ===== */
footer .fcopy { display: flex; gap: 8px 18px; flex-wrap: wrap } footer .fcopy a { text-decoration: none } footer .fcopy a:hover { color: var(--ink) }
footer .fdisc { margin-top: 8px; font-size: 14px; line-height: 1.5; max-width: 760px; margin-left: auto; margin-right: auto; color: var(--muted) }
@media (min-width: 1153px) { footer .fdisc { padding-left: 16px; padding-right: 16px; max-width: 1120px } }
/* ===== tools: first lines clear, rest locked ===== */
.gen-out { position: relative }
html:not([data-me]) .gen-out pre.out { min-height: 400px; overflow: hidden }
.gen-lock { position: absolute; left: 0; right: 0; top: 143px; bottom: 0; border-radius: 0 0 16px 16px; display: grid; place-items: center; padding: 16px; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); background: linear-gradient(180deg, rgba(13,16,23,.15), rgba(13,16,23,.55)) }
html[data-me] .gen-lock { display: none }
.gen-lock .lockcard { position: static; transform: none; width: min(340px, 100%); padding: 18px; box-shadow: 4px 4px 0 var(--ink); gap: 10px }
.gen-lock .lockcard h3 { font-size: 30px }
.gen-lock .lockcard .btn.fight { font-size: 19px; padding: 12px }

/* ===== big rivalries: guess-the-winner posters ===== */
#maincard .cat-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-inline: -4px; padding: 4px 4px 6px; scroll-snap-type: x proximity }
#maincard .cat-chips::-webkit-scrollbar { display: none }
#maincard .chip { flex: none; scroll-snap-align: start; min-height: 40px }
#maincard .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px }
@media (max-width: 1040px) { #maincard .cards { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
@media (max-width: 640px) {
  #maincard .cards { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; margin-inline: -16px; padding: 4px 16px 14px; scrollbar-width: none }
  #maincard .cards::-webkit-scrollbar { display: none }
  #maincard .pg { flex: 0 0 78%; scroll-snap-align: center }
  html.fights-page #maincard .cards { display: grid; grid-template-columns: 1fr; margin-inline: 0; padding: 0 }
}
.pg { position: relative; display: grid; gap: 14px; align-content: space-between; min-height: 212px; padding: 16px; border-radius: 20px; color: #fff; border: 2px solid var(--ink); box-shadow: 5px 5px 0 var(--ink);
  background: radial-gradient(90% 70% at 0% 100%, rgba(225,35,46,.28), transparent 60%), radial-gradient(90% 70% at 100% 0%, rgba(29,78,216,.34), transparent 60%), var(--arena) }
.pg.night { outline: 3px solid var(--gold); outline-offset: -5px }
.pg-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 600 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase }
.pg-cat { color: rgba(255,255,255,.6) } .pg-q { color: var(--gold) }
.pg-sides { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: 8px }
.pg-s { position: relative; min-width: 0; min-height: 76px; padding: 10px 6px; border-radius: 14px; cursor: pointer; font: 900 var(--fs, 26px)/.95 var(--f-display); text-transform: uppercase; overflow-wrap: normal; word-break: normal; hyphens: none; color: #fff; transition: transform .12s ease, background .15s ease, opacity .15s ease }
.pg-s.a { background: rgba(225,35,46,.16); border: 2px solid #ff4d5e; color: #ff6b79 }
.pg-s.b { background: rgba(29,78,216,.2); border: 2px solid #5b84ff; color: #8aa6ff }
.pg-s:not(:disabled):hover { transform: translateY(-2px) } .pg-s:not(:disabled):active { transform: scale(.97) }
.pg-s.a.mine { background: #E1232E; border-color: #fff; color: #fff } .pg-s.b.mine { background: #1D4ED8; border-color: #fff; color: #fff }
.pg-s.mine::after { content: "\u2713"; position: absolute; top: -9px; right: -9px; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: var(--gold); color: var(--ink); font: 800 15px/1 var(--f-body); border: 2px solid var(--ink) }
.pg.picked .pg-s:not(.mine) { opacity: .4 } .pg-s:disabled { cursor: default }
.pg-s:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px }
.pg-vs { align-self: center; font: 900 18px/1 var(--f-display); color: rgba(255,255,255,.45) }
.pg-res { display: grid; gap: 8px; min-height: 54px; align-content: end }
.pg-hint { font-size: 15px; color: rgba(255,255,255,.62) }
.pg-split { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,.1) }
.pg-split i { display: block; height: 100% } .pg-split .a { background: #ff4d5e } .pg-split .b { background: #5b84ff }
.pg.just .pg-split i { animation: grow .6s ease-out both } @keyframes grow { from { width: 0 } }
.pg-row { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; color: rgba(255,255,255,.7) }
.pg-row .ra { color: #ff6b79 } .pg-row .rb { color: #8aa6ff }
.pg-go { justify-self: start; color: var(--gold); font: 700 15px/1.2 var(--f-body); text-decoration: none; padding: 6px 0 } .pg-go:hover { text-decoration: underline }
#maincard .more { margin-top: 18px }

/* ===== Rivalry of the Night: fight broadcast ===== */
.night-card.bc { gap: 20px; padding: clamp(18px, 3vw, 28px) }
.bc-top { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font: 700 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase }
.bc-main { display: grid; grid-template-columns: 1.05fr 1fr; gap: clamp(18px, 3vw, 36px); align-items: center }
.bc-board { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 10px; text-align: center }
.bc-side { display: grid; gap: 2px; transition: opacity .2s } .bc-side.lost { opacity: .55 }
.bc-name { font: 800 clamp(24px, 3.2vw, 36px)/1 var(--f-display); text-transform: uppercase; overflow-wrap: anywhere }
.bc-score { font: 800 clamp(64px, 8.5vw, 108px)/.9 var(--f-display) }
.bc-side.a .bc-name, .bc-side.a .bc-score { color: #ff4d5e } .bc-side.b .bc-name, .bc-side.b .bc-score { color: #6b8fff }
.bc-belt { min-height: 22px; justify-self: center; font: 700 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink); background: var(--gold); padding: 5px 9px; border-radius: 999px; margin-top: 6px }
.bc-belt:empty { background: none; padding: 0 }
.bc-mid { display: grid; gap: 8px; justify-items: center; padding-bottom: 30px } .bc-vs { font: 800 22px var(--f-display); color: rgba(255,255,255,.4) }
.bc-tally { font: 700 13px/1.35 var(--f-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--gold); text-align: center; max-width: 150px }
.bc-verdict { grid-column: 1 / -1; margin: 8px 0 0; font-size: 16px; color: rgba(255,255,255,.85) }
.bc-rounds { display: grid; gap: 14px }
.tg { display: grid; gap: 6px }
.tg-l { display: grid; grid-template-columns: 40px 1fr 40px; align-items: baseline }
.tg-n { text-align: center; font: 600 13px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.7) }
.tg-v { font: 800 20px/1 var(--f-display); opacity: .55 } .tg-v.a { color: #ff6b79 } .tg-v.b { color: #8aa6ff; text-align: right } .tg-v.w { opacity: 1 }
.tg-bar { position: relative; display: flex; height: 12px; border-radius: 99px; overflow: hidden; background: #5b84ff }
.tg-bar .a { display: block; height: 100%; background: #ff4d5e } .tg-bar .b { flex: 1 }
.tg-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: #fff; opacity: .85 }
.bc-h { display: block; margin-bottom: 10px; font: 700 14px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--gold) }
.ko-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px }
.ko { display: grid; gap: 6px; align-content: start; padding: 14px; border-radius: 14px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12) }
.ko-r { font: 600 12px/1 var(--f-mono); letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.5) }
.ko-l { font: 700 16px/1.2 var(--f-body) }
.ko-v { display: flex; align-items: center; gap: 0; font: 500 15px/1.3 var(--f-mono); color: rgba(255,255,255,.6); min-width: 0 } .ko-v.w { color: #fff; font-weight: 700 }
.ko-v em { font: 600 14px var(--f-body); font-style: normal; width: 76px; flex: none; color: rgba(255,255,255,.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ko-v .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: #f2c14e } .ko-v .dot.good { background: #22c55e } .ko-v .dot.bad { background: #ef4444 }
.ko p { margin: 4px 0 0; font-size: 15px; line-height: 1.4; color: rgba(255,255,255,.65) }
.bc-checks { display: grid; color: #fff; gap: 0; border-radius: 14px; background: rgba(255,255,255,.04); padding: 4px 14px 8px }
.nacc-head { display: grid; grid-template-columns: 1fr 150px 150px; gap: 10px; padding: 10px 0 4px; font: 700 13px/1 var(--f-mono); letter-spacing: .08em; text-transform: uppercase } .nacc-head .ra { color: #ff6b79 } .nacc-head .rb { color: #8aa6ff }
.nacc { background: none; box-shadow: none; border-radius: 0; padding: 0; margin: 0; border-top: 1px solid rgba(255,255,255,.1) } .nacc + .nacc { margin-top: 0 } .nacc:first-of-type { border-top: 0 } .nacc summary::after { content: none } .nacc[open] summary::after { content: none } .nacc-b { padding-bottom: 8px }
.nacc summary { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 46px; cursor: pointer; list-style: none }
.nacc summary::-webkit-details-marker { display: none }
.nacc summary::before { content: "\u25B8"; color: var(--gold); margin-right: 8px; transition: transform .15s } .nacc[open] summary::before { transform: rotate(90deg) }
.nacc-n { flex: 1; font: 800 18px/1 var(--f-display); text-transform: uppercase }
.nacc-t { font: 600 14px/1 var(--f-mono) } .nacc-t .ra { color: #ff6b79 } .nacc-t .rb { color: #8aa6ff }
.nacc-b .ncc-row { grid-template-columns: 1fr 150px 150px }
.bc-foot { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: center; justify-content: center }
.bc-all { min-height: 44px; padding: 0 18px; border-radius: 14px; border: 2px solid rgba(255,255,255,.35); background: transparent; color: #fff; font: 700 16px var(--f-body); cursor: pointer } .bc-all:hover { border-color: #fff }
.bc-full { color: rgba(255,255,255,.75); font-size: 15px }
@media (max-width: 860px) { .bc-main { grid-template-columns: 1fr } .ko-list { grid-template-columns: 1fr } }
@media (max-width: 640px) { .nacc-head, .nacc-b .ncc-row { grid-template-columns: 1fr 88px 88px; gap: 6px } .nacc-b .ncc-row { font-size: 14px } .bc-mid { padding-bottom: 26px } }
@media (prefers-reduced-motion: reduce) { .pg-s, .pg.just .pg-split i, .nacc summary::before { transition: none; animation: none } }

/* ===== footer ===== */
footer.site-foot { padding-block: 44px 40px }
footer.site-foot .ft-grid { display: grid; grid-template-columns: 1.6fr repeat(4, minmax(0, 1fr)); gap: 28px }
.ft-brand { display: grid; gap: 10px; align-content: start } .ft-brand .logo { justify-self: start; color: var(--ink); text-decoration: none }
.ft-tag { margin: 0; font-size: 15px }
.ft-cards { display: flex; flex-wrap: wrap; gap: 12px; align-items: center } .ft-cards .xlink { margin-top: 0 !important; text-decoration: none }
.ft-cards .tmrr { display: inline-flex; line-height: 0 } .ft-cards .tmrr img { width: 150px; height: auto }
.ft-col { display: grid; gap: 0; align-content: start } .ft-col b { color: var(--ink); font-size: 15px; margin-bottom: 6px }
.ft-col a { display: flex; align-items: center; min-height: 34px; text-decoration: none } .ft-col a:hover { color: var(--ink) }
footer.site-foot .ft-bar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 15px }
.ft-legal { display: inline-flex; gap: 8px; align-items: center } .ft-legal i { font-style: normal; opacity: .5 } .ft-legal a { text-decoration: none } .ft-legal a:hover { color: var(--ink) }
footer.site-foot .ft-disc { display: block; margin-top: 8px; font-size: 14px; opacity: .8 }
@media (max-width: 860px) { footer.site-foot .ft-grid { grid-template-columns: 1fr 1fr; gap: 22px 18px } .ft-brand { grid-column: 1 / -1 } }

/* night checks: clearly openable rounds */
.nacc-cap { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 12px 0 8px } .nacc-cap b { font: 800 20px/1 var(--f-display); text-transform: uppercase } .nacc-cap span { font-size: 15px; color: rgba(255,255,255,.65) }
.nacc summary { padding: 4px 8px; margin: 4px -8px; border-radius: 12px; transition: background .15s } .nacc summary:hover { background: rgba(255,255,255,.07) }
.nacc summary:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px }
.nacc-open { flex: none; display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: 999px; border: 1.5px solid var(--gold); color: var(--gold); font: 700 14px/1 var(--f-body); white-space: nowrap }
.nacc-open .o2 { display: none } .nacc[open] .nacc-open .o1 { display: none } .nacc[open] .nacc-open .o2 { display: inline } .nacc[open] .nacc-open { background: var(--gold); color: var(--ink) }
.nacc-t { margin-left: auto }
@media (max-width: 640px) { .nacc summary { flex-wrap: wrap; row-gap: 6px } .nacc-t { order: 3; width: 100%; margin-left: 26px } .nacc-open { margin-left: auto } }
.pg-hint b { color: var(--gold); font-weight: 700 }
.pg.nudge .pg-s { animation: nudge .5s ease 2 } @keyframes nudge { 50% { transform: translateY(-4px); box-shadow: 0 0 0 4px rgba(232,178,28,.55) } }
.modal .box { padding: 24px; border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink) }
#suFields input { width: 100%; box-sizing: border-box; min-height: 52px }
#suForm .btn { width: 100%; box-sizing: border-box }
@media (prefers-reduced-motion: reduce) { .pg.nudge .pg-s { animation: none } }

.upsell .up.track { border-color: var(--blue); box-shadow: 0 18px 50px rgba(29,78,216,.18) } .upsell .up-tag.blue { background: var(--blue); color: #fff }
.upsell:has(> .up:not([hidden]):only-of-type), .upsell.one { grid-template-columns: 1fr }

/* checks table: keep labels visible, short winner tag */
#checks td:first-child { min-width: 130px }
#checks .edge { display: inline-block; max-width: 110px; overflow: hidden; text-overflow: ellipsis; vertical-align: middle }
#checks td.v { font-size: 14px }
/* AI strategy text */
.ai-out { white-space: normal } .ai-out h4 { font: 800 20px/1.1 var(--f-display); text-transform: uppercase; margin: 18px 0 6px } .ai-out h4:first-child { margin-top: 0 }
.ai-out p { margin: 0 0 10px; line-height: 1.6 } .ai-out ul, .ai-out ol { margin: 0 0 12px; padding-left: 22px; display: grid; gap: 6px } .ai-out code { font: 500 14px var(--f-mono) }

/* site icons */
.ico { display: inline-block; width: 1em; height: 1em; border-radius: 22%; object-fit: contain; background: #fff; padding: .08em; vertical-align: -0.12em; margin-right: .35em; flex: none }
.fighter .host { display: flex; align-items: center; gap: 10px } .fighter.b .host { justify-content: flex-end } .fighter .host .ico { width: 30px; height: 30px; margin: 0; box-shadow: 0 0 0 1px var(--line) }
.bc-name { display: flex; flex-direction: column; align-items: center; gap: 8px } .bc-name .ico { width: 36px; height: 36px; margin: 0; padding: 3px }
.pg-s { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px } .pg-s .ico { width: 28px; height: 28px; margin: 0; padding: 3px }
.mh .ico { width: 18px; height: 18px } .pr-top b .ico { width: 20px; height: 20px }

/* homepage showdown strip */
.sd-home { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px } @media (max-width: 900px) { .sd-home { grid-template-columns: 1fr } }
.sdh { display: grid; gap: 8px; padding: 16px; border-radius: 18px; border: 2px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); color: #fff; text-decoration: none; background: radial-gradient(90% 70% at 0% 100%, rgba(225,35,46,.25), transparent 60%), radial-gradient(90% 70% at 100% 0%, rgba(29,78,216,.3), transparent 60%), var(--arena) }
.sdh .kw { font: 700 14px/1.2 var(--f-mono); color: var(--gold) } .sdh .rw { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 800 24px/1 var(--f-display); text-transform: uppercase; opacity: .7 } .sdh .rw.lead { opacity: 1 } .sdh .rw .ico { width: 22px; height: 22px }
.sdh .ra { color: #ff6b79 } .sdh .rb { color: #8aa6ff } .sdh .ft { font-size: 14px; color: rgba(255,255,255,.7) }

#agOut[hidden] { display: none !important }
[data-tool] { display: none }
.tools-hero { padding-block: 56px 8px }
.tools-hero h1 { font-size: clamp(52px, 9vw, 104px) } .tools-hero h1 .r { color: var(--red) } .tools-hero h1 .b { color: var(--blue) }
.tools-hero p { color: var(--muted); font-size: 18px; max-width: 620px; margin: 14px 0 0 }
.crumbs { font: 500 15px/1 var(--f-mono); color: var(--muted); margin-bottom: 18px; display: flex; gap: 8px; flex-wrap: wrap } .crumbs a { text-decoration: none } .crumbs a:hover { color: var(--ink) }
.hub { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px }
.tcard { display: grid; gap: 10px; padding: 24px; border-radius: 22px; background: var(--surface); box-shadow: var(--shadow); text-decoration: none; transition: transform .15s }
.tcard:hover { transform: translateY(-2px) } .tcard .eyebrow { color: var(--red) } .tcard:nth-child(even) .eyebrow { color: var(--blue) }
.tcard h2 { font: 800 32px/1 var(--f-display); text-transform: uppercase } .tcard p { margin: 0; color: var(--muted) } .tcard .go { font-weight: 600 }
@media (max-width: 760px) { .hub { grid-template-columns: 1fr } }
.tool { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start }
.tool.one { grid-template-columns: 1fr }
@media (max-width: 900px) { .tool { grid-template-columns: 1fr } }
.field { display: grid; gap: 6px } .field + .field { margin-top: 14px }
.field label, .lbl { font: 600 14px/1 var(--f-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted) }
.field input, .field select, .field textarea { width: 100%; border: 0; border-radius: 12px; padding: 12px 14px; background: var(--bg); color: var(--ink); font: 500 16px/1.4 var(--f-body); box-shadow: inset 0 0 0 1px var(--line) }
.field textarea { min-height: 110px; resize: vertical; font-family: var(--f-mono); font-size: 15px }
.field small { color: var(--muted); font-size: 15px }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px } @media (max-width: 520px) { .row2 { grid-template-columns: 1fr } }
.seg { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line) }
.seg button { border: 0; background: transparent; color: var(--muted); font: 600 15px/1 var(--f-body); padding: 8px 12px; border-radius: 999px; cursor: pointer }
.seg button[aria-pressed="true"] { background: var(--ink); color: var(--bg) }
.bots { display: grid; gap: 8px; margin-top: 8px } .bot { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--bg) } .bot b { font-weight: 600 } .bot span { color: var(--muted); font-size: 15px; display: block }
.out-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap } .out-acts { display: flex; gap: 8px }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 14px } .chip { font: 600 15px/1 var(--f-mono); padding: 8px 12px; border-radius: 999px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line) }
.chip.bad { color: var(--bad) } .chip.warn { color: var(--warn) } .chip.good { color: var(--good) }
td.url { max-width: 340px; overflow-wrap: anywhere; font-size: 15px } td.url small { display: block; color: var(--muted) }
.st { font: 700 14px/1 var(--f-mono); padding: 4px 7px; border-radius: 6px; white-space: nowrap }
.st.broken { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad) } .st.redirect { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn) } .st.ok { background: color-mix(in srgb, var(--good) 14%, transparent); color: var(--good) }
.locked td { filter: blur(5px); user-select: none } .lockbar { margin-top: 14px; padding: 16px; border-radius: 14px; background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)); display: flex; gap: 12px; align-items: center; flex-wrap: wrap } .lockbar p { margin: 0; flex: 1 1 220px }
.pos { font: 700 16px/1 var(--f-mono); font-variant-numeric: tabular-nums } .pos.a { color: var(--red) } .pos.b { color: var(--blue) } .pos.none { color: var(--muted); font-weight: 500 }
.mini-tape { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin-bottom: 14px } .mini-tape .s { font: 900 64px/.9 var(--f-display) } .mini-tape .s.a { color: var(--red) } .mini-tape .s.b { color: var(--blue); text-align: right } .mini-tape .c { font: 900 22px/1 var(--f-display); color: var(--muted) }
.muted { color: var(--muted) }
.terms h3 { margin: 18px 0 6px; font-size: 17px } .terms h3:first-child { margin-top: 0 } .terms p { margin: 0; color: var(--muted); max-width: 70ch } .terms b { color: var(--ink) }
.waitbox { display: grid; gap: 10px; align-content: start }
.waitbox h3 { margin: 0 }
.steps { margin: 12px 0 18px; padding-left: 20px; display: grid; gap: 12px; color: var(--muted) } .steps b { color: var(--ink) }
.chips .chip { font: 600 15px/1 var(--f-mono); padding: 8px 12px; border-radius: 999px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--line) }
</style>
<style>__SHOW__</style>

<header class="top"><div class="wrap">
  <a class="logo" href="/" aria-label="SEO Fights home"><span>SEO</span><svg class="gloves" viewBox="4 0 64 40" aria-hidden="true"><defs><symbol id="glv" viewBox="0 0 40 40"><path d="M9 15.5C9 9 13.6 5 20.2 5h3.6C31 5 36 9.6 36 16.4v3.4c0 4.8-3.2 8.3-7.7 9.1L27 29v3.2H11.6v-4.6C9.9 26.1 9 23.8 9 21.2z"/><path d="M13.5 18.2c0-3.2 2.3-5.4 5.6-5.4h4.6" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2" stroke-linecap="round"/><rect x="10.6" y="31" width="17.4" height="6" rx="2"/><rect x="10.6" y="31" width="17.4" height="2" rx="1" fill="rgba(255,255,255,.35)"/></symbol></defs><g transform="rotate(-14 24 22)"><use href="#glv" width="40" height="40" fill="#E1232E"/></g><g transform="rotate(14 48 22)"><use href="#glv" x="-72" width="40" height="40" fill="#1D4ED8" transform="scale(-1,1)"/></g></svg><span>Fights</span></a>
  <nav class="links"><a href="/showdowns">Showdown</a><a href="/keywords-battle">Keyword Battle</a><a href="/tools">Free tools</a><a href="/agency">For agencies</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a></nav>
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
    <a class="tcard" href="/tools/llms-txt-generator"><span class="eyebrow">AI-ready</span><h2>llms.txt generator</h2><p>Tell ChatGPT, Claude and Perplexity what your site is about, in the file they look for.</p><span class="go">Use tool \u2192</span></a>
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
    <div class="panel"><div class="out-head"><h3>robots.txt</h3><span class="out-acts"><button class="btn ghost sm" type="button" data-dl="rbOut" data-name="robots.txt">Download</button><button class="btn sm" type="button" data-copy="rbOut">Copy</button></span></div><div class="gen-out"><pre class="out" id="rbOut"></pre><div class="gen-lock"><div class="lockcard"><span class="eyebrow">Free account</span><h3 class="display">See the whole file</h3><p>Sign up to copy or download it. Free \xB7 no card.</p><div class="lk-btns"><a class="btn google lk-g" href="/auth/google" hidden>Continue with Google</a><button class="btn fight" type="button" data-genlock>Sign up free</button></div></div></div></div><p class="muted" style="font-size:14px;margin:12px 0 0">Save this as <b>robots.txt</b> at the root of your site, like yoursite.com/robots.txt.</p></div>
  </div></section>

  <!-- SCHEMA -->
  <section data-tool="schema"><div class="tool">
    <div class="panel">
      <div class="field"><label for="scType">Schema type</label><select id="scType"></select></div>
      <div id="scFields"></div>
    </div>
    <div class="panel"><div class="out-head"><h3>JSON-LD</h3><span class="out-acts"><button class="btn ghost sm" type="button" data-dl="scOut" data-name="schema.html">Download</button><button class="btn sm" type="button" data-copy="scOut">Copy</button></span></div><div class="gen-out"><pre class="out" id="scOut"></pre><div class="gen-lock"><div class="lockcard"><span class="eyebrow">Free account</span><h3 class="display">See the whole file</h3><p>Sign up to copy or download it. Free \xB7 no card.</p><div class="lk-btns"><a class="btn google lk-g" href="/auth/google" hidden>Continue with Google</a><button class="btn fight" type="button" data-genlock>Sign up free</button></div></div></div></div>
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
    <div class="panel"><div class="out-head"><h3>llms.txt</h3><span class="out-acts"><button class="btn ghost sm" type="button" data-dl="llOut" data-name="llms.txt">Download</button><button class="btn sm" type="button" data-copy="llOut">Copy</button></span></div><div class="gen-out"><pre class="out" id="llOut"></pre><div class="gen-lock"><div class="lockcard"><span class="eyebrow">Free account</span><h3 class="display">See the whole file</h3><p>Sign up to copy or download it. Free \xB7 no card.</p><div class="lk-btns"><a class="btn google lk-g" href="/auth/google" hidden>Continue with Google</a><button class="btn fight" type="button" data-genlock>Sign up free</button></div></div></div></div><p class="muted" style="font-size:14px;margin:12px 0 0">Save as <b>llms.txt</b> at your site's root. AI assistants read it to understand and quote you.</p></div>
  </div></section>

  <!-- KEYWORD BATTLE -->
  <section data-tool="battle"><div class="tool one">
    <form class="panel" id="kbForm" novalidate>
      <div class="row2">
        <div class="field"><label for="kbA" style="color:var(--red)">Your site</label><input id="kbA" inputmode="url" placeholder="yoursite.com" value="__KBA__"></div>
        <div class="field"><label for="kbB" style="color:var(--blue)">Rival</label><input id="kbB" inputmode="url" placeholder="rival.com" value="__KBB__"></div>
      </div>
      <div class="field"><label for="kbCountry">Country</label><select id="kbCountry">
        <option value="us">United States</option><option value="ca">Canada</option><option value="gb">United Kingdom</option><option value="au">Australia</option><option value="nz">New Zealand</option><option value="ie">Ireland</option><option value="de">Germany</option><option value="fr">France</option><option value="es">Spain</option><option value="it">Italy</option><option value="nl">Netherlands</option><option value="be">Belgium</option><option value="ch">Switzerland</option><option value="at">Austria</option><option value="se">Sweden</option><option value="no">Norway</option><option value="dk">Denmark</option><option value="fi">Finland</option><option value="pl">Poland</option><option value="pt">Portugal</option><option value="in">India</option><option value="sg">Singapore</option><option value="my">Malaysia</option><option value="ph">Philippines</option><option value="id">Indonesia</option><option value="jp">Japan</option><option value="kr">South Korea</option><option value="ae">United Arab Emirates</option><option value="sa">Saudi Arabia</option><option value="tr">Turkey</option><option value="za">South Africa</option><option value="ng">Nigeria</option><option value="br">Brazil</option><option value="mx">Mexico</option><option value="ar">Argentina</option><option value="co">Colombia</option><option value="cl">Chile</option></select><small>Choosing a country other than the US is a Pro feature.</small></div>
      <div class="field"><label for="kbKw">10 keywords to fight over</label><textarea id="kbKw" placeholder="One keyword per line"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" type="button" id="kbSuggest">Suggest keywords from my site</button></div></div>
      <div style="margin-top:16px"><button class="btn fight" type="submit" id="kbBtn" style="width:100%">Start keyword battle</button></div>
      <div class="err" id="kbErr" hidden></div>
    </form>
    <div class="panel" id="kbOut" hidden>
      <div class="mini-tape"><div><div class="eyebrow" style="color:var(--red)" id="kbHa"></div><div class="s a" id="kbSa">0</div></div><div class="c">KEYWORDS<br>WON</div><div style="text-align:right"><div class="eyebrow" style="color:var(--blue)" id="kbHb"></div><div class="s b" id="kbSb">0</div></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>Keyword</th><th>You</th><th>Rival</th><th>#1 on Google</th></tr></thead><tbody id="kbRows"></tbody></table></div>
      <div class="lockbar" id="kbLock" hidden><p><b>9 keywords are locked.</b> Pro shows all 10, any country, and emails you every time a position moves.</p><a class="btn sm" href="/pricing">Unlock with Pro</a></div>
    </div>
  </div></section>

  <!-- AGENCY: PROSPECT HUNTER -->
  <section data-tool="agency"><div class="tool">
    <div class="panel" id="agHow">
      <span class="eyebrow" style="color:var(--blue)">Prospect Hunter</span>
      <h3 style="margin-top:8px">How it works</h3>
      <ol class="steps">
        <li><b>Pick an industry and a city.</b> Roofers in Vancouver, dentists in Austin, anything.</li>
        <li><b>We find the businesses losing.</b> Who ranks on page 1 for buyer searches, and who is stuck behind them.</li>
        <li><b>You get the proof.</b> A fight page per prospect: their site vs the competitor beating them, round by round.</li>
        <li><b>You send the pitch.</b> A ready-to-send email for each one: "Your rival beats you 91\u201362. Here's why."</li>
      </ol>
      <div class="chips"><span class="chip">200 fights / month</span><span class="chip">20 Keyword Battles</span><span class="chip">30 hunts / month</span><span class="chip">$99 / month</span></div>
    </div>
    <form class="panel waitbox" id="agForm" novalidate>
      <span class="eyebrow" style="color:var(--red)">Prospect Hunter</span>
      <h3>Find clients losing to rivals</h3>
      <p class="muted">We search Google, fight up to 6 local businesses against the one ranking #1, and write a pitch for each. Takes about a minute.</p>
      <div class="field"><label for="agIndustry">Industry</label><input id="agIndustry" placeholder="Roofers"></div>
      <div class="field"><label for="agCity">City</label><input id="agCity" placeholder="Vancouver BC"></div>
      <div class="field"><label for="agCountry">Country</label><select id="agCountry"><option value="us">United States</option><option value="ca">Canada</option><option value="gb">United Kingdom</option><option value="au">Australia</option><option value="nz">New Zealand</option><option value="ie">Ireland</option></select></div>
      <div style="margin-top:16px"><button class="btn fight" type="submit" id="agBtn" style="width:100%">Find my prospects</button></div>
      <p class="muted" id="agMsg" style="margin:0"></p>
    </form>
  </div>
  <div class="tool" id="agOut" hidden style="display:block"><div class="panel"><h3 id="agTitle">Prospects</h3><p class="muted" id="agSub"></p><div class="prospects" id="agList"></div></div></div>
  <div class="tool" style="display:none">
  </div></section>

  <section class="seo-sum">__ABOUT__</section>
</main>

<footer class="site-foot"><div class="wrap ft-grid">
<div class="ft-brand">
  <a class="logo" href="/" aria-label="SEO Fights home"><span>SEO</span><svg class="gloves" viewBox="4 0 64 40" aria-hidden="true"><g transform="rotate(-14 24 22)"><use href="#glv" width="40" height="40" fill="#E1232E"/></g><g transform="rotate(14 48 22)"><use href="#glv" x="-72" width="40" height="40" fill="#1D4ED8" transform="scale(-1,1)"/></g></svg><span>Fights</span></a>
  <p class="ft-tag">Put your site in the ring.</p>
  <div class="ft-cards">
    <a class="xlink" href="https://x.com/kas_irani" target="_blank" rel="noopener"><img src="/kas.jpg" alt="Kas, founder of SEO Fights" width="40" height="40" loading="lazy" onerror="this.style.display='none'"><span><b>Made by Kas</b><small>\u{1D54F} @kas_irani \xB7 building in public</small></span></a>
    <a class="tmrr" href="https://trustmrr.com/startup/seo-fights" target="_blank" rel="noopener"><img src="https://trustmrr.com/api/embed/seo-fights?format=svg&amp;theme=light" alt="TrustMRR verified revenue badge" width="180" height="74" loading="lazy"></a>
  </div>
</div>
<nav class="ft-col" aria-label="Product"><b>Product</b><a href="/#test">Start a fight</a><a href="/fights">Biggest fights</a><a href="/showdowns">SEO Showdown</a><a href="/keywords-battle">Keyword Battle</a><a href="/agency">For agencies</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a></nav>
<nav class="ft-col" aria-label="Free tools"><b>Free tools</b><a href="/tools/broken-link-checker">Broken link checker</a><a href="/tools/robots-txt-generator">Robots.txt generator</a><a href="/tools/schema-markup-generator">Schema generator</a><a href="/tools/llms-txt-generator">llms.txt generator</a><a href="/tools">All tools</a></nav>
<nav class="ft-col" aria-label="Compare"><b>Compare</b><a href="/alternatives/ahrefs-alternative">Ahrefs alternative</a><a href="/alternatives/semrush-alternative">Semrush alternative</a><a href="/alternatives/moz-alternative">Moz alternative</a><a href="/alternatives/ubersuggest-alternative">Ubersuggest alternative</a><a href="/tools-like">More \u2192</a></nav>
<nav class="ft-col" aria-label="Company"><b>Company</b><a href="/about">About</a><a href="/contact">Contact</a><a href="/remove">Remove my site</a><a href="/account" data-acct>Sign in</a></nav>
</div>
<div class="wrap ft-bar"><span>\xA9 2026 SEO Fights \xB7 Vancouver, BC</span><span class="ft-legal"><a href="/terms">Terms</a><i aria-hidden="true">\xB7</i><a href="/privacy">Privacy</a><i aria-hidden="true">\xB7</i><a href="/cookie-policy">Cookies</a></span></div>
<p class="wrap ft-disc">Not affiliated with any brand shown. Brand names belong to their owners. Scores are automated estimates, not ranking guarantees.</p>
</footer>

<div class="toast" id="toast" hidden></div>

<div class="modal" id="suModal" hidden role="dialog" aria-modal="true" aria-labelledby="suTitle">
  <form class="box lead" id="suForm" novalidate>
    <span class="eyebrow" id="suEyebrow">Free account</span>
    <h3 class="display" id="suTitle">Sign up to use this</h3>
    <p id="suText">Takes 5 seconds. No password, no card.</p>
    <a class="btn google" id="suGoogle" href="/auth/google" hidden><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.5-9.4 6.5-16.1z"/><path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z"/><path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2 20.4 2 24s1 6.9 2.5 9.9l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/></svg>Continue with Google</a>
    <div id="suFields"><input id="suEmail" type="email" autocomplete="email" placeholder="you@email.com" aria-label="Your email"></div>
    <button class="btn fight" type="submit" id="suBtn">Create free account</button>
    <a class="btn fight" id="suPro" href="/go/pro" hidden>Go Pro \xB7 $19/month</a>
    <p class="muted" id="suFine" style="font-size:13px;margin:0">Already paid? <a href="/account">Get your access link</a>. By signing up you agree to the <a href="/terms">Terms</a>.</p>
    <button class="linkbtn" type="button" id="suClose">Not now</button>
  </form>
</div>
<script>
(() => {
  const q = s => document.querySelector(s);
  window.ME = null; window.AUTH = {};
  window.meReady = fetch("/api/me" + (location.pathname === "/" ? "?home=1" : ""), { credentials: "same-origin" }).then(r => r.json()).then(j => { window.AUTH = (j && j.auth) || {}; return (window.ME = j && j.plan ? j : null); }).catch(() => null);
  // Signed in: the header keeps a red "Start a fight" button (to the form) and gets a round avatar that opens the account page.
  const meHeader = () => {
    if (!window.ME) return;
    document.querySelectorAll("header.top .wrap").forEach(w => {
      const b = w.querySelector(":scope > .btn.sm");
      if (b) {
        b.textContent = "Start a fight"; b.classList.add("hdr-fight");
        const home = location.pathname === "/" && document.getElementById("duelForm");
        b.href = home ? "#test" : "/#test";
        if (home && !b.dataset.bound) { b.dataset.bound = 1; b.addEventListener("click", e => { e.preventDefault(); const f = document.getElementById("huntForm"); if (f && !f.hidden && window.setMode) setMode("fight", true); document.getElementById("test").scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => { const a = document.getElementById(document.getElementById("a").value ? "b" : "a"); a && a.focus({ preventScroll: true }); }, 450); }); }
      }
      if (!w.querySelector(".avatar")) {
        const em = String(window.ME.email || "?"), av = document.createElement("button"), menu = document.createElement("div");
        av.type = "button"; av.className = "avatar"; av.textContent = (em.trim()[0] || "?").toUpperCase();
        av.setAttribute("aria-label", "Account menu (" + em + ")"); av.setAttribute("aria-haspopup", "menu"); av.setAttribute("aria-expanded", "false");
        menu.className = "avmenu"; menu.hidden = true; menu.setAttribute("role", "menu");
        const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
        menu.innerHTML = \`<div class="who"><b>\${esc(window.ME.name || "Free")} plan</b>\${esc(em)}</div><a role="menuitem" href="/account">Account</a>\${window.ME.plan === "owner" ? '<a role="menuitem" href="/admin">\u{1F4CA} Stats</a>' : ""}<a role="menuitem" href="/account#billing">\${window.ME.plan === "pro" || window.ME.plan === "agency" ? "Billing / cancel plan" : "Billing"}</a><a role="menuitem" href="/account#settings">Emails and data</a><a role="menuitem" class="out" href="/logout">Sign out</a>\`;
        const close = () => { menu.hidden = true; av.setAttribute("aria-expanded", "false"); };
        av.addEventListener("click", e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; av.setAttribute("aria-expanded", String(open)); if (open) menu.querySelector("a").focus(); });
        document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) close(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { close(); av.focus(); } });
        w.appendChild(av); w.appendChild(menu);
      }
    });
    // Footer: a clear Sign out next to Account.
    document.querySelectorAll("footer a[data-acct]").forEach(a => { a.textContent = "Account"; if (!a.nextElementSibling || !a.nextElementSibling.matches("[data-out]")) a.insertAdjacentHTML("afterend", '<a href="/logout" data-out>Sign out</a>'); });
  };
  window.dashBtn = meHeader; window.meReady.then(meHeader);
  let next = null, nextUrl = null;
  const open = (mode, title, text) => {
    const pay = mode === "pay";
    q("#suEyebrow").textContent = pay ? "Out of free tries" : "Free account";
    q("#suTitle").textContent = title; q("#suText").textContent = text;
    q("#suFields").hidden = pay; q("#suBtn").hidden = pay; q("#suFine").hidden = pay; q("#suPro").hidden = !pay;
    const g = q("#suGoogle"); g.hidden = pay || !(window.AUTH && window.AUTH.google); g.href = "/auth/google?next=" + encodeURIComponent(nextUrl || location.pathname + location.search);
    q("#suBtn").textContent = window.AUTH && window.AUTH.link ? "Email me a sign-in link" : "Create free account";
    q("#suModal").hidden = false; if (!pay) setTimeout(() => q("#suEmail").focus(), 50);
  };
  // Run \`fn\` only for signed-in people; everyone else gets the sign-up box first.
  window.withAccount = async (fn, title, text, url) => {
    await window.meReady;
    if (window.ME) { fn && fn(); return; }
    next = fn; nextUrl = url || null; open("signup", title || "Sign up to use this", text || "Free account: see every fight result, 1 fight a week and 1 try of each tool a week. Takes 5 seconds.");
  };
  // Free tries used up: push to Pro.
  window.paywall = (msg, plan) => {
    const ag = plan === "agency", b = q("#suPro"); b.href = ag ? "/go/agency" : "/go/pro"; b.textContent = ag ? "Go Agency \xB7 $99/month" : "Go Pro \xB7 $19/month";
    open("pay", ag ? "Unlock Prospect Hunter" : "Go Pro to keep going", msg || "You've used your free tries this week. Pro gives you 40 fights a month and every tool.");
    if (ag) q("#suEyebrow").textContent = "Agency plan";
  };
  // Read an API response: true if it worked, opens the right box if not.
  window.gateCheck = async (r) => {
    if (r.status === 401) { window.ME = null; open("signup", "Sign up to use this", "Free account: see every fight result, 1 fight a week and 1 try of each tool a week."); return false; }
    if (r.status === 402 || r.status === 429) { let m = ""; try { m = (await r.clone().json()).error; } catch {} window.paywall(m); return false; }
    return true;
  };
  q("#suClose").addEventListener("click", () => { q("#suModal").hidden = true; next = null; });
  q("#suModal").addEventListener("click", e => { if (e.target.id === "suModal") { q("#suModal").hidden = true; next = null; } });
  q("#suForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = q("#suEmail").value.trim(), btn = q("#suBtn");
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) { q("#suText").textContent = "Enter a valid email."; return; }
    btn.disabled = true; btn.textContent = "Creating\u2026";
    try {
      const r = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, next: nextUrl || location.pathname + location.search }) });
      const j = await r.json();
      if (!r.ok) { q("#suText").textContent = j.error || "Try again."; return; }
      if (j.sent) { q("#suEyebrow").textContent = "Almost there"; q("#suTitle").textContent = "Check your inbox \u{1F4EC}"; q("#suText").textContent = \`We sent a sign-in link to \${email}. Tap it and you're in.\`; q("#suFields").hidden = true; q("#suBtn").hidden = true; q("#suGoogle").hidden = true; return; }
      window.ME = j; meHeader(); try { localStorage.setItem("fan", email); } catch {}
      q("#suModal").hidden = true; const f = next; next = null; f && f();
    } catch { q("#suText").textContent = "Try again."; }
    finally { btn.disabled = false; btn.textContent = window.AUTH && window.AUTH.link ? "Email me a sign-in link" : "Create free account"; }
  });
})();
</script>

<script>
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Select the text and copy it"); } }
// Generators: preview is blurred and copying needs an account (free = 1 copy per generator a week).
const GEN = { rbOut: "robots", scOut: "schema", llOut: "llms" }, usedGen = new Set();
meReady.then(() => { if (ME) document.documentElement.dataset.me = ME.plan; });
// Generators: anyone can build the file and see the first lines. Copy and Download need an account (counted per use).
async function genUse(id) {
  document.documentElement.dataset.me = ME.plan;
  const tool = GEN[id]; if (!tool || usedGen.has(tool)) return true;
  const r = await fetch("/api/use", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool }) });
  if (!(await gateCheck(r))) return false; usedGen.add(tool); return true;
}
const GEN_T = "Free account: copy or download each generator's file once a week. Pro: 500 a month.";
document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => withAccount(async () => { if (await genUse(b.dataset.copy)) copyText($("#" + b.dataset.copy).textContent); }, "Sign up to copy this", GEN_T)));
document.querySelectorAll("[data-dl]").forEach(b => b.addEventListener("click", () => withAccount(async () => {
  if (!(await genUse(b.dataset.dl))) return;
  const url = URL.createObjectURL(new Blob([$("#" + b.dataset.dl).textContent], { type: "text/plain" }));
  const a = document.createElement("a"); a.href = url; a.download = b.dataset.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast("Downloaded");
}, "Sign up to download this", GEN_T)));
document.querySelectorAll("[data-genlock]").forEach(b => b.addEventListener("click", () => withAccount(() => { document.documentElement.dataset.me = ME.plan; }, "Sign up to see the whole file", GEN_T)));
meReady.then(() => document.querySelectorAll(".lk-g").forEach(g => { g.hidden = !(window.AUTH && AUTH.google); g.href = "/auth/google?next=" + encodeURIComponent(location.pathname); }));
async function sendLead(body) { const r = await fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error("Try again"); }
const okEmail = e => /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(e);
document.getElementById("agForm").addEventListener("submit", async e => {
  e.preventDefault(); const v = id => document.getElementById(id).value.trim();
  if (v("agIndustry").length < 2 || v("agCity").length < 2) { $("#agMsg").textContent = "Enter an industry and a city."; return; }
  await meReady; if (!ME) { withAccount(() => $("#agForm").requestSubmit(), "Sign in to hunt prospects", "Prospect Hunter is part of the Agency plan. Sign in first, then upgrade."); return; }
  const btn = $("#agBtn"); btn.disabled = true; btn.textContent = "Hunting\u2026 about a minute"; $("#agMsg").textContent = "Searching Google, then fighting each business against the #1 site.";
  try {
    const r = await fetch("/api/prospects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ industry: v("agIndustry"), city: v("agCity"), country: v("agCountry") }) });
    if (r.status === 402) { paywall("Prospect Hunter is part of the Agency plan: 30 hunts a month, 6 prospects each, pitch included.", "agency"); return; }
    if (!(await gateCheck(r))) return;
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    $("#agMsg").textContent = "";
    if (!j.prospects.length) { $("#agMsg").textContent = "No local businesses found for that search. Try a broader industry or a bigger city."; return; }
    $("#agTitle").textContent = \`\${j.prospects.length} \${esc(j.industry)} in \${esc(j.city)} ranking below \${j.leader.host}\`;
    $("#agSub").textContent = "Behind on the page first, biggest gap first. Each card links to the full fight. Copy the pitch, add your name, send.";
    $("#agList").innerHTML = j.prospects.map((x, k) => \`<div class="prospect"><div class="pr-top"><b>\${esc(x.host)}</b><span class="pr-score"><i class="r">\${x.score}</i> vs <i class="b">\${x.rivalScore}</i></span></div>
      <p class="muted">Google rank #\${x.rank}. \${x.gap > 0 ? \`Losing by \${x.gap} points.\` : \`Beats the leader on the page by \${-x.gap}, but still ranks below it.\`} Top gaps: \${x.fixes.map(esc).join(", ") || "polish"}.</p>
      <pre class="out pitch" id="pitch\${k}">\${esc(x.pitch || "Pitch unavailable for this one. Open the fight and write your own.")}</pre>
      <div class="pr-act"><button class="btn sm" type="button" data-copy="pitch\${k}">Copy pitch</button><a class="btn ghost sm" href="\${x.fight}" target="_blank" rel="noopener">Open the fight</a></div></div>\`).join("");
    $("#agList").querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => copyText($("#" + b.dataset.copy).textContent)));
    $("#agOut").hidden = false; $("#agOut").scrollIntoView({ behavior: "smooth" });
  } catch (x) { $("#agMsg").textContent = liveErr(x); }
  finally { btn.disabled = false; btn.textContent = "Find my prospects"; }
});
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
  const L = ["# robots.txt made with SEO Fights", "User-agent: *"];
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
  await meReady; if (!ME) { withAccount(() => $("#blForm").requestSubmit(), "Sign up to scan your links", "Free account: 1 link scan a week, 1 fight a week. Pro: 200 scans a month."); return; }
  const btn = $("#blBtn"); btn.disabled = true; btn.textContent = "Scanning\u2026";
  try {
    const r = await fetch(\`/api/links?url=\${encodeURIComponent(u)}\`); if (!(await gateCheck(r))) return; const j = await r.json(); if (!r.ok) throw new Error(j.error);
    $("#blChips").innerHTML = \`<span class="chip">\${j.total} links</span><span class="chip bad">\${j.broken} broken</span><span class="chip warn">\${j.redirects} redirects</span><span class="chip good">\${j.total - j.broken - j.redirects} OK</span>\`;
    $("#blRows").innerHTML = j.links.map(l => \`<tr><td class="url">\${esc(l.url)}<small>\${esc(l.text)}\${l.to ? " \u2192 " + esc(l.to) : ""}</small></td><td><span class="st \${l.kind}">\${l.status || "Timeout"}</span></td><td class="muted">\${l.internal ? "Internal" : "External"}</td></tr>\`).join("");
    $("#blOut").hidden = false;
  } catch (x) { $("#blErr").textContent = liveErr(x); $("#blErr").hidden = false; }
  finally { btn.disabled = false; btn.textContent = "Scan links"; }
});

/* ---- keyword battle ---- */
$("#kbSuggest").addEventListener("click", async () => {
  const a = $("#kbA").value.trim(); if (!a) { toast("Enter your site first"); return; }
  await meReady; if (!ME) { withAccount(() => $("#kbSuggest").click(), "Sign up to battle", "Free account: 1 Keyword Battle a week. Pro: all 10 keywords, any country."); return; }
  try { const r = await fetch(\`/api/keywords?site=\${encodeURIComponent(a)}&rival=\${encodeURIComponent($("#kbB").value.trim())}\`); if (!(await gateCheck(r))) return; const j = await r.json(); if (!r.ok) throw new Error(j.error); $("#kbKw").value = j.keywords.join("\\n"); }
  catch (x) { toast(liveErr(x)); }
});
$("#kbForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#kbErr").hidden = true;
  const a = $("#kbA").value.trim(), b = $("#kbB").value.trim(), kw = $("#kbKw").value.split("\\n").map(s => s.trim()).filter(Boolean).slice(0, 10);
  if (!a || !b) { $("#kbErr").textContent = "Enter both sites."; $("#kbErr").hidden = false; return; }
  await meReady; if (!ME) { withAccount(() => $("#kbForm").requestSubmit(), "Sign up to battle", "Free account: 1 Keyword Battle a week. Pro: all 10 keywords, any country."); return; }
  const btn = $("#kbBtn"); btn.disabled = true; btn.textContent = "Battling\u2026";
  try {
    const r = await fetch("/api/battle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a, b, keywords: kw, country: $("#kbCountry").value }) });
    if (r.status !== 503 && !(await gateCheck(r))) return;
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
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
var demo_default = { a: { host: "crumbandco.ca", url: "https://crumbandco.ca/", title: "Fresh Sourdough Bakery in Vancouver | Crumb & Co", score: 69, scores: { onpage: 63, content: 88, technical: 90, ai: 28, social: 60 }, checks: [{ cat: "onpage", id: "title", label: "Title tag", status: "good", value: "48 chars", fix: "Keep the title between 30 and 60 characters so Google doesn't cut it.", weight: 3 }, { cat: "onpage", id: "desc", label: "Meta description", status: "warn", value: "6 chars", fix: "Write a 70\u2013160 character description that sells the click.", weight: 2 }, { cat: "onpage", id: "h1", label: "One H1 heading", status: "warn", value: "2 found", fix: "Keep only one H1; turn the others into H2s.", weight: 3 }, { cat: "onpage", id: "headings", label: "H2/H3 structure", status: "good", value: "2 H2 \xB7 0 H3", fix: "Break the page into sections with H2 headings.", weight: 1 }, { cat: "onpage", id: "alt", label: "Image alt text", status: "bad", value: "2 of 3 missing", fix: "Describe every image in its alt text.", weight: 1 }, { cat: "onpage", id: "canonical", label: "Canonical URL", status: "warn", value: "Missing", fix: 'Add <link rel="canonical"> so Google knows the main version of the page.', weight: 1 }, { cat: "onpage", id: "internal", label: "Internal links", status: "warn", value: "5", fix: "Link to your key pages from the homepage.", weight: 1 }, { cat: "content", id: "words", label: "Content depth", status: "good", value: "616 words", fix: "Add more useful text \u2014 what you do, who it's for, proof, FAQ.", weight: 2 }, { cat: "content", id: "lang", label: "Language set", status: "warn", value: "Missing", fix: 'Add lang="en" (or your language) to the <html> tag.', weight: 1 }, { cat: "content", id: "external", label: "Outbound links", status: "good", value: "1", fix: "Link to a couple of trusted sources.", weight: 1 }, { cat: "technical", id: "https", label: "HTTPS", status: "good", value: "Secure", fix: "Turn on HTTPS (free with Cloudflare).", weight: 3 }, { cat: "technical", id: "status", label: "Page loads (status)", status: "good", value: "200", fix: "Make sure the homepage returns 200.", weight: 3 }, { cat: "technical", id: "ttfb", label: "Server response", status: "warn", value: "840 ms", fix: "Speed up the server or put the site behind a CDN.", weight: 2 }, { cat: "technical", id: "size", label: "Page weight (HTML)", status: "good", value: "4 KB", fix: "Trim inline scripts and styles from the HTML.", weight: 1 }, { cat: "technical", id: "compress", label: "Compression", status: "good", value: "gzip", fix: "Turn on gzip or Brotli compression.", weight: 1 }, { cat: "technical", id: "redirects", label: "Redirect hops", status: "good", value: "0", fix: "Point straight to the final URL \u2014 fewer hops.", weight: 1 }, { cat: "technical", id: "mobile", label: "Mobile viewport", status: "good", value: "Set", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', weight: 2 }, { cat: "technical", id: "indexable", label: "Google can index it", status: "good", value: "Yes", fix: "Remove the noindex tag \u2014 it hides your page from Google.", weight: 3 }, { cat: "technical", id: "sitemap", label: "Sitemap", status: "warn", value: "Not found", fix: "Publish /sitemap.xml and list it in robots.txt.", weight: 1 }, { cat: "technical", id: "robots", label: "robots.txt", status: "good", value: "Found", fix: "Add a robots.txt file.", weight: 1 }, { cat: "technical", id: "doctype", label: "Doctype & charset", status: "good", value: "OK", fix: 'Start with <!doctype html> and <meta charset="utf-8">.', weight: 1 }, { cat: "technical", id: "hsts", label: "HSTS security header", status: "warn", value: "Off", fix: "Turn on HSTS in your host settings.", weight: 1 }, { cat: "ai", id: "aibots", label: "AI crawlers allowed", status: "warn", value: "Blocks GPTBot", fix: "Allow GPTBot, ClaudeBot and PerplexityBot in robots.txt so AI can recommend you.", weight: 3 }, { cat: "ai", id: "llms", label: "llms.txt", status: "warn", value: "Not found", fix: "Add /llms.txt \u2014 a short summary of your site for AI.", weight: 1 }, { cat: "ai", id: "schema", label: "Structured data", status: "bad", value: "None", fix: "Add JSON-LD schema (Organization + WebSite at minimum).", weight: 2 }, { cat: "ai", id: "entity", label: "Who-you-are schema", status: "warn", value: "No", fix: "Add Organization schema with name, logo and links.", weight: 1 }, { cat: "ai", id: "faq", label: "Answers questions", status: "bad", value: "0 question headings", fix: "Add an FAQ section \u2014 AI answers love question-and-answer text.", weight: 2 }, { cat: "social", id: "og", label: "Share preview (Open Graph)", status: "warn", value: "No image", fix: "Add og:title, og:description and a 1200\xD7630 og:image.", weight: 2 }, { cat: "social", id: "ogdesc", label: "Share description", status: "warn", value: "Missing", fix: "Add og:description.", weight: 1 }, { cat: "social", id: "twitter", label: "X/Twitter card", status: "warn", value: "Missing", fix: 'Add <meta name="twitter:card" content="summary_large_image">.', weight: 1 }, { cat: "social", id: "favicon", label: "Favicon", status: "good", value: "Set", fix: "Add a favicon so you look legit in tabs and Google.", weight: 1 }] }, b: { host: "loafandlevain.com", url: "https://loafandlevain.com/", title: "PyPI \xB7 The Python Package Index", score: 86, scores: { onpage: 92, content: 75, technical: 98, ai: 50, social: 100 }, checks: [{ cat: "onpage", id: "title", label: "Title tag", status: "good", value: "31 chars", fix: "Keep the title between 30 and 60 characters so Google doesn't cut it.", weight: 3 }, { cat: "onpage", id: "desc", label: "Meta description", status: "good", value: "96 chars", fix: "Write a 70\u2013160 character description that sells the click.", weight: 2 }, { cat: "onpage", id: "h1", label: "One H1 heading", status: "good", value: "1 found", fix: "Keep only one H1; turn the others into H2s.", weight: 3 }, { cat: "onpage", id: "headings", label: "H2/H3 structure", status: "good", value: "4 H2 \xB7 0 H3", fix: "Break the page into sections with H2 headings.", weight: 1 }, { cat: "onpage", id: "alt", label: "Image alt text", status: "bad", value: "15 of 16 missing", fix: "Describe every image in its alt text.", weight: 1 }, { cat: "onpage", id: "canonical", label: "Canonical URL", status: "good", value: "Set", fix: 'Add <link rel="canonical"> so Google knows the main version of the page.', weight: 1 }, { cat: "onpage", id: "internal", label: "Internal links", status: "good", value: "15", fix: "Link to your key pages from the homepage.", weight: 1 }, { cat: "content", id: "words", label: "Content depth", status: "warn", value: "296 words", fix: "Add more useful text \u2014 what you do, who it's for, proof, FAQ.", weight: 2 }, { cat: "content", id: "lang", label: "Language set", status: "good", value: "en", fix: 'Add lang="en" (or your language) to the <html> tag.', weight: 1 }, { cat: "content", id: "external", label: "Outbound links", status: "good", value: "40", fix: "Link to a couple of trusted sources.", weight: 1 }, { cat: "technical", id: "https", label: "HTTPS", status: "good", value: "Secure", fix: "Turn on HTTPS (free with Cloudflare).", weight: 3 }, { cat: "technical", id: "status", label: "Page loads (status)", status: "good", value: "200", fix: "Make sure the homepage returns 200.", weight: 3 }, { cat: "technical", id: "ttfb", label: "Server response", status: "good", value: "210 ms", fix: "Speed up the server or put the site behind a CDN.", weight: 2 }, { cat: "technical", id: "size", label: "Page weight (HTML)", status: "good", value: "27 KB", fix: "Trim inline scripts and styles from the HTML.", weight: 1 }, { cat: "technical", id: "compress", label: "Compression", status: "warn", value: "Off", fix: "Turn on gzip or Brotli compression.", weight: 1 }, { cat: "technical", id: "redirects", label: "Redirect hops", status: "good", value: "0", fix: "Point straight to the final URL \u2014 fewer hops.", weight: 1 }, { cat: "technical", id: "mobile", label: "Mobile viewport", status: "good", value: "Set", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', weight: 2 }, { cat: "technical", id: "indexable", label: "Google can index it", status: "good", value: "Yes", fix: "Remove the noindex tag \u2014 it hides your page from Google.", weight: 3 }, { cat: "technical", id: "sitemap", label: "Sitemap", status: "good", value: "Found", fix: "Publish /sitemap.xml and list it in robots.txt.", weight: 1 }, { cat: "technical", id: "robots", label: "robots.txt", status: "good", value: "Found", fix: "Add a robots.txt file.", weight: 1 }, { cat: "technical", id: "doctype", label: "Doctype & charset", status: "good", value: "OK", fix: 'Start with <!doctype html> and <meta charset="utf-8">.', weight: 1 }, { cat: "technical", id: "hsts", label: "HSTS security header", status: "good", value: "On", fix: "Turn on HSTS in your host settings.", weight: 1 }, { cat: "ai", id: "aibots", label: "AI crawlers allowed", status: "good", value: "All allowed", fix: "Allow GPTBot, ClaudeBot and PerplexityBot in robots.txt so AI can recommend you.", weight: 3 }, { cat: "ai", id: "llms", label: "llms.txt", status: "good", value: "Found", fix: "Add /llms.txt \u2014 a short summary of your site for AI.", weight: 1 }, { cat: "ai", id: "schema", label: "Structured data", status: "bad", value: "None", fix: "Add JSON-LD schema (Organization + WebSite at minimum).", weight: 2 }, { cat: "ai", id: "entity", label: "Who-you-are schema", status: "warn", value: "No", fix: "Add Organization schema with name, logo and links.", weight: 1 }, { cat: "ai", id: "faq", label: "Answers questions", status: "bad", value: "0 question headings", fix: "Add an FAQ section \u2014 AI answers love question-and-answer text.", weight: 2 }, { cat: "social", id: "og", label: "Share preview (Open Graph)", status: "good", value: "Title + image", fix: "Add og:title, og:description and a 1200\xD7630 og:image.", weight: 2 }, { cat: "social", id: "ogdesc", label: "Share description", status: "good", value: "Set", fix: "Add og:description.", weight: 1 }, { cat: "social", id: "twitter", label: "X/Twitter card", status: "good", value: "summary_large_image", fix: 'Add <meta name="twitter:card" content="summary_large_image">.', weight: 1 }, { cat: "social", id: "favicon", label: "Favicon", status: "good", value: "Set", fix: "Add a favicon so you look legit in tabs and Google.", weight: 1 }] }, winner: "b", rows: [{ id: "title", cat: "onpage", label: "Title tag", a: { status: "good", value: "48 chars" }, b: { status: "good", value: "31 chars" }, edge: null }, { id: "desc", cat: "onpage", label: "Meta description", a: { status: "warn", value: "6 chars" }, b: { status: "good", value: "96 chars" }, edge: "b" }, { id: "h1", cat: "onpage", label: "One H1 heading", a: { status: "warn", value: "2 found" }, b: { status: "good", value: "1 found" }, edge: "b" }, { id: "headings", cat: "onpage", label: "H2/H3 structure", a: { status: "good", value: "2 H2 \xB7 0 H3" }, b: { status: "good", value: "4 H2 \xB7 0 H3" }, edge: null }, { id: "alt", cat: "onpage", label: "Image alt text", a: { status: "bad", value: "2 of 3 missing" }, b: { status: "bad", value: "15 of 16 missing" }, edge: null }, { id: "canonical", cat: "onpage", label: "Canonical URL", a: { status: "warn", value: "Missing" }, b: { status: "good", value: "Set" }, edge: "b" }, { id: "internal", cat: "onpage", label: "Internal links", a: { status: "warn", value: "5" }, b: { status: "good", value: "15" }, edge: "b" }, { id: "words", cat: "content", label: "Content depth", a: { status: "good", value: "616 words" }, b: { status: "warn", value: "296 words" }, edge: "a" }, { id: "lang", cat: "content", label: "Language set", a: { status: "warn", value: "Missing" }, b: { status: "good", value: "en" }, edge: "b" }, { id: "external", cat: "content", label: "Outbound links", a: { status: "good", value: "1" }, b: { status: "good", value: "40" }, edge: null }, { id: "https", cat: "technical", label: "HTTPS", a: { status: "good", value: "Secure" }, b: { status: "good", value: "Secure" }, edge: null }, { id: "status", cat: "technical", label: "Page loads (status)", a: { status: "good", value: "200" }, b: { status: "good", value: "200" }, edge: null }, { id: "ttfb", cat: "technical", label: "Server response", a: { status: "warn", value: "840 ms" }, b: { status: "good", value: "210 ms" }, edge: "b" }, { id: "size", cat: "technical", label: "Page weight (HTML)", a: { status: "good", value: "4 KB" }, b: { status: "good", value: "27 KB" }, edge: null }, { id: "compress", cat: "technical", label: "Compression", a: { status: "good", value: "gzip" }, b: { status: "warn", value: "Off" }, edge: "a" }, { id: "redirects", cat: "technical", label: "Redirect hops", a: { status: "good", value: "0" }, b: { status: "good", value: "0" }, edge: null }, { id: "mobile", cat: "technical", label: "Mobile viewport", a: { status: "good", value: "Set" }, b: { status: "good", value: "Set" }, edge: null }, { id: "indexable", cat: "technical", label: "Google can index it", a: { status: "good", value: "Yes" }, b: { status: "good", value: "Yes" }, edge: null }, { id: "sitemap", cat: "technical", label: "Sitemap", a: { status: "warn", value: "Not found" }, b: { status: "good", value: "Found" }, edge: "b" }, { id: "robots", cat: "technical", label: "robots.txt", a: { status: "good", value: "Found" }, b: { status: "good", value: "Found" }, edge: null }, { id: "doctype", cat: "technical", label: "Doctype & charset", a: { status: "good", value: "OK" }, b: { status: "good", value: "OK" }, edge: null }, { id: "hsts", cat: "technical", label: "HSTS security header", a: { status: "warn", value: "Off" }, b: { status: "good", value: "On" }, edge: "b" }, { id: "aibots", cat: "ai", label: "AI crawlers allowed", a: { status: "warn", value: "Blocks GPTBot" }, b: { status: "good", value: "All allowed" }, edge: "b" }, { id: "llms", cat: "ai", label: "llms.txt", a: { status: "warn", value: "Not found" }, b: { status: "good", value: "Found" }, edge: "b" }, { id: "schema", cat: "ai", label: "Structured data", a: { status: "bad", value: "None" }, b: { status: "bad", value: "None" }, edge: null }, { id: "entity", cat: "ai", label: "Who-you-are schema", a: { status: "warn", value: "No" }, b: { status: "warn", value: "No" }, edge: null }, { id: "faq", cat: "ai", label: "Answers questions", a: { status: "bad", value: "0 question headings" }, b: { status: "bad", value: "0 question headings" }, edge: null }, { id: "og", cat: "social", label: "Share preview (Open Graph)", a: { status: "warn", value: "No image" }, b: { status: "good", value: "Title + image" }, edge: "b" }, { id: "ogdesc", cat: "social", label: "Share description", a: { status: "warn", value: "Missing" }, b: { status: "good", value: "Set" }, edge: "b" }, { id: "twitter", cat: "social", label: "X/Twitter card", a: { status: "warn", value: "Missing" }, b: { status: "good", value: "summary_large_image" }, edge: "b" }, { id: "favicon", cat: "social", label: "Favicon", a: { status: "good", value: "Set" }, b: { status: "good", value: "Set" }, edge: null }], winsA: 2, winsB: 13, plan: [{ label: "Structured data", status: "bad", fix: "Add JSON-LD schema (Organization + WebSite at minimum).", gain: 4 }, { label: "Answers questions", status: "bad", fix: "Add an FAQ section \u2014 AI answers love question-and-answer text.", gain: 4 }, { label: "Image alt text", status: "bad", fix: "Describe every image in its alt text.", gain: 2 }, { label: "One H1 heading", status: "warn", fix: "Keep only one H1; turn the others into H2s.", gain: 3 }, { label: "AI crawlers allowed", status: "warn", fix: "Allow GPTBot, ClaudeBot and PerplexityBot in robots.txt so AI can recommend you.", gain: 3 }, { label: "Meta description", status: "warn", fix: "Write a 70\u2013160 character description that sells the click.", gain: 2 }, { label: "Server response", status: "warn", fix: "Speed up the server or put the site behind a CDN.", gain: 2 }, { label: "Share preview (Open Graph)", status: "warn", fix: "Add og:title, og:description and a 1200\xD7630 og:image.", gain: 2 }, { label: "Canonical URL", status: "warn", fix: 'Add <link rel="canonical"> so Google knows the main version of the page.', gain: 1 }, { label: "Internal links", status: "warn", fix: "Link to your key pages from the homepage.", gain: 1 }, { label: "Language set", status: "warn", fix: 'Add lang="en" (or your language) to the <html> tag.', gain: 1 }, { label: "Sitemap", status: "warn", fix: "Publish /sitemap.xml and list it in robots.txt.", gain: 1 }, { label: "HSTS security header", status: "warn", fix: "Turn on HSTS in your host settings.", gain: 1 }, { label: "llms.txt", status: "warn", fix: "Add /llms.txt \u2014 a short summary of your site for AI.", gain: 1 }, { label: "Who-you-are schema", status: "warn", fix: "Add Organization schema with name, logo and links.", gain: 1 }, { label: "Share description", status: "warn", fix: "Add og:description.", gain: 1 }, { label: "X/Twitter card", status: "warn", fix: 'Add <meta name="twitter:card" content="summary_large_image">.', gain: 1 }], markdown: `# SEO fight: crumbandco.ca (69) vs loafandlevain.com (86)

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

// src/og.b64.txt
var og_b64_default = "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";

// src/touch.b64.txt
var touch_b64_default = "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";

// src/legal.js
var TERMS_HTML = `<div class="panel terms">
<h3>1. What you get</h3><p>SEO Fights compares public websites and gives you scores, checks and suggestions. Results come from public pages at the time of the check. We don't promise rankings, traffic or sales.</p>
<h3>2. Plans and billing</h3><p>Pro and Agency are monthly subscriptions that renew automatically until you cancel. Lifetime is a single payment for the life of the product. Prices are shown before you pay. Payments are handled by Stripe.</p>
<h3>3. All payments are final</h3><p><b>We do not offer refunds</b>, including for partial months, unused fights, downgrades or plans you didn't use, except where the law requires it. Please use the free plan before you buy.</p>
<h3>4. Cancelling</h3><p>Cancel any time from your account. You keep access until the end of the period you already paid for. Nothing is charged after that.</p>
<h3>5. Chargebacks</h3><p>If a payment is disputed or reversed, access to the paid plan ends right away.</p>
<h3>6. Fair use</h3><p>Plans include the limits shown on the pricing page. Don't use SEO Fights to attack, overload or scrape sites, or to resell results in bulk. We can suspend accounts that abuse the service.</p>
<h3>7. Changes</h3><p>We may change features, limits or prices. Price changes for existing subscriptions apply from your next billing period, and we'll tell you first.</p>
<h3>8. Liability</h3><p>SEO Fights is provided "as is". Our total liability is limited to what you paid us in the last 3 months.</p></div>`, PRIVACY_HTML = `<div class="panel terms">
<h3>What we collect</h3><p>Your email when you sign up, the websites you enter, your picks on fights, your plan and usage counts, and your IP address to stop abuse and enforce free limits. Payment details go straight to Stripe. We never see your card.</p>
<h3>Why</h3><p>To run fights and tools, keep you signed in, enforce plan limits, send the emails you asked for (sign-in links, reports, receipts) and improve SEO Fights.</p>
<h3>Who helps us run it</h3><p>Cloudflare hosts the site, stores data, and counts visits with Cloudflare Web Analytics (no cookies, no tracking across sites). Stripe handles payments. Google search results come through Serper. Emails are sent with Resend. AI features run on Cloudflare Workers AI. Fonts load from Google Fonts. Each only gets what it needs to do its job.</p>
<h3>What we don't do</h3><p>We don't sell your data. No ads, no ad trackers, no analytics cookies.</p>
<h3>Your data, your call</h3><p>Download your data or delete your account any time from <a href="/account#settings">your account</a>. Paid monthly plans: cancel first. You can also ask through the <a href="/contact">contact page</a> and we'll do it within 30 days.</p>
<h3>What we keep after you delete</h3><p>When you delete your account we remove your account, your saved fights list, Keyword Battles, Prospect Hunter results, Monday reports and usage counts. For tax and chargeback records we keep a short note: a one-way hash of your email (not the email itself), the plan you had, your Stripe customer ID and the date. Public fight pages stay up, because they are about websites, not about you.</p>
<h3>Emails</h3><p>Sign-in links, receipts and welcome emails are always sent. Monday reports have a one-click unsubscribe link and can be turned off in <a href="/account#settings">your account</a>.</p></div>`, COOKIES = {
  title: "Cookie policy \xB7 SEO Fights",
  desc: "The cookies and storage SEO Fights uses. No ad or tracking cookies.",
  h1: "Cookie policy",
  lede: "Short version: no ad cookies, no trackers.",
  body: `<div class="panel terms">
<h3>Cookies we set</h3><p><b>rf_key</b>: set when you sign in. It keeps you signed in and your plan active in this browser. Secure, can't be read by scripts.</p><p><b>rf_oauth</b>: only during "Continue with Google". A 10-minute safety check, then it's deleted.</p>
<p><b>rf_af</b>: set when you run a free fight without an account. It lets us count 1 free fight a week. Lasts 8 days.</p>
<h3>Stored in your browser</h3><p>Your picks on fights, so you don't vote twice, and your email, so checkout can fill it in for you. This stays on your device.</p>
<h3>Other services</h3><p>Fonts load from Google Fonts, which sees your IP address like any website you visit. Checkout runs on Stripe, which may set its own cookies on its checkout page to stop fraud.</p>
<h3>What we don't use</h3><p>No advertising cookies, no analytics cookies, no cross-site tracking. That's why there's no cookie banner: everything here is needed for the site to work.</p>
<h3>Clearing them</h3><p>Clear your browser's site data for SEO Fights any time. You'll just need to sign in again.</p></div>`
};

// src/pages.js
var X_HANDLE = "kas_irani", X_URL = `https://x.com/${X_HANDLE}`, cta = (t = "Start a free fight", h = "/") => `<p style="margin-top:20px"><a class="btn fight" href="${h}">${t}</a></p>`, xBtn = `<a class="btn ghost xfollow" href="${X_URL}" target="_blank" rel="noopener">\u{1D54F} Follow @${X_HANDLE}</a>`, ABOUT = {
  title: "About SEO Fights \xB7 Built in public by @" + X_HANDLE,
  desc: "Why SEO Fights exists: SEO only makes sense next to a rival. Built in public on X by @" + X_HANDLE + ".",
  h1: `Hey, I'm <span class="r">Kas</span>`,
  lede: "I build SEO Fights in public, one post at a time on X.",
  body: `<div class="panel terms about">
<div class="founder"><a href="${X_URL}" target="_blank" rel="noopener" class="ava-link"><img class="ava" src="/kas.jpg" alt="Kas, founder of SEO Fights" width="72" height="72" onerror="this.outerHTML='<div class=ava>K</div>'"></a><div><b>Kas</b><span class="muted">Founder, SEO Fights</span><a href="${X_URL}" target="_blank" rel="noopener">@${X_HANDLE} on X</a></div></div>
<h3>Why this exists</h3><p>SEO tools hand you hundreds of numbers and no answer. A score of 72 means nothing on its own. It only matters if your competitor has 81. So SEO Fights does one thing: puts your site in the ring with a rival, runs 31 live checks, names a winner and tells the loser exactly what to fix.</p>
<h3>What I believe</h3><p><b>Context beats metrics.</b> Every check is shown side by side, so you see the gap, not just a grade.</p><p><b>Plain words.</b> If a fix needs a tutorial, I rewrite it until it doesn't.</p><p><b>Do the next thing.</b> Every fight ends with a ranked fix list and the points each fix is worth.</p><p><b>AI search counts now.</b> ChatGPT, Claude and Perplexity send real traffic, so every fight checks if AI can read and quote your site.</p>
<h3>Built in public</h3><p>I share the numbers, the fights, the wins and the mistakes on X. Follow along, send me a fight you want to see, or tell me what's broken.</p>
<p style="margin-top:18px">${xBtn} <a class="btn ghost" href="/contact">Contact</a></p></div>${cta()}`
}, CONTACT = {
  title: "Contact \xB7 SEO Fights",
  desc: "Questions, billing, partnerships or a fight you want to see. We reply within 24 hours.",
  h1: 'Talk to <span class="b">us</span>',
  lede: "Questions, billing, partnerships, or a fight you want to see. We reply within 24 hours.",
  body: `<form class="panel waitbox contact" id="cForm" novalidate>
<div class="field"><label for="cName">Name</label><input id="cName" autocomplete="name" required></div>
<div class="field"><label for="cEmail">Email</label><input id="cEmail" type="email" autocomplete="email" required></div>
<div class="field"><label for="cSub">Subject</label><select id="cSub"><option>General question</option><option>Billing and plans</option><option>Something's broken</option><option>Partnership</option><option>A fight I want to see</option><option value="Remove my site">Remove my site (take a fight page down)</option><option>Other</option></select></div>
<div class="field"><label for="cMsg">Message</label><textarea id="cMsg" rows="5" required></textarea></div>
<button class="btn fight" type="submit">Send message</button><p class="muted" id="cOut" role="status"></p>
<p class="muted">Faster? DM <a href="${X_URL}" target="_blank" rel="noopener">@${X_HANDLE}</a> on X. Need your paid access back? <a href="/account">Get your access link</a>.</p></form>
<script>if(new URLSearchParams(location.search).get("topic")==="removal"){document.getElementById("cSub").value="Remove my site";document.getElementById("cMsg").placeholder="Which fight page (link) and which site you own. We may ask you to prove you own it.";}
document.getElementById("cForm").addEventListener("submit",async e=>{e.preventDefault();const v=id=>document.getElementById(id).value.trim();const out=document.getElementById("cOut");const email=v("cEmail"),msg=v("cMsg");if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){out.textContent="Enter a valid email.";return;}if(msg.length<3){out.textContent="Write a message.";return;}out.textContent="Sending\u2026";try{const r=await fetch("/api/lead",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,plan:v("cSub")==="Remove my site"?"removal":"contact",info:{name:v("cName").slice(0,100),subject:v("cSub"),message:msg.slice(0,1500)}})});const j=await r.json();out.textContent=r.ok?"Sent. We'll reply within 24 hours.":(j.error||"Try again.");if(r.ok)e.target.reset();}catch{out.textContent="Try again.";}});</script>`
}, REMOVE = {
  title: "Remove my site \xB7 SEO Fights",
  desc: "Own a website shown in a fight? Ask us to take the fight page down.",
  h1: 'Remove <span class="r">my site</span>',
  lede: "Own a business shown in a fight? You can ask us to take the page down.",
  body: `<div class="panel terms">
<h3>What a fight page is</h3><p>Fight pages compare the public homepages of two websites with automated checks. The scores are estimates, not ranking guarantees, and SEO Fights is not affiliated with any brand shown.</p>
<h3>How to ask</h3><p>Send us the link to the fight page and tell us which site you own. Use an email at that site's domain if you can, so we can see it's really you.</p>
<h3>What happens next</h3><p>We reply within 2 business days. Once removed, the page shows "Fight removed", and it leaves our lists, sitemap and blog. We also stop re-running that fight on our own.</p></div>
<p style="margin-top:18px"><a class="btn fight" href="/contact?topic=removal" style="grid-column:auto;font-size:20px;padding:13px 22px">Ask for removal</a></p>`
}, POSTS = [
  {
    slug: "why-an-seo-fight-beats-an-audit",
    part: 1,
    title: "Why an SEO fight beats an SEO audit",
    desc: "An audit grades you alone. A fight shows the gap to the site you're actually losing to.",
    body: `<p>Run a normal SEO audit and you get a score, a red list and a shrug. Is 74 good? Are those 40 warnings urgent? There's no way to know, because you're being graded against a perfect site that doesn't exist.</p>
<h3>Search is a race, not a test</h3><p>Google doesn't hand out pass marks. It ranks you <b>against other pages</b> for the same search. So the only question that matters is: what does the site above you do that you don't?</p>
<h3>What a fight shows you</h3><ul><li><b>The real gap.</b> If your rival is missing schema too, it isn't why you're losing.</li><li><b>Priorities.</b> Fixes that close the gap come first. Everything else waits.</li><li><b>Proof.</b> "Our competitor has this and we don't" gets a fix approved faster than "the tool said so."</li></ul>
<h3>Try it</h3><p>Pick the site that outranks you most and put it in the ring. You'll know what to fix in about 20 seconds.</p>`
  },
  {
    slug: "seo-gaps-you-only-see-next-to-a-rival",
    part: 2,
    title: "5 SEO gaps you only see next to a rival",
    desc: "Five problems that look fine on their own and obvious side by side.",
    body: `<p>Some SEO problems are invisible until you put two sites next to each other. Here are the five we see most in fights.</p>
<h3>1. Thin pages</h3><p>300 words feels like plenty until the rival's page has 1,400 and answers every follow-up question.</p>
<h3>2. Weak titles</h3><p>"Home" or just your brand name, against a rival title that says exactly what they sell and where.</p>
<h3>3. Slow first load</h3><p>Two seconds sounds fast. It isn't if the other site loads in half a second.</p>
<h3>4. No structured data</h3><p>Their result shows stars, prices and FAQs. Yours is a plain blue link.</p>
<h3>5. Invisible to AI</h3><p>They have llms.txt and let AI crawlers in. ChatGPT recommends them, not you.</p>
<p>None of these show up as "critical" in a normal audit. In a fight, they're the whole story.</p>`
  },
  {
    slug: "is-your-site-ready-for-ai-search",
    part: 3,
    title: "Is your site ready for ChatGPT and AI search?",
    desc: "AI assistants now send real visitors. Here's how to check if they can read and quote you.",
    body: `<p>People ask ChatGPT, Claude and Perplexity which tool, shop or service to pick. Those answers come from sites the AI can read. If yours isn't one of them, you're not in the conversation.</p>
<h3>The quick checklist</h3><ul><li><b>Let AI crawlers in.</b> Check robots.txt isn't blocking GPTBot, ClaudeBot or PerplexityBot by accident.</li><li><b>Add llms.txt.</b> A short file that says who you are and links your key pages.</li><li><b>Write answers, not slogans.</b> Clear sentences AI can quote: what you do, who it's for, what it costs.</li><li><b>Use structured data.</b> Organization, Product and FAQ schema help machines understand you.</li></ul>
<p>Every SEO Fights has an "AI-ready" round that checks all of this for both sites. Our free <a href="/tools/llms-txt-generator">llms.txt generator</a> and <a href="/tools/robots-txt-generator">robots.txt generator</a> fix most of it in five minutes.</p>`
  },
  {
    slug: "track-10-keywords-not-500",
    part: 4,
    title: "Track 10 keywords, not 500",
    desc: "Most keyword lists are noise. Ten money keywords you fight for weekly will move the needle.",
    body: `<p>Big keyword lists feel productive. In practice nobody reads a 500-row rank report, and the 10 searches that bring buyers get lost.</p>
<h3>Pick the 10 that pay</h3><p>Choose searches where the person is ready to act: "best [thing] for [use]", "[thing] near me", "[you] vs [rival]", "[thing] price". If ranking #1 wouldn't make you money, drop it.</p>
<h3>Watch them against one rival</h3><p>Your position alone tells you little. Watching who's ahead, keyword by keyword, tells you where to push.</p>
<h3>Check weekly</h3><p>Daily moves are noise. Weekly moves are trends. That's why <a href="/keywords-battle">Keyword Battle</a> is 10 keywords, one rival, and a Monday email when positions move.</p>`
  },
  {
    slug: "what-to-fix-first-seo",
    part: 5,
    title: "What to fix first: rank SEO fixes by points",
    desc: "Stop working down the list. Do the fixes that close the most gap first.",
    body: `<p>The worst way to fix SEO is top to bottom. You burn a week on small stuff while the one fix that matters waits at item 31.</p>
<h3>Score every fix</h3><p>Each fix in an SEO Fights is worth points: how much it moves your score if you do it. Critical problems the rival doesn't have are worth the most.</p>
<h3>The order that works</h3><ol><li>Anything blocking Google or AI from reading the page.</li><li>Titles, descriptions and headings on your key pages.</li><li>Speed and mobile basics.</li><li>Content depth on the pages that should rank.</li><li>Structured data and polish.</li></ol>
<p>Do the top three fixes on your list, then run a rematch. Watching your score climb past theirs is the best motivation there is.</p>`
  },
  {
    slug: "beat-a-bigger-competitor-seo",
    part: 6,
    title: "How to beat a bigger competitor on SEO",
    desc: "You won't outspend them. You can out-focus them.",
    body: `<p>Big brands have more links, more pages and more money. They also have slow sites, generic pages and nobody who owns the details. That's your opening.</p>
<h3>Win the small searches</h3><p>They target broad terms. You go after specific ones: a city, a use case, a "vs" search. Fewer searches, much better odds.</p>
<h3>Be faster and cleaner</h3><p>Big sites carry years of scripts and trackers. A fast, tidy page wins technical rounds they can't.</p>
<h3>Answer better</h3><p>Write the page that answers the whole question, including the parts the big brand skips.</p>
<h3>Be the one AI quotes</h3><p>AI assistants quote clear answers, not big logos. Being AI-ready is the cheapest edge you'll ever get.</p>
<p>Put your site against the giant and see which rounds you can already win.</p>`
  }
], BLOG_INDEX = {
  title: "Blog \xB7 SEO Fights",
  desc: "Short, plain guides to winning SEO against the sites you compete with.",
  h1: 'Win <span class="r">SEO</span> by beating <span class="b">rivals</span>',
  lede: "Short, plain guides. No fluff.",
  body: `<div class="cards-list">${POSTS.map((p) => `<a class="panel post" href="/blog/${p.slug}"><span class="muted">Part ${p.part}</span><h3>${p.title}</h3><p class="muted">${p.desc}</p></a>`).join("")}</div>${cta("See pricing", "/pricing")}`
};
function postPage(p) {
  let i = POSTS.indexOf(p), next = POSTS[(i + 1) % POSTS.length];
  return {
    title: `${p.title} \xB7 SEO Fights`,
    desc: p.desc,
    h1: p.title,
    lede: p.desc,
    article: p,
    body: `<article class="panel terms post-body">${p.body}<p class="muted" style="margin-top:20px">By <a href="${X_URL}" target="_blank" rel="noopener">@${X_HANDLE}</a></p></article>
<p style="margin-top:16px"><a class="btn fight" href="/">Start a free fight</a> <a class="btn ghost" href="/blog/${next.slug}">Next: ${next.title}</a></p>`
  };
}
var ALTS = [
  ["ahrefs", "Ahrefs", "a huge backlink and keyword database"],
  ["semrush", "Semrush", "an all-in-one marketing suite"],
  ["moz", "Moz", "domain authority scores and keyword research"],
  ["ubersuggest", "Ubersuggest", "keyword ideas and simple site audits"],
  ["serpstat", "Serpstat", "keyword, rank and backlink tools in one place"],
  ["se-ranking", "SE Ranking", "rank tracking and site audits for agencies"],
  ["mangools", "Mangools", "easy keyword research with KWFinder"],
  ["spyfu", "SpyFu", "spying on competitors' paid and organic keywords"],
  ["similarweb", "Similarweb", "website traffic estimates and market data"],
  ["kwfinder", "KWFinder", "finding low-competition keywords"]
], ALT_PAGES = Object.fromEntries(ALTS.map(([slug, name, known]) => {
  let rows = [
    ["Head-to-head website fight", "\u2713 Built around it", "Not the main focus"],
    ["Clear winner and score", "\u2713", "Dashboards and metrics"],
    ["Ranked fix list with points", "\u2713", "Long audit lists"],
    ["AI search readiness (ChatGPT, Perplexity)", "\u2713 Every fight", "Varies"],
    ["Shareable fight page and video", "\u2713", "\u2717"],
    ["Keyword Battle vs one rival", "\u2713 10 keywords", "Large keyword tools"],
    ["Big backlink database", "\u2717 Not our focus", "\u2713"],
    ["Free plan", "\u2713 1 fight a week", "Limited or trial"],
    ["Starting price", "$19 / month", "Check their pricing page"]
  ];
  return [`/alternatives/${slug}-alternative`, {
    title: `The best ${name} alternative for comparing sites \xB7 SEO Fights`,
    desc: `Looking for a ${name} alternative? SEO Fights puts your site against a competitor, picks a winner and ranks the fixes. Free to try.`,
    h1: `The simple <span class="r">${name}</span> <span class="b">alternative</span>`,
    lede: `${name} is known for ${known}. If you just want to know why a competitor beats you and what to fix, SEO Fights does that in 20 seconds.`,
    body: `<div class="panel"><h3>${name} vs SEO Fights</h3><div class="tbl-wrap"><table><thead><tr><th>Feature</th><th>SEO Fights</th><th>${name}</th></tr></thead><tbody>${rows.map(([f, a, b]) => `<tr><td>${f}</td><td class="v">${a}</td><td class="v">${b}</td></tr>`).join("")}</tbody></table></div></div>
<div class="panel terms" style="margin-top:16px"><h3>When to pick ${name}</h3><p>Pick ${name} if you need ${known}, and you have the time to learn a big tool.</p>
<h3>When to pick SEO Fights</h3><p>Pick SEO Fights if you want one clear answer: who wins, why, and the exact moves to take the lead. Plain words, a winner, and a fix list worth points. Many people use both.</p></div>
<p style="margin-top:20px"><a class="btn fight" href="/">Start a free fight</a> <a class="btn ghost" href="/keywords-battle">Try Keyword Battle</a> <a class="btn ghost" href="/tools-like">More alternatives</a></p>`,
    name
  }];
})), TOOLS_LIKE = {
  title: "SEO tools like Ahrefs, Semrush and Moz \xB7 SEO Fights",
  desc: "Simple alternatives to the big SEO tools. Compare your site to a competitor for free.",
  h1: 'Tools <span class="b">like</span>',
  lede: "Simple alternatives to the big SEO suites.",
  body: `<div class="cards-list">${Object.entries(ALT_PAGES).map(([path, a]) => `<a class="panel post" href="${path}"><h3>${a.name} alternative</h3><p class="muted">Compare sites head to head, without the learning curve.</p></a>`).join("")}</div>${cta()}`
};

// src/mail.js
var C = { bg: "#EEF0F3", ink: "#10131A", muted: "#5D6474", line: "#E1E4EC", red: "#E1232E", blue: "#1D4ED8", gold: "#E8B21C", arena: "#0F1B3D" }, FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", DISPLAY = "Impact,'HelveticaNeue-CondensedBold','Helvetica Neue Condensed Bold','Arial Narrow Bold','Arial Narrow','Roboto Condensed','sans-serif-condensed','DejaVu Sans Condensed',Haettenschweiler,Arial,sans-serif", mailEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function mailButton(text, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:22px 0 6px"><tr>
<td bgcolor="${C.red}" style="background:${C.red};border:2px solid ${C.ink};border-right-width:5px;border-bottom-width:5px;border-radius:10px">
<a href="${mailEsc(href)}" target="_blank" style="display:inline-block;padding:14px 26px;font:700 20px/1 ${DISPLAY};font-synthesis:none;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none">${mailEsc(text)}</a>
</td></tr></table>`;
}
var mailP = (html2) => `<p style="margin:0 0 14px;font:400 16px/1.55 ${FONT};color:${C.ink}">${html2}</p>`, mailNote = (html2) => `<p style="margin:14px 0 0;font:400 13px/1.5 ${FONT};color:${C.muted}">${html2}</p>`, mailLink = (text, href) => `<a href="${mailEsc(href)}" style="color:${C.blue};text-decoration:underline">${mailEsc(text)}</a>`;
function mailTable(rows, head2) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:4px 0 16px">${head2 ? `<tr>${head2.map((h, i) => `<td style="padding:8px 10px;border-bottom:2px solid ${C.ink};font:700 11px/1 ${FONT};letter-spacing:1px;text-transform:uppercase;color:${C.muted};text-align:${i ? "center" : "left"}">${h}</td>`).join("")}</tr>` : ""}${rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:9px 10px;border-bottom:1px solid ${C.line};font:${i ? 600 : 400} 15px/1.4 ${FONT};color:${C.ink};text-align:${i && head2 ? "center" : "left"}">${c}</td>`).join("")}</tr>`).join("")}</table>`;
}
function mailScore(a, as, b, bs) {
  let cell = (host2, s, col, align) => `<td width="50%" style="padding:14px 16px;text-align:${align}"><div style="font:700 11px/1.2 ${FONT};letter-spacing:1px;text-transform:uppercase;color:${col}">${mailEsc(host2)}</div><div style="font:700 52px/1 ${DISPLAY};font-synthesis:none;color:${col};margin-top:6px">${mailEsc(s)}</div></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:4px 0 18px;background:${C.bg};border:2px solid ${C.ink};border-radius:12px"><tr>${cell(a, as, C.red, "left")}${cell(b, bs, C.blue, "right")}</tr></table>`;
}
function mail({ title, body = "", button, footer, site = "https://seofights.com", preheader, sender }) {
  let host2 = site.replace(/^https?:\/\//, "").replace(/\/$/, ""), pre = preheader || "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${mailEsc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${mailEsc(pre)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;border-collapse:separate">
<tr><td style="background:${C.arena};border:2px solid ${C.ink};border-bottom:0;border-radius:14px 14px 0 0;padding:16px 24px">
<a href="${mailEsc(site)}" style="text-decoration:none;font:700 26px/1 ${DISPLAY};font-synthesis:none;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff"><span style="color:#ffffff">SEO</span> <span style="font-size:22px">\u{1F94A}</span> <span style="color:#ffffff">FIGHTS</span></a>
</td></tr>
<tr><td style="padding:0;border-left:2px solid ${C.ink};border-right:2px solid ${C.ink};font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="50%" height="5" bgcolor="${C.red}" style="background:${C.red};height:5px;font-size:0;line-height:0">&nbsp;</td><td width="50%" height="5" bgcolor="${C.blue}" style="background:${C.blue};height:5px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:2px solid ${C.ink};border-top:0;border-radius:0 0 14px 14px;padding:28px 24px 26px">
<h1 style="margin:0 0 14px;font:700 32px/1.05 ${DISPLAY};font-synthesis:none;letter-spacing:.5px;text-transform:uppercase;color:${C.ink}">${mailEsc(title)}</h1>
${body}
${button ? mailButton(button.text, button.href) : ""}
</td></tr>
<tr><td style="padding:18px 8px 0;font:400 12px/1.6 ${FONT};color:${C.muted};text-align:center">
<b style="color:${C.ink}">SEO Fights</b> \xB7 <a href="${mailEsc(site)}" style="color:${C.muted};text-decoration:underline">${mailEsc(host2)}</a>${sender ? `<br>${sender}` : ""}${footer ? `<br>${footer}` : ""}
</td></tr>
</table></td></tr></table></body></html>`;
}
function toText(html2) {
  return String(html2).replace(/<(head|style|title)[\s\S]*?<\/\1>/gi, "").replace(/<div style="display:none[\s\S]*?<\/div>/i, "").replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => {
    let t = txt.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), h = href.replace(/&amp;/g, "&");
    return t && t !== h ? `${t} (${h})` : h;
  }).replace(/<br\s*\/?>/gi, `
`).replace(/<\/(p|h[1-6]|tr|li|div|table)>/gi, `
`).replace(/<\/td>/gi, "  ").replace(/<li[^>]*>/gi, "- ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").split(`
`).map((l) => l.replace(/[ \t]+/g, " ").trim()).join(`
`).replace(/\n{3,}/g, `

`).trim() + `
`;
}

// src/autoblog.js
var ROUNDS = [["onpage", "On-page"], ["content", "Content"], ["technical", "Technical"], ["ai", "AI-ready"], ["social", "Social"]], MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), monthYear = (t) => {
  let d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}, brand = (h) => h.replace(/^www\./, "").split(".").slice(0, -1).join("-") || h, postSlug = (a, b) => `${brand(a)}-vs-${brand(b)}-seo`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-"), postTitle = (d, at) => `${d.a.host} vs ${d.b.host} SEO: who wins and why (${monthYear(at)})`;
function planFor(site) {
  let total = site.checks.reduce((s, k) => s + k.weight, 0) || 1, order = { bad: 0, warn: 1 };
  return site.checks.filter((x) => x.status !== "good").sort((x, y) => order[x.status] - order[y.status] || y.weight - x.weight).map((x) => ({ label: x.label, status: x.status, fix: x.fix, gain: Math.round((x.status === "bad" ? 1 : 0.5) * x.weight / total * 100) }));
}
var sides = (d) => {
  let w = d.winner === "b" ? "b" : "a", l = w === "a" ? "b" : "a";
  return { w, l, W: d[w], L: d[l] };
};
function factsFor(d) {
  let { w, l, W: W2, L } = sides(d), diffs = (d.rows || []).filter((r) => r.edge && r.b).map((r) => ({ round: ROUNDS.find(([k]) => k === r.cat)?.[1] || r.cat, check: r.label, [d.a.host]: `${r.a.value} (${r.a.status})`, [d.b.host]: `${r.b.value} (${r.b.status})`, better: d[r.edge].host })), loserPlan = (L.checks ? planFor(L) : d.plan || []).slice(0, 5).map((p) => ({ fix: p.label, how: p.fix, points: p.gain, severity: p.status === "bad" ? "critical" : "improve" }));
  return {
    checked: new Date(d.at || Date.now()).toISOString().slice(0, 10),
    total_checks: (d.rows || []).length,
    rounds_count: 5,
    result: d.winner ? { winner: W2.host, winner_score: W2.score, loser: L.host, loser_score: L.score, margin: W2.score - L.score } : { tie: !0, score: d.a.score },
    rounds: ROUNDS.map(([k, n]) => ({ round: n, [d.a.host]: d.a.scores[k], [d.b.host]: d.b.scores[k] })),
    checks_won: { [d.a.host]: d.winsA ?? 0, [d.b.host]: d.winsB ?? 0 },
    top_differences: diffs.slice(0, 10),
    loser_fix_first: loserPlan,
    w,
    l
  };
}
function prompt(d) {
  let f = factsFor(d), { W: W2, L } = sides(d);
  return [
    { role: "system", content: "You write short, genuinely useful SEO articles for small business owners. Plain, simple English. Short sentences. No hype, no jargon without a quick explanation, no emojis. Use ONLY facts and numbers from the data you are given. Never invent numbers, rankings, traffic, revenue or dates. If something is not in the data, do not say it. Output Markdown with '## ' headings, short paragraphs and '- ' bullet lists. Do not write a title." },
    { role: "user", content: `Write a 500 to 700 word article about this real SEO fight between ${d.a.host} and ${d.b.host}, run by SEO Fights on ${f.checked} with ${f.total_checks} live checks in 5 rounds.

DATA (JSON):
${JSON.stringify({ ...f, w: void 0, l: void 0 })}

Use exactly these sections, as '## ' headings, in this order:
## The result
## Round by round
## What ${W2.host} does better
## What ${L.host} should fix first
## What a small business can copy

In "What ${L.host} should fix first", use the items in loser_fix_first, in that order, as a bullet list. In "Round by round", cover all 5 rounds and copy each round's two scores exactly from "rounds". In the last section, give 3 to 5 practical steps any small business site can do this week, based on the checks in the data.` }
  ];
}
function mdToHtml(md) {
  let inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<b>$1</b>").replace(/(^|\W)[*_]([^*_\n]+)[*_](?=\W|$)/g, "$1$2").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"), out = [], list = null, para = [], flushP = () => {
    para.length && (out.push(`<p>${inline(para.join(" "))}</p>`), para = []);
  }, flushL = () => {
    list && (out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`), list = null);
  };
  for (let raw of String(md || "").replace(/\r/g, "").split(`
`)) {
    let line = raw.trim();
    if (!line) {
      flushP(), flushL();
      continue;
    }
    let m;
    if ((m = line.match(/^#{1,6}\s+(.+?)\s*#*$/)) || (m = line.match(/^\*\*([^*]{3,80})\*\*:?$/))) {
      flushP(), flushL(), out.push(`<h3>${inline(m[1].replace(/\*\*/g, ""))}</h3>`);
      continue;
    }
    if (m = line.match(/^(?:[-*•+]|\d+[.)])\s+(.+)$/)) {
      flushP(), (list ||= []).push(m[1]);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushP(), flushL();
      continue;
    }
    flushL(), para.push(line);
  }
  return flushP(), flushL(), out.join(`
`);
}
function inventedNumbers(md, d) {
  let allowed = new Set(JSON.stringify(factsFor(d)).match(/\d+(?:\.\d+)?/g) || []), year = new Date(d.at || Date.now()).getUTCFullYear();
  ["500", "700", String(year), String(year - 1), "1200", "630"].forEach((x) => allowed.add(x));
  let words = String(md).replace(/\b[a-z0-9-]+\.[a-z]{2,}\b/gi, " ");
  return [...new Set(words.match(/\d+(?:\.\d+)?/g) || [])].filter((n) => !allowed.has(n) && !(Number(n) <= 10));
}
var ROUND_RE = { onpage: /\bon[- ]?page\b/i, content: /\bcontent\b/i, technical: /\btechnical\b/i, ai: /\bai[- ]?ready\b/i, social: /\bsocial\b/i };
function wrongRoundScores(md, d) {
  let bad = [];
  for (let seg of String(md).replace(/\b[a-z0-9-]+\.[a-z]{2,}\b/gi, " ").split(/\n|(?<=[.!?])\s+/)) {
    let hit = Object.keys(ROUND_RE).filter((k2) => ROUND_RE[k2].test(seg));
    if (hit.length !== 1) continue;
    let k = hit[0], ok = new Set([d.a.scores[k], d.b.scores[k], d.a.score, d.b.score, (d.rows || []).length, Math.abs(d.a.scores[k] - d.b.scores[k]), Math.abs(d.a.score - d.b.score)].map(String));
    for (let r of d.rows || []) if (r.cat === k) for (let v of [r.a?.value, r.b?.value]) for (let n of String(v ?? "").match(/\d+(?:\.\d+)?/g) || []) ok.add(n);
    for (let n of seg.match(/\d+(?:\.\d+)?/g) || []) Number(n) > 10 && !ok.has(n) && bad.push(n);
  }
  return bad;
}
function factsHtml(d, site) {
  let { W: W2, L } = sides(d), head2 = d.winner ? `<b>${esc(W2.host)}</b> wins ${W2.score} to ${L.score}.` : `It's a tie at ${d.a.score} points each.`;
  return `<div class="tbl-wrap"><table class="post-score"><thead><tr><th>Round</th><th>${esc(d.a.host)}</th><th>${esc(d.b.host)}</th></tr></thead><tbody>
${ROUNDS.map(([k, n]) => `<tr><td>${n}</td><td class="v${d.a.scores[k] > d.b.scores[k] ? " won-a" : ""}">${d.a.scores[k]}</td><td class="v${d.b.scores[k] > d.a.scores[k] ? " won-b" : ""}">${d.b.scores[k]}</td></tr>`).join("")}
<tr class="total"><td><b>Total</b></td><td class="v"><b>${d.a.score}</b></td><td class="v"><b>${d.b.score}</b></td></tr></tbody></table></div>
<p class="post-facts">${head2} ${(d.rows || []).length} live checks, run on ${new Date(d.at || Date.now()).toISOString().slice(0, 10)}. <a href="${site}/fight/${encodeURIComponent(d.slug)}">See every check in the full fight</a>.</p>`;
}
function postDesc(d) {
  let { W: W2, L } = sides(d);
  return d.winner ? `${W2.host} beats ${L.host} ${W2.score} to ${L.score} on ${(d.rows || []).length} live SEO checks. Round by round, what the winner does better, and what ${L.host} should fix first.` : `${d.a.host} and ${d.b.host} tie at ${d.a.score} on ${(d.rows || []).length} live SEO checks. Round by round results and what each should fix first.`;
}

// src/worker.js
var SITE = "https://seofights.com", UA = "Mozilla/5.0 (compatible; SEOFightsBot/1.0; +https://seofights.com/llms.txt)", esc2 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), unsafeHost = (h) => /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/i.test(h) || !/\.[a-z][a-z0-9-]{1,62}$/i.test(h), norm = (s) => {
  s = (s || "").trim(), /^https?:\/\//i.test(s) || (s = "https://" + s);
  let u = new URL(s);
  if (unsafeHost(u.hostname) || u.port) throw 0;
  return u.origin + "/";
}, normPage = (s) => {
  s = (s || "").trim(), /^https?:\/\//i.test(s) || (s = "https://" + s);
  let u = new URL(s);
  if (unsafeHost(u.hostname) || u.port) throw 0;
  return u.href;
}, hostOf = (u) => new URL(u).hostname.replace(/^www\./, "").toLowerCase(), slugOf = (a, b) => `${a}-vs-${b}`, json = (d, s = 200, h = {}) => Response.json(d, { status: s, headers: h }), ipOf = (req) => req.headers.get("cf-connecting-ip") || "anon", period = (p) => {
  let d = /* @__PURE__ */ new Date();
  if (p === "month") return d.toISOString().slice(0, 7);
  let day = Math.floor(d / 864e5);
  return "w" + Math.floor((day + 3) / 7);
}, rand = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join(""), safeNext = (n) => typeof n == "string" && n.startsWith("/") && !n.startsWith("//") ? n.slice(0, 300) : "/";
function cookie(req, name) {
  let m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
var WATERMARK = `

---
_Made with SEO Fights free \xB7 ${SITE} \xB7 Go Pro for clean reports, AI strategy and Keyword Battles._
`;
async function get(url, ms = 9e3) {
  let ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
var LIMITS = {
  free: { fights: [1, "week"], battles: [1, "week"], strategy: [0, "month"], rivals: [1, "week"], links: [1, "week"], gen: [1, "week"], hunts: [0, "month"], showdowns: [0, "month"] },
  pro: { fights: [40, "month"], battles: [4, "month"], strategy: [4, "month"], rivals: [60, "month"], links: [200, "month"], gen: [500, "month"], hunts: [0, "month"], showdowns: [2, "month"] },
  agency: { fights: [200, "month"], battles: [20, "month"], strategy: [20, "month"], rivals: [300, "month"], links: [1e3, "month"], gen: [2e3, "month"], hunts: [30, "month"], showdowns: [10, "month"] },
  lifetime: { fights: [40, "month"], battles: [0, "month"], strategy: [0, "month"], rivals: [60, "month"], links: [200, "month"], gen: [500, "month"], hunts: [0, "month"], showdowns: [1, "month"] },
  owner: { fights: [1e6, "month"], battles: [1e6, "month"], strategy: [1e6, "month"], rivals: [1e6, "month"], links: [1e6, "month"], gen: [1e6, "month"], hunts: [1e6, "month"], showdowns: [1e6, "month"] }
  // owner: unlimited
}, PLAN_NAMES = { free: "Free", pro: "Pro", agency: "Agency", lifetime: "Lifetime", owner: "Owner" }, paid = (m) => !!m && m.plan !== "free", planOf = (m) => m ? LIMITS[m.plan] ? m.plan : "pro" : "free", TOOL_LIMITS = { rivals: 3, keywords: 20 };
async function canUse(env, who, what, plan) {
  let [max, per] = LIMITS[plan][what.split(":")[0]];
  return max === 0 ? !1 : env.LIMITS ? parseInt(await env.LIMITS.get(`u:${what}:${period(per)}:${who}`) || "0", 10) < max : !0;
}
async function spend(env, who, what, plan) {
  if (!env.LIMITS) return;
  let per = LIMITS[plan][what.split(":")[0]][1], k = `u:${what}:${period(per)}:${who}`, n = parseInt(await env.LIMITS.get(k) || "0", 10);
  await env.LIMITS.put(k, String(n + 1), { expirationTtl: per === "month" ? 32 * 86400 : 8 * 86400 }), await logEv(env, "use", plan, what);
}
async function toolUse(env, req, what) {
  if (!env.LIMITS) return !0;
  let k = `t:${what}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}:${ipOf(req)}`, n = parseInt(await env.LIMITS.get(k) || "0", 10);
  return n >= TOOL_LIMITS[what] ? !1 : (await env.LIMITS.put(k, String(n + 1), { expirationTtl: 9e4 }), !0);
}
var NEED_ACCOUNT = () => json({ error: "Sign up free to use this.", signup: !0 }, 401), OUT = (plan, what) => json({ error: plan === "free" ? `You've used your free ${what} this week. Go Pro to keep going.` : `You've hit this month's ${what} limit. It resets on the 1st.` }, 429), LADDER = [[25, 49, "STRIPE_LIFETIME_LINK"], [75, 79, "STRIPE_LIFETIME_LINK_2"], [1 / 0, 129, "STRIPE_LIFETIME_LINK_3"]], LIFE_SOLD = 0, LIFE_AT = 0;
async function refreshLife(env) {
  if (!(!env.DB || Date.now() - LIFE_AT < 6e4)) {
    LIFE_AT = Date.now();
    try {
      LIFE_SOLD = (await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE plan='lifetime'").first()).n || 0;
    } catch {
    }
  }
}
function lifeTier(env) {
  let i = LADDER.findIndex(([cap2]) => LIFE_SOLD < cap2), [cap, price, key] = LADDER[i], left = cap === 1 / 0 ? null : cap - LIFE_SOLD;
  return { price, left, link: env[key] || env.STRIPE_LIFETIME_LINK || "#pricing", label: left === null ? "Final price" : `${left} of ${cap - (i ? LADDER[i - 1][0] : 0)} left at $${price}, then $${LADDER[i + 1][1]}` };
}
var NEW_TABLES = [
  "CREATE TABLE IF NOT EXISTS member_fights (member_key TEXT NOT NULL, slug TEXT NOT NULL, at INTEGER, PRIMARY KEY (member_key, slug))",
  "CREATE INDEX IF NOT EXISTS member_fights_at ON member_fights (member_key, at DESC)",
  "CREATE TABLE IF NOT EXISTS hunts (id INTEGER PRIMARY KEY AUTOINCREMENT, member_key TEXT, industry TEXT, city TEXT, result TEXT, at INTEGER)",
  "CREATE INDEX IF NOT EXISTS hunts_member ON hunts (member_key, at DESC)",
  "CREATE TABLE IF NOT EXISTS posts (slug TEXT PRIMARY KEY, title TEXT, desc TEXT, body TEXT, fight TEXT, at INTEGER)",
  "CREATE INDEX IF NOT EXISTS posts_at ON posts (at DESC)",
  "CREATE TABLE IF NOT EXISTS hidden_fights (slug TEXT PRIMARY KEY, at INTEGER)",
  "CREATE TABLE IF NOT EXISTS email_prefs (email TEXT PRIMARY KEY, fights INTEGER DEFAULT 1, keywords INTEGER DEFAULT 1, at INTEGER)",
  "CREATE TABLE IF NOT EXISTS deletions (email_hash TEXT, plan TEXT, stripe_customer TEXT, at INTEGER)",
  "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER)",
  "CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, plan TEXT, info TEXT)",
  "CREATE INDEX IF NOT EXISTS events_at ON events (at)",
  "CREATE INDEX IF NOT EXISTS events_kind_at ON events (kind, at)",
  "CREATE TABLE IF NOT EXISTS showdowns (id TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, keyword TEXT NOT NULL, gl TEXT DEFAULT 'us', start INTEGER, ends INTEGER, by TEXT, xa TEXT, xb TEXT, status TEXT DEFAULT 'live', winner TEXT, votes_a INTEGER DEFAULT 0, votes_b INTEGER DEFAULT 0, views INTEGER DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS showdown_ranks (id TEXT NOT NULL, day INTEGER NOT NULL, a_pos INTEGER, b_pos INTEGER, at INTEGER, PRIMARY KEY (id, day))"
], NOT_HIDDEN = "slug NOT IN (SELECT slug FROM hidden_fights)", HIDDEN = /* @__PURE__ */ new Set(), HIDDEN_AT = 0;
async function refreshHidden(env, force) {
  if (!(!env.DB || !force && Date.now() - HIDDEN_AT < 3e5)) {
    HIDDEN_AT = Date.now();
    try {
      await tables(env), HIDDEN = new Set((await env.DB.prepare("SELECT slug FROM hidden_fights").all()).results.map((r) => r.slug));
    } catch {
    }
  }
}
var TABLES_OK = null;
function tables(env) {
  return env.DB ? TABLES_OK ||= env.DB.batch(NEW_TABLES.map((s) => env.DB.prepare(s))).then(() => !0, () => (TABLES_OK = null, !1)) : Promise.resolve(!1);
}
async function logFight(env, key, slug) {
  try {
    await tables(env), await env.DB.prepare("INSERT INTO member_fights (member_key, slug, at) VALUES (?1, ?2, ?3) ON CONFLICT(member_key, slug) DO UPDATE SET at=?3").bind(key, slug, Date.now()).run();
  } catch {
  }
}
function d1Store(env) {
  let db = env.DB, ready = () => tables(env);
  return {
    async get(k) {
      await ready();
      let r = await db.prepare("SELECT v, exp FROM kv WHERE k=?1").bind(k).first();
      return r && !(r.exp && r.exp < Date.now()) ? r.v : null;
    },
    async put(k, v, o = {}) {
      await ready(), await db.prepare("INSERT INTO kv (k, v, exp) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?2, exp=?3").bind(k, String(v), o.expirationTtl ? Date.now() + o.expirationTtl * 1e3 : null).run();
    },
    async delete(k) {
      await ready(), await db.prepare("DELETE FROM kv WHERE k=?1").bind(k).run();
    }
  };
}
async function logEv(env, kind, plan, info) {
  if (env.DB)
    try {
      await tables(env), await env.DB.prepare("INSERT INTO events (at, kind, plan, info) VALUES (?1, ?2, ?3, ?4)").bind(Date.now(), kind, plan || null, info == null ? null : String(info).slice(0, 200)).run();
    } catch {
    }
}
function withStore(env) {
  if (!env.DB || env.__wrapped) return env;
  let e = { ...env, __wrapped: !0 };
  return e.LIMITS = d1Store(env), env.AI && (e.AI = { run: async (model, opts) => {
    let out = await env.AI.run(model, opts), inTok = JSON.stringify(opts && (opts.messages || opts.prompt) || "").length / 4, outTok = String(out && out.response || "").length / 4;
    return await logEv(e, "ai", null, Math.round(inTok * 0.026668 + outTok * 0.204805)), out;
  } }), e.__ev = (kind, info) => logEv(e, kind, null, info), e;
}
var SD_DAYS = 14, SD_OPENER = { a: "granola.ai", b: "otter.ai", keyword: "ai note taker", gl: "us" }, kwSlug = (k) => String(k).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60), sdDay = (sd, at = Date.now()) => Math.max(0, Math.min(SD_DAYS, Math.floor((at - sd.start) / 864e5))), posOf = (p) => p ?? 999;
async function sdGet(env, id) {
  await tables(env);
  let sd = await env.DB.prepare("SELECT * FROM showdowns WHERE id=?1").bind(id).first();
  return sd ? (sd.ranks = (await env.DB.prepare("SELECT day, a_pos, b_pos, at FROM showdown_ranks WHERE id=?1 ORDER BY day").bind(id).all()).results, sd) : null;
}
async function sdCheck(env, sd) {
  let day = sdDay(sd), r = (await battle(env, sd.a, sd.b, [sd.keyword], sd.gl || "us")).rows[0] || {};
  if (await env.DB.prepare("INSERT INTO showdown_ranks (id, day, a_pos, b_pos, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id, day) DO UPDATE SET a_pos=?3, b_pos=?4, at=?5").bind(sd.id, day, r.a ?? null, r.b ?? null, Date.now()).run(), day >= SD_DAYS) {
    let ranks = (await env.DB.prepare("SELECT a_pos, b_pos FROM showdown_ranks WHERE id=?1").bind(sd.id).all()).results, avg = (k) => ranks.reduce((t, x) => t + posOf(x[k]), 0) / (ranks.length || 1), fa = posOf(r.a), fb = posOf(r.b), winner = fa < fb ? "a" : fb < fa ? "b" : avg("a_pos") < avg("b_pos") ? "a" : avg("b_pos") < avg("a_pos") ? "b" : "tie";
    await env.DB.prepare("UPDATE showdowns SET status='done', winner=?2 WHERE id=?1").bind(sd.id, winner).run();
  }
  return r;
}
async function sdCreate(env, o) {
  await tables(env);
  let a = hostOf(norm(o.a)), b = hostOf(norm(o.b)), keyword = String(o.keyword || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  if (a === b) throw new Error("Pick two different websites.");
  if (keyword.length < 2) throw new Error('Enter a keyword, like "ai note taker".');
  let gl = COUNTRY[o.gl] ? o.gl : "us", id = `${a}-vs-${b}--${kwSlug(keyword)}`, old = await env.DB.prepare("SELECT id, status FROM showdowns WHERE id=?1").bind(id).first();
  if (old && old.status === "live") return { id, existed: !0 };
  let start = Date.now(), handle = (h) => (String(h || "").replace(/^@/, "").match(/^[A-Za-z0-9_]{1,15}$/) || [])[0] || null;
  if (await env.DB.prepare("INSERT INTO showdowns (id, a, b, keyword, gl, start, ends, by, xa, xb, status, winner, votes_a, votes_b, views) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'live',NULL,0,0,0) ON CONFLICT(id) DO UPDATE SET start=?6, ends=?7, by=?8, xa=?9, xb=?10, status='live', winner=NULL, votes_a=0, votes_b=0").bind(id, a, b, keyword, gl, start, start + SD_DAYS * 864e5, o.by || null, handle(o.xa), handle(o.xb)).run(), await env.DB.prepare("DELETE FROM showdown_ranks WHERE id=?1").bind(id).run(), env.SERPER_KEY)
    try {
      await sdCheck(env, { id, a, b, keyword, gl, start });
    } catch {
    }
  return await logEv(env, "showdown_new", null, id), { id, existed: !1 };
}
async function sdEnsureOpener(env) {
  try {
    await tables(env), (await env.DB.prepare("SELECT COUNT(*) AS n FROM showdowns").first()).n || await sdCreate(env, { ...SD_OPENER, by: "owner" });
  } catch {
  }
}
async function sdDaily(env) {
  if (!env.DB || !env.SERPER_KEY) return;
  await sdEnsureOpener(env);
  let live = (await env.DB.prepare("SELECT * FROM showdowns WHERE status='live' ORDER BY start LIMIT 60").all()).results;
  for (let sd of live) {
    let day = sdDay(sd);
    if (!await env.DB.prepare("SELECT 1 FROM showdown_ranks WHERE id=?1 AND day=?2").bind(sd.id, day).first() || day >= SD_DAYS)
      try {
        await sdCheck(env, sd);
      } catch {
      }
  }
}
async function sdList(env, status, limit = 24) {
  return await tables(env), (await env.DB.prepare(`SELECT s.*, (SELECT a_pos FROM showdown_ranks r WHERE r.id=s.id ORDER BY day DESC LIMIT 1) AS a_now, (SELECT b_pos FROM showdown_ranks r WHERE r.id=s.id ORDER BY day DESC LIMIT 1) AS b_now FROM showdowns s WHERE status=?1 ORDER BY ${status === "live" ? "views + votes_a + votes_b DESC, start DESC" : "start DESC"} LIMIT ?2`).bind(status, limit).all()).results;
}
var sdName = (h) => {
  let base = h.split(".").length > 2 && !/\.(co|com)\.[a-z]{2}$/.test(h) ? h.split(".").slice(-2)[0] : h.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}, sdRank = (p) => p == null ? "30+" : "#" + p;
function sdCard(sd) {
  let day = sdDay(sd), A = sdName(sd.a), B2 = sdName(sd.b), ic = (h) => `<img class="ico" src="/icon/${esc2(h)}" alt="" width="64" height="64" loading="lazy" onerror="this.remove()">`, lead = posOf(sd.a_now) < posOf(sd.b_now) ? "a" : posOf(sd.b_now) < posOf(sd.a_now) ? "b" : null;
  return `<a class="sd-card" href="/showdown/${esc2(sd.id)}"><span class="sd-kw">\u201C${esc2(sd.keyword)}\u201D</span>
<span class="sd-row ${lead === "a" ? "lead" : ""}"><b class="ra">${ic(sd.a)}${esc2(A)}</b><i>${sdRank(sd.a_now)}</i></span>
<span class="sd-row ${lead === "b" ? "lead" : ""}"><b class="rb">${ic(sd.b)}${esc2(B2)}</b><i>${sdRank(sd.b_now)}</i></span>
<span class="sd-foot">${sd.status === "done" ? sd.winner === "a" ? `\u{1F3C6} ${esc2(A)} won` : sd.winner === "b" ? `\u{1F3C6} ${esc2(B2)} won` : "Draw" : `Day ${day} of ${SD_DAYS}`}</span></a>`;
}
var SD_CSS = `<style>
.sd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:0 0 26px}@media(max-width:900px){.sd-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.sd-grid{grid-template-columns:1fr}}
.sd-card{display:grid;gap:8px;padding:16px;border-radius:18px;border:2px solid var(--ink);box-shadow:5px 5px 0 var(--ink);background:radial-gradient(90% 70% at 0% 100%,rgba(225,35,46,.25),transparent 60%),radial-gradient(90% 70% at 100% 0%,rgba(29,78,216,.3),transparent 60%),#0F1B3D;color:#fff;text-decoration:none}
.sd-kw{font:700 14px/1.2 var(--f-mono);color:var(--gold)}.sd-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font:800 24px/1 var(--f-display);text-transform:uppercase;opacity:.7}.sd-row.lead{opacity:1}.sd-row i{font-style:normal}.sd-row .ra{color:#ff6b79}.sd-row .rb{color:#8aa6ff}.sd-row .ico{width:22px;height:22px}
.sd-foot{font-size:14px;color:rgba(255,255,255,.7)}
.sd-hero{border-radius:24px;border:3px solid var(--gold);box-shadow:8px 8px 0 var(--ink);padding:clamp(18px,3vw,28px);background:radial-gradient(120% 80% at 50% 0%,#172654,#0F1B3D 70%);color:#fff;display:grid;gap:18px;margin-bottom:22px}
.sd-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font:700 13px/1.2 var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
.sd-board{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:end;text-align:center}.sd-side{display:grid;gap:4px;justify-items:center}.sd-side.trail{opacity:.6}
.sd-side .nm{display:flex;flex-direction:column;align-items:center;gap:8px;font:800 clamp(24px,3.4vw,38px)/1 var(--f-display);text-transform:uppercase}.sd-side .nm .ico{width:40px;height:40px;padding:3px}
.sd-side .rk{font:800 clamp(64px,9vw,110px)/.9 var(--f-display)}.sd-side.a .nm,.sd-side.a .rk{color:#ff4d5e}.sd-side.b .nm,.sd-side.b .rk{color:#6b8fff}.sd-side small{font:600 13px/1.2 var(--f-mono);color:rgba(255,255,255,.65);text-transform:uppercase}
.sd-mid{display:grid;gap:8px;justify-items:center;padding-bottom:26px}.sd-mid b{font:800 22px var(--f-display);color:rgba(255,255,255,.4)}
.sd-line{text-align:center;font-size:17px}.sd-chart{background:rgba(255,255,255,.04);border-radius:16px;padding:12px}.sd-chart svg{width:100%;height:auto;display:block}
.sd-pick{display:grid;gap:10px;justify-items:center;text-align:center}.sd-pick .btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.sd-pick button{min-height:48px;padding:0 20px;border-radius:14px;font:800 20px var(--f-display);text-transform:uppercase;cursor:pointer;border:2px solid #fff;color:#fff}.sd-pick .pa{background:#E1232E}.sd-pick .pb{background:#1D4ED8}
.sd-split{width:min(420px,100%);display:flex;height:10px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.12)}.sd-split i{display:block;height:100%}.sd-split .a{background:#ff4d5e}.sd-split .b{background:#5b84ff}
.sd-acts{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.sd-acts .btn{min-height:46px}
.sd-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sd-form label{display:grid;gap:6px;font:600 13px/1 var(--f-mono);text-transform:uppercase;color:var(--muted)}.sd-form input,.sd-form select{min-height:50px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:0 14px;font:500 17px var(--f-body)}.sd-form .full{grid-column:1/-1}@media(max-width:600px){.sd-form{grid-template-columns:1fr}}
</style>`;
function sdChart(sd, A, B2) {
  let x = (d) => 34 + d / SD_DAYS * 596, y = (p) => 12 + (Math.min(posOf(p), 31) - 1) / 30 * 182, line = (k, c) => {
    let pts = sd.ranks.map((r) => `${x(r.day).toFixed(1)},${y(r[k]).toFixed(1)}`);
    return pts.length ? `<polyline fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(" ")}"/>${sd.ranks.map((r) => `<circle cx="${x(r.day).toFixed(1)}" cy="${y(r[k]).toFixed(1)}" r="4" fill="${c}"><title>Day ${r.day}: ${sdRank(r[k])}</title></circle>`).join("")}` : "";
  }, grid = [1, 10, 20, 30].map((p) => `<line x1="34" x2="630" y1="${y(p)}" y2="${y(p)}" stroke="rgba(255,255,255,.12)"/><text x="28" y="${y(p) + 4}" text-anchor="end" font-size="11" fill="rgba(255,255,255,.55)">#${p}${p === 30 ? "+" : ""}</text>`).join(""), days = [[0, "start"], [7, "middle"], [14, "end"]].map(([d, an]) => `<text x="${x(d)}" y="214" text-anchor="${an}" font-size="11" fill="rgba(255,255,255,.55)">Day ${d}</text>`).join("");
  return `<div class="sd-chart"><svg viewBox="0 0 640 220" role="img" aria-label="Google rank per day: ${esc2(A)} in red, ${esc2(B2)} in blue. Higher is better.">${grid}${days}${line("a_pos", "#ff4d5e")}${line("b_pos", "#5b84ff")}</svg></div>`;
}
function sdPage(sd) {
  let A = sdName(sd.a), B2 = sdName(sd.b), day = sdDay(sd), last = sd.ranks[sd.ranks.length - 1] || {}, pa = last.a_pos, pb = last.b_pos, lead = posOf(pa) < posOf(pb) ? "a" : posOf(pb) < posOf(pa) ? "b" : null, done = sd.status === "done", ic = (h) => `<img class="ico" src="/icon/${esc2(h)}" alt="" width="64" height="64" onerror="this.remove()">`, line = done ? sd.winner === "a" || sd.winner === "b" ? `\u{1F3C6} <b>${esc2(sd.winner === "a" ? A : B2)}</b> wins the showdown.` : "It ended in a draw." : pa == null && pb == null ? "Neither site is in Google's top 30 for this yet." : lead ? `<b>${esc2(lead === "a" ? A : B2)}</b> leads${pa != null && pb != null ? ` by ${Math.abs(pa - pb)} spot${Math.abs(pa - pb) === 1 ? "" : "s"}` : ""} on day ${day}.` : `Dead even on day ${day}.`, ends = new Date(sd.ends).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Vancouver" }), url = `${SITE}/showdown/${sd.id}`, share = `\u{1F94A} SEO Showdown ${done ? "final" : `day ${day}/${SD_DAYS}`}
${A} ${sdRank(pa)} vs ${B2} ${sdRank(pb)} on Google for "${sd.keyword}"
${done ? "" : `who takes it? \u{1F447}
`}`, handles = [sd.xa, sd.xb].filter(Boolean).map((h) => "@" + h).join(" ");
  return `${SD_CSS}<div class="sd-hero">
<div class="sd-top"><span>\u{1F3C6} SEO Showdown \xB7 \u201C${esc2(sd.keyword)}\u201D \xB7 Google ${esc2(COUNTRY[sd.gl] || "US")}</span><span>${done ? "Final" : `Day ${day} of ${SD_DAYS} \xB7 ends ${esc2(ends)}`}</span></div>
<div class="sd-board"><div class="sd-side a ${lead === "b" ? "trail" : ""}"><span class="nm">${ic(sd.a)}${esc2(A)}</span><span class="rk">${sdRank(pa)}</span><small>on Google</small></div>
<div class="sd-mid"><b>VS</b></div>
<div class="sd-side b ${lead === "a" ? "trail" : ""}"><span class="nm">${ic(sd.b)}${esc2(B2)}</span><span class="rk">${sdRank(pb)}</span><small>on Google</small></div></div>
<p class="sd-line">${line}</p>
${sdChart(sd, A, B2)}
<div class="sd-pick" id="sdPick" data-id="${esc2(sd.id)}" data-a="${esc2(A)}" data-b="${esc2(B2)}" data-va="${sd.votes_a || 0}" data-vb="${sd.votes_b || 0}">
<b>${done ? "Who did people pick?" : "Who takes Google on day 14?"}</b>
<div class="btns"${done ? " hidden" : ""}><button type="button" class="pa" data-side="a">${esc2(A)}</button><button type="button" class="pb" data-side="b">${esc2(B2)}</button></div>
<div class="sd-split" id="sdSplit" hidden><i class="a"></i><i class="b"></i></div><span id="sdCrowd" class="muted"></span></div>
<div class="sd-acts"><a class="btn fight" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(share + (handles ? handles + `
` : ""))}&url=${encodeURIComponent(url)}">Post on X</a><a class="btn ghost" href="/fight/${esc2(slugOf(sd.a, sd.b))}" style="color:#fff;border-color:rgba(255,255,255,.4)">See the page fight</a><a class="btn ghost" href="/showdowns#new" style="color:#fff;border-color:rgba(255,255,255,.4)">Start your own</a></div>
</div>
<p class="muted">We check Google once a day (top 30 results, ${esc2(COUNTRY[sd.gl] || "United States")}). \u201C30+\u201D means not in the top 30. After ${SD_DAYS} days, the better rank wins. Ties go to the better average.</p>
<script>(()=>{const box=document.getElementById("sdPick");if(!box)return;const id=box.dataset.id,key="sdpick:"+id;let va=+box.dataset.va,vb=+box.dataset.vb;
const show=(side)=>{const t=va+vb||1,sa=Math.round(va/t*100);const sp=document.getElementById("sdSplit");sp.hidden=false;sp.children[0].style.width=sa+"%";sp.children[1].style.width=(100-sa)+"%";
document.getElementById("sdCrowd").textContent=(side?"You picked "+(side==="a"?box.dataset.a:box.dataset.b)+" \xB7 ":"")+sa+"% "+box.dataset.a+" \xB7 "+(100-sa)+"% "+box.dataset.b;const b=box.querySelector(".btns");if(b&&side)b.hidden=true;};
let mine=null;try{mine=localStorage.getItem(key)}catch{}if(mine||box.querySelector(".btns").hidden)show(mine);
box.querySelectorAll("button[data-side]").forEach(btn=>btn.addEventListener("click",async()=>{const side=btn.dataset.side;try{localStorage.setItem(key,side)}catch{}if(side==="a")va++;else vb++;show(side);
try{const r=await fetch("/api/showdown/vote",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,side})});if(r.ok){const j=await r.json();va=j.votes_a;vb=j.votes_b;show(side);}}catch{}}));})();</script>`;
}
function sdIndex(live, done) {
  return `${SD_CSS}<h2 class="display" style="font-size:clamp(34px,5vw,52px);margin:6px 0 14px">Live now</h2>
<div class="sd-grid">${live.map(sdCard).join("") || '<p class="muted">No live showdowns yet. Start the first one below.</p>'}</div>
${done.length ? `<h2 class="display" style="font-size:clamp(34px,5vw,52px);margin:6px 0 14px">Finished</h2><div class="sd-grid">${done.map(sdCard).join("")}</div>` : ""}
<form class="panel" id="new" novalidate><h3>Start a showdown</h3><p class="sub">2 sites, 1 keyword, ${SD_DAYS} days. We check Google every day and keep score in public. Pro gets 2 a month, Agency 10, Lifetime 1.</p>
<div class="sd-form"><label>Red corner<input id="sdA" placeholder="yoursite.com" autocomplete="off"></label><label>Blue corner<input id="sdB" placeholder="rival.com" autocomplete="off"></label>
<label class="full">Keyword<input id="sdK" placeholder="ai note taker" autocomplete="off"></label>
<label>Country<select id="sdG">${Object.entries(COUNTRY).map(([k, v]) => `<option value="${k}">${esc2(v)}</option>`).join("")}</select></label>
<label>X handles (optional)<input id="sdX" placeholder="@you @rival" autocomplete="off"></label></div>
<p id="sdMsg" class="muted" hidden></p><button class="btn fight" type="submit" id="sdGo" style="margin-top:14px">Start the showdown</button></form>
<script>(()=>{const f=document.getElementById("new"),$=s=>document.getElementById(s),msg=t=>{$("sdMsg").textContent=t;$("sdMsg").hidden=!t};
f.addEventListener("submit",e=>{e.preventDefault();const a=$("sdA").value.trim(),b=$("sdB").value.trim(),keyword=$("sdK").value.trim();if(!a||!b||!keyword){msg("Fill in both sites and a keyword.");return;}
const go=async()=>{$("sdGo").disabled=true;$("sdGo").textContent="Checking Google\u2026";const xs=$("sdX").value.match(/@?[A-Za-z0-9_]{1,15}/g)||[];
try{const r=await fetch("/api/showdown",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({a,b,keyword,gl:$("sdG").value,xa:xs[0]||"",xb:xs[1]||""})});
if(window.gateCheck&&!(await window.gateCheck(r)))return;const j=await r.json();if(!r.ok){msg(j.error||"Try again.");return;}location.href="/showdown/"+j.id;}
catch{msg("Try again.");}finally{$("sdGo").disabled=false;$("sdGo").textContent="Start the showdown";}};
window.withAccount?window.withAccount(go,"Sign up to start a showdown","Free account first. Showdowns are part of Pro: 2 a month, checked on Google every day.","/showdowns#new"):go();});})();</script>`;
}
async function adminHtml(env) {
  await tables(env);
  let now = Date.now(), H = 36e5, D = 864e5, utc0 = Date.UTC((/* @__PURE__ */ new Date()).getUTCFullYear(), (/* @__PURE__ */ new Date()).getUTCMonth(), (/* @__PURE__ */ new Date()).getUTCDate()), q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results, one = async (sql, ...b) => await env.DB.prepare(sql).bind(...b).first() || {}, [kinds, plans, aiToday, mailToday, serpAll, sales, recent, top, series, uses] = await Promise.all([
    q("SELECT kind, SUM(at > ?1) AS d1, SUM(at > ?2) AS d7, COUNT(*) AS total FROM events GROUP BY kind", now - D, now - 7 * D),
    q("SELECT plan, COUNT(*) AS n FROM members WHERE active=1 GROUP BY plan"),
    one("SELECT COALESCE(SUM(CAST(info AS INTEGER)), 0) AS n FROM events WHERE kind='ai' AND at >= ?1", utc0),
    one("SELECT COUNT(*) AS n FROM events WHERE kind='email' AND at >= ?1", utc0),
    one("SELECT COUNT(*) AS n FROM events WHERE kind='serper'"),
    q("SELECT info, plan, at FROM events WHERE kind='sale' ORDER BY at DESC"),
    q("SELECT at, kind, plan, info FROM events WHERE kind NOT IN ('ai','email','serper','use') ORDER BY at DESC LIMIT 30"),
    q(`SELECT slug, views, COALESCE(votes_a,0) + COALESCE(votes_b,0) AS picks FROM fights WHERE ${NOT_HIDDEN} ORDER BY views DESC LIMIT 8`),
    q("SELECT CAST((at - ?1) / 86400000 AS INTEGER) AS d, kind, COUNT(*) AS n FROM events WHERE at >= ?1 AND kind IN ('signup','fight','fight_anon','pick','sale','wall') GROUP BY d, kind", now - 30 * D),
    q("SELECT info AS what, COUNT(*) AS n FROM events WHERE kind='use' AND at > ?1 GROUP BY info ORDER BY n DESC", now - 7 * D)
  ]), K = Object.fromEntries(kinds.map((r) => [r.kind, r])), k = (n, f = "d1") => K[n] && K[n][f] || 0, P = Object.fromEntries(plans.map((r) => [r.plan, r.n])), pc = (n) => P[n] || 0, mrr = pc("pro") * 19 + pc("agency") * 99, members = Object.values(P).reduce((a, b) => a + b, 0), money = sales.reduce((a, r) => a + (parseFloat(r.info) || 0), 0), ladder = LADDER.find(([cap]) => LIFE_SOLD < cap) || LADDER[LADDER.length - 1], left = ladder[0] === 1 / 0 ? "no cap" : `${ladder[0] - LIFE_SOLD} left at $${ladder[1]}`, t = (ms) => new Date(ms).toLocaleString("en-CA", { timeZone: "America/Vancouver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), tile = (label, v, sub = "") => `<div class="st-tile"><span>${esc2(label)}</span><b>${esc2(String(v))}</b>${sub ? `<small>${esc2(sub)}</small>` : ""}</div>`, meter = (label, used, cap, note) => {
    let pct = Math.min(100, Math.round(used / cap * 100));
    return `<div class="st-meter"><div><b>${esc2(label)}</b><span>${used.toLocaleString()} of ${cap.toLocaleString()} ${esc2(note)}</span></div><div class="st-bar ${pct > 80 ? "hot" : ""}"><i style="width:${pct}%"></i></div></div>`;
  }, days = [...Array(30)].map((_, i) => i), sum = (kinds2) => days.map((d) => series.filter((r) => r.d === d && kinds2.includes(r.kind)).reduce((a, r) => a + r.n, 0)), chart = (label, vals, color) => {
    let max = Math.max(1, ...vals), W2 = 600, Hh = 90, bw = W2 / vals.length;
    return `<figure class="st-chart"><figcaption><b>${esc2(label)}</b><span>${vals.reduce((a, b) => a + b, 0).toLocaleString()} in 30 days \xB7 today ${vals[vals.length - 1]}</span></figcaption><svg viewBox="0 0 ${W2} ${Hh}" role="img" aria-label="${esc2(label)} per day, last 30 days" preserveAspectRatio="none">${vals.map((v, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(Hh - v / max * (Hh - 4)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(v / max * (Hh - 4)).toFixed(1)}" rx="2" fill="${color}"><title>${v}</title></rect>`).join("")}</svg></figure>`;
  }, NAMES = { signup: "\u{1F195} Sign-up", fight: "\u{1F94A} Fight (member)", fight_anon: "\u{1F440} Fight (no account)", pick: "\u{1F446} Pick", wall: "\u{1F9F1} Hit the wall", sale: "\u{1F4B0} Sale", cancel: "\u21A9\uFE0F Cancel", link_sent: "\u{1F4EC} Sign-in link sent" };
  return `<style>
.st-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 22px}.st-tile{border:2px solid var(--ink);border-radius:16px;padding:14px;background:var(--surface);display:grid;gap:4px}.st-tile span{font:600 13px/1.2 var(--f-mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.st-tile b{font:800 40px/1 var(--f-display)}.st-tile small{color:var(--muted);font-size:14px}
.st-sec{margin:28px 0 12px;font:800 28px/1 var(--f-display);text-transform:uppercase}.st-chart{margin:0 0 14px;padding:14px;border-radius:16px;background:var(--surface);border:1px solid var(--line)}.st-chart figcaption{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}.st-chart span{color:var(--muted);font-size:14px}.st-chart svg{width:100%;height:90px;display:block}
.st-meter{display:grid;gap:6px;margin:0 0 14px}.st-meter>div:first-child{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.st-meter span{color:var(--muted);font-size:14px}.st-bar{height:10px;border-radius:99px;background:var(--line);overflow:hidden}.st-bar i{display:block;height:100%;background:#22c55e}.st-bar.hot i{background:#ef4444}
.st-tbl{width:100%;border-collapse:collapse;font-size:15px}.st-tbl td,.st-tbl th{padding:9px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.st-tbl th{font:600 13px/1 var(--f-mono);text-transform:uppercase;color:var(--muted)}.st-tbl td.n{text-align:right;font-variant-numeric:tabular-nums}.st-wrap{overflow-x:auto}
@media(max-width:760px){.st-grid{grid-template-columns:1fr 1fr}.st-tile b{font-size:32px}}
</style>
<h2 class="st-sec">Last 24 hours</h2>
<div class="st-grid">${tile("Sign-ups", k("signup"), `${k("signup", "d7")} this week`)}${tile("Fights", k("fight") + k("fight_anon"), `${k("fight_anon")} without an account`)}${tile("Picks", k("pick"), `${k("pick", "d7")} this week`)}${tile("Hit the wall", k("wall"), "asked to sign up or upgrade")}</div>
<h2 class="st-sec">Money</h2>
<div class="st-grid">${tile("MRR", `$${mrr}`, `${pc("pro")} Pro \xB7 ${pc("agency")} Agency`)}${tile("All-time sales", `$${money.toFixed(0)}`, `${sales.length} checkouts`)}${tile("Lifetime", pc("lifetime"), left)}${tile("Accounts", members, `${pc("free")} free`)}</div>
<h2 class="st-sec">Last 30 days</h2>
${chart("Sign-ups", sum(["signup"]), "#E1232E")}${chart("Fights", sum(["fight", "fight_anon"]), "#1D4ED8")}${chart("Picks", sum(["pick"]), "#E8B21C")}${chart("Hit the sign-up wall", sum(["wall"]), "#8b93a7")}
<h2 class="st-sec">Free limits today</h2>
${meter("Workers AI", aiToday.n || 0, 1e4, "neurons (resets 5pm)")}${meter("Sign-in and other emails", mailToday.n || 0, 100, "emails (Resend free)")}${meter("Google searches (Serper)", serpAll.n || 0, 2500, "free searches, all time")}
<h2 class="st-sec">Tools used this week</h2>
<div class="st-wrap"><table class="st-tbl"><tr><th>Tool</th><th class="n">Uses</th></tr>${uses.map((r) => `<tr><td>${esc2(r.what)}</td><td class="n">${r.n}</td></tr>`).join("") || '<tr><td colspan="2">Nothing yet.</td></tr>'}</table></div>
<h2 class="st-sec">Most viewed fights</h2>
<div class="st-wrap"><table class="st-tbl"><tr><th>Fight</th><th class="n">Views</th><th class="n">Picks</th></tr>${top.map((r) => `<tr><td><a href="/fight/${esc2(r.slug)}">${esc2(r.slug.replace("-vs-", " vs "))}</a></td><td class="n">${r.views || 0}</td><td class="n">${r.picks || 0}</td></tr>`).join("")}</table></div>
<h2 class="st-sec">Latest activity</h2>
<div class="st-wrap"><table class="st-tbl"><tr><th>When</th><th>What</th><th>Details</th></tr>${recent.map((r) => `<tr><td>${t(r.at)}</td><td>${NAMES[r.kind] || esc2(r.kind)}${r.plan && r.plan !== "free" ? ` \xB7 ${esc2(r.plan)}` : ""}</td><td>${esc2(r.info || "")}</td></tr>`).join("") || '<tr><td colspan="3">Nothing yet. Activity shows up here as it happens.</td></tr>'}</table></div>
<p class="muted" style="margin-top:18px">Visitors, countries and where people came from: Cloudflare dashboard \u2192 Analytics &amp; Logs \u2192 Web Analytics.</p>`;
}
async function member(req, env) {
  let key = cookie(req, "rf_key");
  return !key || !env.DB ? null : env.DB.prepare("SELECT * FROM members WHERE key=?1 AND active=1").bind(key).first();
}
var SIGNOUT_COOKIE = "rf_key=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax", cookieFor = (key) => `rf_key=${key}; Path=/; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax`;
async function loginEmail(env, email, via = "link") {
  let old = await env.DB.prepare("SELECT key, plan, active FROM members WHERE email=?1").bind(email).first();
  if (old && old.active) return old.key;
  if (old)
    return await env.DB.prepare("UPDATE members SET plan='free', active=1 WHERE email=?1").bind(email).run(), old.key;
  let key = rand();
  return await env.DB.prepare("INSERT INTO members (key, email, plan, active, created_at) VALUES (?1, ?2, 'free', 1, ?3)").bind(key, email, Date.now()).run(), await logEv(env, "signup", "free", `${via}: ${email}`), key;
}
var signedIn = (key, next, extra) => {
  let h = new Headers({ location: next });
  return h.append("set-cookie", cookieFor(key)), extra && h.append("set-cookie", extra), new Response(null, { status: 302, headers: h });
};
async function fetchSite(url, env, cheap) {
  let t0 = Date.now(), res = await get(url), html2 = (await res.text()).slice(0, 2e6), ms = Date.now() - t0, finalUrl = res.url || url, origin = new URL(finalUrl).origin, [robots, sitemap, llms, speed] = await Promise.all([
    get(origin + "/robots.txt", 5e3).then((r) => r.ok ? r.text() : null).catch(() => null),
    get(origin + "/sitemap.xml", 5e3).then((r) => r.ok ? r.text().then((t) => /<(urlset|sitemapindex)/i.test(t)) : !1).catch(() => !1),
    get(origin + "/llms.txt", 5e3).then((r) => r.ok && !/html/i.test(r.headers.get("content-type") || "")).catch(() => !1),
    cheap ? null : pagespeed(finalUrl, env).catch(() => null)
    // anonymous fights skip every paid API: page fetches only
  ]);
  return { url: finalUrl, html: html2, status: res.status, ms, headers: Object.fromEntries(res.headers), robots, sitemap, llms, redirects: res.redirected ? 1 : 0, speed };
}
async function pagespeed(url, env) {
  if (!env.PSI_KEY) return null;
  let lcp = (await (await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&key=${env.PSI_KEY}`)).json())?.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
  return lcp ? { lcp: lcp / 1e3 } : null;
}
var Blocked = class extends Error {
};
function blockedHost(p) {
  let challenge = /cf-browser-verification|cf_chl_|just a moment\.\.\.|attention required|access denied|captcha|px-captcha|_incapsula_|are you a robot|request unsuccessful/i, tiny = p.html.length < 1500;
  return !!([401, 403, 429, 503].includes(p.status) || (p.status === 202 || tiny) && challenge.test(p.html.slice(0, 2e4)));
}
async function runFight(a, b, env, cheap = !1) {
  let [pa, pb] = await Promise.all([fetchSite(a, env, cheap), fetchSite(b, env, cheap)]), blocked = [pa, pb].filter(blockedHost).map((p) => hostOf(p.url));
  if (blocked.length) throw new Blocked(blocked.length === 2 ? `${blocked[0]} and ${blocked[1]} both block SEO robots, so we can't score them fairly. Try other sites.` : `${blocked[0]} blocks SEO robots, so we can't score it fairly. Try another site.`);
  let d = duel(analyze(pa), analyze(pb));
  return d.slug = slugOf(d.a.host, d.b.host), d.at = Date.now(), d;
}
var withReport = (d, pro) => ({ ...d, markdown: toMarkdown(d) + (pro ? "" : WATERMARK) });
function teaser(d) {
  let lose = d.winner === "a" ? "b" : "a", plan = lose === "a" ? d.plan || [] : d.b.checks ? planFor(d.b) : [], margin = Math.abs(d.a.score - d.b.score), fixes = 0, pts = 0;
  for (let x of plan) {
    if (fixes && pts > margin) break;
    fixes++, pts += x.gain;
  }
  let side = (x) => ({ host: x.host, score: x.score, scores: x.scores });
  return {
    slug: d.slug,
    a: side(d.a),
    b: side(d.b),
    winner: d.winner || null,
    at: d.at,
    votes_a: d.votes_a || 0,
    votes_b: d.votes_b || 0,
    category: d.category || null,
    locked: !0,
    tease: { margin, fixes, pts, loser: d.winner ? lose : null, checks: (d.rows || []).length || 31, lost: d.winner ? (d.rows || []).filter((r) => r.edge === d.winner).length : 0 }
  };
}
async function saveFight(env, d) {
  env.DB && await env.DB.prepare(
    `INSERT INTO fights (slug, a, b, a_score, b_score, winner, data, views, created_at, updated_at, category)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8, ?9)
     ON CONFLICT(slug) DO UPDATE SET a_score=?4, b_score=?5, winner=?6, data=?7, views=views+1, updated_at=?8, category=COALESCE(category, ?9)`
  ).bind(d.slug, d.a.host, d.b.host, d.a.score, d.b.score, d.winner || "", JSON.stringify(d), d.at, d.category || CATEGORY_OF.get(d.slug) || null).run();
}
async function storedFight(env, slug) {
  let row = env.DB && await env.DB.prepare("SELECT data, updated_at, COALESCE(votes_a,0) AS votes_a, COALESCE(votes_b,0) AS votes_b, category FROM fights WHERE slug=?1").bind(slug).first();
  return row ? { d: { ...JSON.parse(row.data), votes_a: row.votes_a, votes_b: row.votes_b, category: row.category }, age: Date.now() - row.updated_at } : null;
}
var FOTN = "", FOTN_AT = 0, HEADLINERS = ["apple.com-vs-samsung.com", "nike.com-vs-adidas.com", "coca-cola.com-vs-pepsi.com", "openai.com-vs-anthropic.com", "uber.com-vs-lyft.com", "netflix.com-vs-disneyplus.com", "amazon.com-vs-walmart.com", "playstation.com-vs-xbox.com", "instagram.com-vs-tiktok.com", "starbucks.com-vs-dunkindonuts.com", "airbnb.com-vs-vrbo.com", "tesla.com-vs-rivian.com", "dominos.com-vs-pizzahut.com", "spotify.com-vs-soundcloud.com", "google.com-vs-bing.com", "doordash.com-vs-ubereats.com", "shein.com-vs-temu.com", "duolingo.com-vs-babbel.com"];
async function nightData(env) {
  if (!FOTN) return null;
  let f = await storedFight(env, FOTN);
  if (!f) return null;
  let d = f.d;
  return { slug: d.slug, winner: d.winner, votes_a: d.votes_a, votes_b: d.votes_b, a: { host: d.a.host, score: d.a.score, scores: d.a.scores }, b: { host: d.b.host, score: d.b.score, scores: d.b.scores }, checks: (d.rows || []).length, rows: (d.rows || []).map((r) => [r.cat, r.label, r.a ? r.a.value : "", r.a ? r.a.status : "", r.b ? r.b.value : "", r.b ? r.b.status : "", r.edge || ""]) };
}
async function refreshFotn(env) {
  if (!(!env.DB || Date.now() - FOTN_AT < 6e5)) {
    FOTN_AT = Date.now();
    try {
      await tables(env);
      let have = new Set((await env.DB.prepare(`SELECT slug FROM fights WHERE category IS NOT NULL AND ${NOT_HIDDEN}`).all()).results.map((r) => r.slug)), pool = HEADLINERS.filter((x) => have.has(x)), list = pool.length ? pool : [...have].sort();
      list.length && (FOTN = list[Math.floor(Date.now() / 864e5) % list.length]);
    } catch {
    }
  }
}
async function aiStrategy(env, d) {
  let messages = [
    { role: "system", content: "You are a blunt, practical SEO coach. Write in plain, simple English for a small business owner. No jargon without a short explanation. Use short headings and bullet points. Never invent numbers that are not in the report." },
    { role: "user", content: `Here is an SEO comparison of my site (${d.a.host}) against my competitor (${d.b.host}).

${toMarkdown(d)}

Write my game plan to beat them: 1) why they're ahead (or why I'm ahead), 2) the 5 moves to make this week in order, 3) 5 pages or topics I should write to win their searches, 4) one thing to do so ChatGPT and Perplexity can read and quote my site. Keep it under 400 words.` }
  ];
  if (env.OPENROUTER_KEY) {
    let r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENROUTER_KEY}`, "content-type": "application/json", "HTTP-Referer": SITE, "X-Title": "SEO Fights" },
      body: JSON.stringify({ model: env.AI_MODEL || "anthropic/claude-sonnet-4.5", messages })
    });
    if (!r.ok) throw new Error("ai");
    return (await r.json()).choices?.[0]?.message?.content || "";
  }
  return (await env.AI.run(env.CF_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages, max_tokens: 900 }))?.response || "";
}
async function pitchFor(env, d, industry, city, rank = "?", leadRank = 1) {
  let fixes = d.plan.slice(0, 3).map((p) => p.label.toLowerCase()).join(", "), msgs = [
    { role: "system", content: "You write short, friendly cold emails for an SEO agency. Plain English, no hype, no jargon, under 110 words. Start with a subject line on its own line like 'Subject: ...'. Never invent numbers beyond the ones given. Sign off as '[Your name]'." },
    { role: "user", content: d.a.score < d.b.score ? `Prospect: ${d.a.host} (${industry} in ${city}), ranked #${rank} on Google. Their top Google competitor: ${d.b.host}, ranked #${leadRank}. SEO Fights score: ${d.a.host} ${d.a.score}/100 vs ${d.b.host} ${d.b.score}/100, so the prospect is behind by ${d.b.score - d.a.score} points. Biggest gaps: ${fixes || "minor polish"}. Write the email offering to fix these so they can outrank ${d.b.host}. Mention they can see the full side-by-side fight at the link [fight link].` : `Prospect: ${d.a.host} (${industry} in ${city}), ranked #${rank} on Google. The top result is ${d.b.host} at #${leadRank}. On our page checks the prospect actually scores higher (${d.a.score}/100 vs ${d.b.score}/100), yet ranks lower on Google. Do NOT say they are behind on the score. Explain that their page is solid but they are still below ${d.b.host} on Google, and offer to close the remaining gaps (${fixes || "minor polish"}) and help them climb. Mention they can see the full side-by-side fight at the link [fight link].` }
  ];
  try {
    let out = await env.AI.run(env.CF_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: msgs, max_tokens: 320 });
    return String(out?.response || "").trim();
  } catch {
    return "";
  }
}
async function prospectHunt(env, industry, city, gl) {
  let list = await localBusinesses(env, industry, city, gl);
  if (list.length < 2) return { leader: null, prospects: [] };
  let leader = list[0], targets = list.slice(2, 10), results = [];
  for (let i = 0; i < targets.length && results.length < 6; i += 3) {
    let batch = await Promise.all(targets.slice(i, i + 3).map(async (t) => {
      try {
        let d = await runFight(norm(t.host), norm(leader.host), env);
        return await saveFight(env, d), { t, d };
      } catch {
        return null;
      }
    }));
    for (let r of batch) r && results.length < 6 && results.push(r);
  }
  let out = await Promise.all(results.map(async ({ t, d }) => {
    let fight = `${SITE}/fight/${encodeURIComponent(d.slug)}`;
    return {
      host: d.a.host,
      rank: t.pos,
      score: d.a.score,
      rival: d.b.host,
      rivalScore: d.b.score,
      gap: d.b.score - d.a.score,
      fixes: d.plan.slice(0, 3).map((p) => p.label),
      fight,
      pitch: (await pitchFor(env, d, industry, city, t.pos, leader.pos)).replace(/\[fight link\]/gi, fight)
    };
  }));
  return out.sort((x, y) => (y.gap > 0) - (x.gap > 0) || y.gap - x.gap || x.rank - y.rank), { leader: { host: leader.host, rank: leader.pos }, prospects: out };
}
async function aiRivals(env, siteHost, pageHtml, kws) {
  let meta = (re) => (pageHtml.match(re) || [])[1] || "", title = meta(/<title[^>]*>([^<]{0,200})/i), desc = meta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})/i), text = pageHtml.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1500), out = await env.AI.run(env.CF_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", { max_tokens: 200, messages: [
    { role: "system", content: 'You name real competitor websites. Reply with only a JSON array of 8 bare domains like ["example.com"]. No big platforms (google, amazon, wikipedia, youtube, facebook, reddit) unless the site itself is one of those.' },
    { role: "user", content: `Website: ${siteHost}
Title: ${title}
Description: ${desc}
Keywords: ${kws.join(", ")}
Page text: ${text}

List 8 real websites that compete with ${siteHost} for the same customers and Google searches.` }
  ] }), resp = out && out.response, list = [];
  if (Array.isArray(resp)) list = resp;
  else if (resp && typeof resp == "object") list = Object.values(resp).flat();
  else {
    let txt = String(resp || "");
    try {
      list = JSON.parse(txt.match(/\[[\s\S]*?\]/)[0]);
    } catch {
      list = txt.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) || [];
    }
  }
  list = list.map((x) => x && typeof x == "object" ? x.domain || x.url || x.host || "" : x);
  let clean = [...new Set(list.map((h) => String(h).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) && h !== siteHost && !unsafeHost(h)))].slice(0, 8), ok = (await Promise.all(clean.map(async (h) => {
    let ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5e3);
    try {
      return (await fetch("https://" + h, { method: "HEAD", redirect: "follow", signal: ctl.signal, headers: { "user-agent": UA } })).status < 500 ? { host: h } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }))).filter(Boolean);
  return (ok.length ? ok : clean.map((h) => ({ host: h }))).slice(0, 5);
}
function badgeSvg(d) {
  let w = d.winner ? d[d.winner] : null, l = d.winner ? d[d.winner === "a" ? "b" : "a"] : null, top = w ? `${w.host} WON` : "DEAD EVEN", sub = w ? `vs ${l.host} \xB7 ${w.score}\u2013${l.score}` : `${d.a.host} vs ${d.b.host}`, e = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="72" viewBox="0 0 280 72" role="img" aria-label="${e(top + " " + sub)}">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#e0263a"/><stop offset="1" stop-color="#2457f5"/></linearGradient></defs>
<rect width="280" height="72" rx="14" fill="#0b0d13"/><rect x="1" y="1" width="278" height="70" rx="13" fill="none" stroke="url(#g)" stroke-width="2"/>
<text x="18" y="20" fill="#f2c14e" font-family="Arial Narrow,Arial,sans-serif" font-size="11" font-weight="700" letter-spacing="1.5">\u2605 SEO FIGHTS CHAMPION</text>
<text x="18" y="44" fill="#fff" font-family="Arial,sans-serif" font-size="17" font-weight="800">${e(top.toUpperCase().slice(0, 26))}</text>
<text x="18" y="61" fill="#9aa2b4" font-family="Arial,sans-serif" font-size="11">${e(sub.slice(0, 40))}</text></svg>`;
}
var FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 0 64 40"><defs><symbol id="g" viewBox="0 0 40 40"><path d="M9 15.5C9 9 13.6 5 20.2 5h3.6C31 5 36 9.6 36 16.4v3.4c0 4.8-3.2 8.3-7.7 9.1L27 29v3.2H11.6v-4.6C9.9 26.1 9 23.8 9 21.2z"/><rect x="10.6" y="31" width="17.4" height="6" rx="2"/></symbol></defs><g transform="rotate(-14 24 22)"><use href="#g" width="40" height="40" fill="#E1232E"/></g><g transform="rotate(14 48 22)"><use href="#g" x="-72" width="40" height="40" fill="#1D4ED8" transform="scale(-1,1)"/></g></svg>';
function head(o) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${o.noindex ? '<meta name="robots" content="noindex,follow">' : ""}<link rel="canonical" href="${SITE}${o.path || "/"}"><meta property="og:title" content="${esc2(o.title)}"><meta property="og:description" content="${esc2(o.desc)}"><meta property="og:url" content="${SITE}${o.path || "/"}"><meta property="og:type" content="website"><meta property="og:image" content="${SITE}/og.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(o.ld || { "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "SEO Fights", url: SITE }, { "@type": "SoftwareApplication", name: "SEO Fights", applicationCategory: "BusinessApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }] }).replace(/</g, "\\u003c")}</script>
<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>
`;
}
var html = (body, o) => new Response(body, { status: o.status || 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": o.cache || "public, max-age=300" } });
function page(env, o) {
  let d = o.data || demo_default, fill = {
    __TITLE__: esc2(o.title),
    __DESC__: esc2(o.desc),
    __H1__: o.h1,
    __LEDE__: o.lede,
    __A__: esc2(o.a ?? d.a.host),
    __B__: esc2(o.b ?? d.b.host),
    __MODE__: esc2(o.mode),
    __PRO__: esc2(env.STRIPE_PRO_LINK || "#pricing"),
    __LIFE__: esc2(lifeTier(env).link),
    __LIFEPRICE__: String(lifeTier(env).price),
    __LIFELEFT__: esc2(lifeTier(env).label),
    __LIFEN__: lifeTier(env).left === null ? "Final price" : `Only ${lifeTier(env).left} left`,
    __AGENCY__: esc2(env.STRIPE_AGENCY_LINK || "#pricing"),
    __VIEW__: o.view || "home",
    __CARDS__: JSON.stringify(o.cards || []).replace(/</g, "\\u003c"),
    __SUMMARY__: o.summary || "",
    __FOTN__: esc2(FOTN),
    __NIGHT__: JSON.stringify(o.night || null).replace(/</g, "\\u003c"),
    __DATA__: JSON.stringify(d.locked ? d : withReport(d, !!o.paid)).replace(/</g, "\\u003c"),
    __LIVE__: o.live ? "true" : "false"
  };
  return html(head(o) + template_default.replace(/__(TITLE|DESC|H1|LEDE|A|B|MODE|PRO|LIFEPRICE|LIFELEFT|LIFEN|LIFE|AGENCY|VIEW|CARDS|SUMMARY|DATA|LIVE|FOTN|NIGHT)__/g, (m) => fill[m]), o);
}
var HOME = {
  title: "SEO Fights \xB7 Whose SEO wins? Compare any two websites",
  desc: "Compare your website's SEO against a competitor in seconds. 31 live checks across Google and AI readiness, a clear winner, and the exact fixes to win.",
  h1: 'Whose <span class="r">SEO</span><br><span class="b">wins?</span>',
  lede: "31 live checks. 5 rounds. One winner. Google and AI search.",
  mode: "Example fight"
};
function fightPage(env, d, path, locked, isPaid) {
  let w = d.winner ? d[d.winner].host : null, hi = Math.max(d.a.score, d.b.score), lo = Math.min(d.a.score, d.b.score), loser = d.winner === "a" ? d.b : d.a, title = `${d.a.host} vs ${d.b.host}: who wins the SEO fight?`, rounds = [["onpage", "On-page"], ["content", "Content"], ["technical", "Technical"], ["ai", "AI-ready"], ["social", "Social"]], summary = locked ? `<section class="wrap seo-sum" aria-label="Fight summary"><h2>${esc2(d.a.host)} vs ${esc2(d.b.host)}: the result</h2>
<p>${w ? `<b>${esc2(w)}</b> wins the SEO fight with ${hi} points against ${lo}.` : `It's a tie at ${d.a.score} points each.`}
Round scores: ${rounds.map(([k, n]) => `${n} ${d.a.scores[k]}\u2013${d.b.scores[k]}`).join(", ")}. Sign up free to see all ${(d.rows || []).length || 31} checks and the fix list.
Checked ${new Date(d.at || Date.now()).toISOString().slice(0, 10)}.</p></section>` : `<section class="wrap seo-sum" aria-label="Fight summary"><h2>${esc2(d.a.host)} vs ${esc2(d.b.host)}: the result</h2>
<p>${w ? `<b>${esc2(w)}</b> wins the SEO fight with ${hi} points against ${lo}.` : `It's a tie at ${d.a.score} points each.`}
Round scores: ${rounds.map(([k, n]) => `${n} ${d.a.scores[k]}\u2013${d.b.scores[k]}`).join(", ")}.
${d.plan.length ? `To win, ${esc2(d.a.host)} should start with: ${d.plan.slice(0, 3).map((p) => esc2(p.label.toLowerCase())).join(", ")}.` : ""}
Checked ${new Date(d.at || Date.now()).toISOString().slice(0, 10)}.</p></section>`;
  return page(env, {
    path,
    data: locked ? teaser(d) : d,
    paid: !!isPaid && !locked,
    cache: "private, max-age=60",
    live: !0,
    mode: "Saved fight",
    title,
    summary,
    desc: `${d.a.host} vs ${d.b.host}: who wins the SEO fight? 31 live checks on Google and AI readiness. Pick your champion and see every round.`,
    h1: `<span class="r">${esc2(d.a.host)}</span><br>vs <span class="b">${esc2(d.b.host)}</span>`,
    noindex: !(d.category || (d.votes_a || 0) + (d.votes_b || 0) >= 5),
    view: "fight",
    lede: "31 checks. 5 rounds. One winner. Pick your champion below, then see who really wins.",
    ld: { "@context": "https://schema.org", "@type": "Article", headline: title, dateModified: new Date(d.at || Date.now()).toISOString(), publisher: { "@type": "Organization", name: "SEO Fights", url: SITE } }
  });
}
async function cardsList(env, limit) {
  return env.DB ? (await tables(env), (await env.DB.prepare(`SELECT slug, a, b, category, votes_a, votes_b FROM fights WHERE ${NOT_HIDDEN} ORDER BY (category IS NOT NULL) DESC, views + votes_a + votes_b DESC, updated_at DESC LIMIT ?1`).bind(limit).all()).results) : [];
}
async function boardPage(env) {
  return page(env, {
    path: "/fights",
    view: "home",
    mode: "",
    cards: await cardsList(env, 300),
    a: "",
    b: "",
    title: "Biggest SEO fights \xB7 SEO Fights",
    desc: "Brand vs brand SEO fights: Apple vs Samsung, Uber vs Lyft, Netflix vs Disney+ and more. Pick a winner, then see the result.",
    h1: 'Every<br><span class="r">SEO</span> <span class="b">fight</span>',
    lede: "Brand vs brand, scored on 31 live checks. Tap a fight, pick your champion, see who wins."
  });
}
var TOOL_PAGES = {
  "/tools": {
    show: "hub",
    title: "Free SEO tools \xB7 SEO Fights",
    h1: 'Free <span class="r">SEO</span> <span class="b">tools</span>',
    desc: "Free SEO tools: broken link checker, robots.txt generator, schema markup generator and llms.txt generator. Free account, 5-second sign-up.",
    lede: "Fix the technical stuff in minutes. Free account, no card.",
    crumbs: [],
    about: "<h2>About these tools</h2><p>Each tool does one job: find broken links, control which crawlers can read your site, add structured data for rich results, and tell AI assistants what your site is about. Run a free SEO fight to see which of these your site needs most.</p>"
  },
  "/tools/broken-link-checker": {
    show: "broken",
    title: "Free Broken Link Checker \xB7 SEO Fights",
    h1: "Broken link<br>checker",
    desc: "Free broken link checker. Scan any page for broken links, redirects and errors that hurt your SEO.",
    lede: "Scan any page for broken links, redirects and errors that could hurt your rankings.",
    crumbs: [["Tools", "/tools"]],
    about: "<h2>Why broken links matter</h2><p>Broken links waste Google's crawl time, leak link value and frustrate visitors. Redirect chains slow pages down. Fix broken links first, then point redirected links straight to their final address.</p>"
  },
  "/tools/robots-txt-generator": {
    show: "robots",
    title: "Free Robots.txt Generator \xB7 SEO Fights",
    h1: "Robots.txt<br>generator",
    desc: "Free robots.txt generator with AI crawler controls for GPTBot, ClaudeBot and PerplexityBot. Copy a correct file in seconds.",
    lede: "Build a correct robots.txt to control how search engines and AI crawlers read your site.",
    crumbs: [["Tools", "/tools"]],
    about: "<h2>What robots.txt does</h2><p>Robots.txt tells crawlers which parts of your site they may read. Blocking a path keeps it out of search. Blocking AI crawlers like GPTBot means ChatGPT can't learn about or recommend your site, so only block them on purpose.</p>"
  },
  "/tools/schema-markup-generator": {
    show: "schema",
    title: "Free Schema Markup Generator (JSON-LD) \xB7 SEO Fights",
    h1: "Schema markup<br>generator",
    desc: "Free JSON-LD schema markup generator for Organization, LocalBusiness, Product, FAQ, Article, Breadcrumb, Event and more.",
    lede: "Generate JSON-LD structured data to help Google show rich results for your pages.",
    crumbs: [["Tools", "/tools"]],
    about: "<h2>What schema markup does</h2><p>Schema markup describes your page in a format search engines and AI read directly: who you are, what you sell, your hours, your FAQs. It can earn rich results like stars, prices and FAQ dropdowns.</p>"
  },
  "/tools/llms-txt-generator": {
    show: "llms",
    title: "Free llms.txt Generator \xB7 SEO Fights",
    h1: "llms.txt<br>generator",
    desc: "Free llms.txt generator. Tell ChatGPT, Claude and Perplexity what your site is about so AI can recommend you.",
    lede: "Tell AI assistants what your site is about, in the file they look for.",
    crumbs: [["Tools", "/tools"]],
    about: "<h2>What llms.txt is</h2><p>llms.txt is a short Markdown file at your site's root that gives AI assistants a clean summary of who you are and your key pages, so they can quote and recommend you accurately.</p>"
  },
  "/agency": {
    show: "agency",
    title: "Prospect Hunter for SEO agencies \xB7 SEO Fights",
    h1: '<span class="r">Find clients</span><br>losing to <span class="b">rivals</span>',
    desc: "Prospect Hunter for SEO agencies: pick an industry and city, find businesses losing to competitors, and get a ready-to-send pitch for each.",
    lede: "Pick an industry and a city. We find the businesses losing to competitors and hand you the proof and the pitch.",
    crumbs: [],
    about: "<h2>Why agencies use Prospect Hunter</h2><p>Cold pitches fail because they're generic. A fight page that shows a business exactly how its competitor beats it, round by round, gets replies. Prospect Hunter finds those businesses for you and writes the first email.</p>"
  },
  "/keywords-battle": {
    show: "battle",
    title: "Keyword Battle: who ranks higher on Google? \xB7 SEO Fights",
    h1: '<span class="r">Keyword</span><br><span class="b">battle</span>',
    desc: "Pick 10 keywords and see who ranks higher on Google, you or your competitor. Any country. Weekly movement emails on Pro.",
    lede: "Pick 10 keywords. See who ranks higher on Google for each one, you or your rival.",
    crumbs: [],
    about: "<h2>How Keyword Battle works</h2><p>We search Google for each keyword in the country you pick and find where both sites appear in the top 30. Free shows 1 of 10 keywords. Pro shows all 10, any country, and emails you every Monday when positions move.</p>"
  }
};
function toolPage(env, path, url, over) {
  let t = { ...TOOL_PAGES[path], ...over || {} }, crumbs = [["Home", "/"], ...t.crumbs].map(([n, h]) => `<a href="${h}">${n}</a><span>/</span>`).join("") + `<span>${t.h1.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}</span>`, fill = {
    __TITLE__: esc2(t.title),
    __DESC__: esc2(t.desc),
    __H1__: t.h1,
    __LEDE__: esc2(t.lede),
    __CRUMBS__: crumbs,
    __SHOW__: `[data-tool="${t.show}"]{display:block}${t.css || ""}`,
    __ABOUT__: t.about,
    __KBA__: esc2(url.searchParams.get("a") || ""),
    __KBB__: esc2(url.searchParams.get("b") || "")
  }, ld = { "@context": "https://schema.org", "@type": "WebApplication", name: t.title.split(" \xB7 ")[0], url: SITE + path, applicationCategory: "BusinessApplication", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } };
  return html(head({ ...t, path, ld }) + tools_default.replace(/__(TITLE|DESC|H1|LEDE|CRUMBS|SHOW|ABOUT|KBA|KBB)__/g, (m) => fill[m]), { cache: t.cache });
}
function infoPage(env, o) {
  let fill = { __TITLE__: esc2(o.title), __DESC__: esc2(o.desc || o.title), __H1__: o.h1, __LEDE__: o.lede || "", __CRUMBS__: "", __SHOW__: "", __ABOUT__: o.body, __KBA__: "", __KBB__: "" };
  return html(head({ ...o, desc: o.desc || o.title }) + tools_default.replace(/__(TITLE|DESC|H1|LEDE|CRUMBS|SHOW|ABOUT|KBA|KBB)__/g, (k) => fill[k]), { status: o.status, cache: o.cache || "public, max-age=300" });
}
var WELCOME_HTML = `<div class="panel" id="wbox"><h3>One second\u2026</h3><p class="muted">Confirming your payment with Stripe.</p></div>
<script>(async()=>{const sid=new URLSearchParams(location.search).get("session_id");const box=document.getElementById("wbox");if(!sid){box.innerHTML='<h3>No payment found</h3><p class="muted">If you just paid, check your email for your access link.</p><p><a class="btn" href="/account">Your account</a></p>';return;}
for(let i=0;i<20;i++){try{const r=await fetch("/api/welcome?session_id="+encodeURIComponent(sid));const j=await r.json();if(j.ready){box.innerHTML='<h3>'+j.plan+' is on \u{1F94A}</h3><p class="muted">Signed in as '+j.email.replace(/[<>&]/g,"")+'.</p><p><a class="btn fight" href="/">Start fighting</a> <a class="btn ghost" href="/account">Your account</a></p>';return;}}catch(e){}await new Promise(r=>setTimeout(r,1500));}
box.innerHTML='<h3>Payment received</h3><p class="muted">It is taking a moment to set up. Check your email for your access link, or refresh this page.</p>';})();</script>`, RESTORE_HTML = `<form class="panel waitbox" id="restore" novalidate><h3>Get your access link</h3><p class="muted">Enter the email you paid with. If you have an active plan, we'll email you a link that signs you in on this browser.</p><div class="wrow"><input id="rEmail" type="email" autocomplete="email" placeholder="you@email.com" aria-label="Your email"><button class="btn" type="submit">Email me a link</button></div><p class="muted" id="rMsg"></p></form>
<p style="margin-top:16px"><a class="btn ghost" href="/pricing">See plans</a></p>
<script>document.getElementById("restore").addEventListener("submit",async e=>{e.preventDefault();const email=document.getElementById("rEmail").value.trim();const m=document.getElementById("rMsg");try{const r=await fetch("/api/restore",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});const j=await r.json();m.textContent=r.ok?(j.email===false?"Email sign-in links are being set up. Use the contact page and we'll switch your plan on by hand.":"If that email has a plan, your link is on its way."):(j.error||"Try again.");}catch{m.textContent="Try again.";}});</script>`;
async function sendEmail(env, to, subject, body, opts = {}) {
  if (!env.RESEND_KEY) return !1;
  let msg = { from: env.FROM_EMAIL || "SEO Fights <fights@seofights.com>", to, subject, html: body, text: opts.text || toText(body) };
  opts.replyTo && (msg.reply_to = opts.replyTo), opts.unsubscribe && (msg.headers = { "List-Unsubscribe": `<${opts.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  try {
    let r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(msg)
    });
    return r.ok && await logEv(env, "email", null, subject.slice(0, 60)), r.ok;
  } catch {
    return !1;
  }
}
var M = (o) => mail({ site: SITE, ...o }), senderLine = (env) => "SEO Fights \xB7 Vancouver, BC, Canada" + (env.BUSINESS_ADDRESS ? ` \xB7 ${mailEsc(env.BUSINESS_ADDRESS)}` : "");
async function unsubSig(env, email, kind) {
  let key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.UNSUB_SECRET || env.RESEND_KEY || env.STRIPE_WEBHOOK_SECRET || "seofights-unsub"), { name: "HMAC", hash: "SHA-256" }, !1, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${email}|${kind}`)))].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var unsubUrl = async (env, email, kind) => `${SITE}/unsubscribe?e=${encodeURIComponent(email)}&k=${kind}&s=${await unsubSig(env, email, kind)}`;
async function prefsOf(env, email) {
  try {
    await tables(env);
    let r = await env.DB.prepare("SELECT fights, keywords FROM email_prefs WHERE email = ?1").bind(email).first();
    return { fights: r ? !!r.fights : !0, keywords: r ? !!r.keywords : !0 };
  } catch {
    return { fights: !0, keywords: !0 };
  }
}
async function setPrefs(env, email, pr) {
  await tables(env), await env.DB.prepare("INSERT INTO email_prefs (email, fights, keywords, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(email) DO UPDATE SET fights = ?2, keywords = ?3, at = ?4").bind(email, pr.fights ? 1 : 0, pr.keywords ? 1 : 0, Date.now()).run();
}
var sha256 = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join(""), portalFor = (env, email) => env.STRIPE_PORTAL_LINK ? `${env.STRIPE_PORTAL_LINK}${env.STRIPE_PORTAL_LINK.includes("?") ? "&" : "?"}prefilled_email=${encodeURIComponent(email)}` : null, EMAIL = {
  signIn: (link) => M({
    title: "Sign in",
    preheader: "Your one-time sign-in link for SEO Fights.",
    body: mailP("Tap the button to sign in to SEO Fights. No password needed."),
    button: { text: "Sign in", href: link },
    footer: "This link works once and expires in 30 minutes. If you didn't ask for it, ignore this email."
  }),
  access: (link, planName) => M({
    title: "Your access link",
    preheader: `Use ${planName} on this device.`,
    body: mailP(`Tap the button to use your <b>${mailEsc(planName)}</b> plan on this device.`) + mailNote("Keep this email. The link signs you in on any device you open it on, so don't forward it."),
    button: { text: "Sign me in", href: link },
    footer: "You got this because someone asked for an access link for this email on SEO Fights."
  }),
  welcome: (env, plan, email, key) => {
    let portal = portalFor(env, email), manage = plan === "pro" || plan === "agency" ? portal ? `Manage your card, see invoices or cancel any time from ${mailLink("billing", portal)} or ${mailLink("your account", `${SITE}/account#billing`)}. If you cancel, you keep access until the end of the period you paid for.` : `Manage or cancel any time from ${mailLink("your account", `${SITE}/account#billing`)}.` : "Lifetime is a single payment. There is nothing to cancel.";
    return M({
      title: `Thanks, you're ${PLAN_NAMES[plan]}`,
      preheader: `Your ${PLAN_NAMES[plan]} plan is on.`,
      body: mailP(`Thanks for buying SEO Fights. Your <b>${PLAN_NAMES[plan]}</b> plan is on for <b>${mailEsc(email)}</b>.`) + mailTable([["Fights", `${LIMITS[plan].fights[0]} a month`], ["Keyword Battles", LIMITS[plan].battles[0] ? `${LIMITS[plan].battles[0]} a month` : "Not included"], ["AI strategies", LIMITS[plan].strategy[0] ? `${LIMITS[plan].strategy[0]} a month` : "Not included"], ...LIMITS[plan].hunts[0] ? [["Prospect hunts", `${LIMITS[plan].hunts[0]} a month`]] : []]) + mailP(manage) + mailP("<b>All payments are final.</b>") + mailNote(`On another device? ${mailLink(`Use ${PLAN_NAMES[plan]} there`, `${SITE}/activate?key=${key}`)}. Keep this email for that link.`),
      button: { text: "Start fighting", href: SITE },
      footer: `You got this because you bought ${PLAN_NAMES[plan]} on SEO Fights.`
    });
  },
  owner: (title, rows) => M({ title, body: mailTable(rows.map(([k, v]) => [`<b>${mailEsc(k)}</b>`, mailEsc(v)])), footer: "Owner alert. You get this because OWNER_EMAIL is set." }),
  deleted: () => M({
    title: "Your account is deleted",
    preheader: "Your SEO Fights account is gone.",
    body: mailP("Your SEO Fights account and its saved data are deleted. You're signed out everywhere this email was used.") + mailNote("Public fight pages stay up, because they're about websites, not about you. For tax and chargeback records we keep a one-way hash of your email, your plan and the date."),
    footer: "You got this because you deleted your SEO Fights account."
  }),
  fightReport: (w, d, unsub, sender) => {
    let passed = w.last_a >= w.last_b && d.b.score > d.a.score, arrow = (x, y) => `${x} \u2192 <b>${y}</b>`;
    return M({
      title: passed ? `${d.b.host} just passed you` : "This week's fight",
      preheader: `${d.a.host} ${d.a.score} vs ${d.b.host} ${d.b.score}`,
      body: mailScore(d.a.host, d.a.score, d.b.host, d.b.score) + mailTable([[mailEsc(d.a.host), arrow(w.last_a, d.a.score)], [mailEsc(d.b.host), arrow(w.last_b, d.b.score)]], ["Site", "Last week \u2192 now"]) + mailP(d.plan[0] ? `<b>Top fix for ${mailEsc(d.a.host)}:</b> ${mailEsc(d.plan[0].label)}. ${mailEsc(d.plan[0].fix || "")}` : "No fixes left. Your site is clean."),
      button: { text: "See the full fight", href: `${SITE}/fight/${encodeURIComponent(d.slug)}` },
      sender,
      footer: `You get this every Monday because you watch this fight on SEO Fights. ${mailLink("Stop this fight", `${SITE}/api/unwatch?id=${w.id}&t=${w.token}`)} \xB7 ${mailLink("Unsubscribe from Monday reports", unsub)}`
    });
  },
  keywordReport: (bt, moves, prev, unsub, sender) => {
    let f = (v) => v ? "#" + v : "100+";
    return M({
      title: `${moves.length} keyword${moves.length > 1 ? "s" : ""} moved`,
      preheader: `${bt.a} vs ${bt.b} this week`,
      body: mailP(`Google positions changed this week in <b style="color:#E1232E">${mailEsc(bt.a)}</b> vs <b style="color:#1D4ED8">${mailEsc(bt.b)}</b>.`) + mailTable(moves.map((r) => [mailEsc(r.keyword), `${f(prev[r.keyword].a)} \u2192 <b>${f(r.a)}</b>`, `${f(prev[r.keyword].b)} \u2192 <b>${f(r.b)}</b>`]), ["Keyword", "You", "Rival"]),
      button: { text: "Open Keyword Battle", href: `${SITE}/keywords-battle?a=${encodeURIComponent(bt.a)}&b=${encodeURIComponent(bt.b)}` },
      sender,
      footer: `You get this because you track this battle on SEO Fights. ${mailLink("Unsubscribe from keyword reports", unsub)} \xB7 ${mailLink("Email settings", `${SITE}/account#settings`)}`
    });
  }
};
function planFromSession(o) {
  let meta = o.metadata && o.metadata.plan || "";
  if (["pro", "agency", "lifetime"].includes(meta)) return meta;
  let amt = o.amount_total || 0;
  return o.mode !== "subscription" ? "lifetime" : amt >= 5e3 ? "agency" : "pro";
}
async function verifyStripe(req, secret) {
  let sig = req.headers.get("stripe-signature") || "", body = await req.text(), t = (sig.match(/t=(\d+)/) || [])[1], v1 = [...sig.matchAll(/v1=([a-f0-9]+)/g)].map((m) => m[1]);
  if (!t || !v1.length || Math.abs(Date.now() / 1e3 - Number(t)) > 600) return null;
  let key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, !1, ["sign"]), mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1.includes(mac) ? JSON.parse(body) : null;
}
var RIVALS = [
  ["apple.com", "samsung.com", "Tech"],
  ["google.com", "bing.com", "Tech"],
  ["microsoft.com", "apple.com", "Tech"],
  ["dell.com", "hp.com", "Tech"],
  ["lenovo.com", "asus.com", "Tech"],
  ["sony.com", "lg.com", "Tech"],
  ["dropbox.com", "box.com", "Tech"],
  ["zoom.us", "webex.com", "Tech"],
  ["slack.com", "discord.com", "Tech"],
  ["notion.com", "obsidian.md", "Tech"],
  ["canva.com", "figma.com", "Tech"],
  ["shopify.com", "wix.com", "Tech"],
  ["squarespace.com", "wix.com", "Tech"],
  ["wordpress.com", "webflow.com", "Tech"],
  ["godaddy.com", "namecheap.com", "Tech"],
  ["mailchimp.com", "convertkit.com", "Tech"],
  ["hubspot.com", "salesforce.com", "Tech"],
  ["asana.com", "trello.com", "Tech"],
  ["linear.app", "atlassian.com", "Tech"],
  ["github.com", "gitlab.com", "Tech"],
  ["vercel.com", "netlify.com", "Tech"],
  ["stripe.com", "paypal.com", "Finance"],
  ["openai.com", "anthropic.com", "AI"],
  ["perplexity.ai", "you.com", "AI"],
  ["midjourney.com", "leonardo.ai", "AI"],
  ["jasper.ai", "copy.ai", "AI"],
  ["huggingface.co", "replicate.com", "AI"],
  ["elevenlabs.io", "murf.ai", "AI"],
  ["runwayml.com", "pika.art", "AI"],
  ["character.ai", "replika.com", "AI"],
  ["cursor.com", "windsurf.com", "AI"],
  ["lovable.dev", "bolt.new", "AI"],
  ["netflix.com", "disneyplus.com", "Streaming"],
  ["hulu.com", "max.com", "Streaming"],
  ["primevideo.com", "netflix.com", "Streaming"],
  ["open.spotify.com", "soundcloud.com", "Streaming"],
  ["twitch.tv", "kick.com", "Streaming"],
  ["youtube.com", "vimeo.com", "Streaming"],
  ["audible.com", "scribd.com", "Streaming"],
  ["coca-cola.com", "pepsi.com", "Food & drink"],
  ["starbucks.com", "dunkindonuts.com", "Food & drink"],
  ["dominos.com", "pizzahut.com", "Food & drink"],
  ["kfc.com", "popeyes.com", "Food & drink"],
  ["subway.com", "jimmyjohns.com", "Food & drink"],
  ["chipotle.com", "qdoba.com", "Food & drink"],
  ["redbull.com", "monsterenergy.com", "Food & drink"],
  ["doordash.com", "ubereats.com", "Food & drink"],
  ["hellofresh.com", "blueapron.com", "Food & drink"],
  ["timhortons.ca", "starbucks.ca", "Food & drink"],
  ["wendys.com", "burgerking.com", "Food & drink"],
  ["nike.com", "adidas.com", "Fashion"],
  ["puma.com", "reebok.com", "Fashion"],
  ["zara.com", "hm.com", "Fashion"],
  ["uniqlo.com", "gap.com", "Fashion"],
  ["lululemon.com", "gymshark.com", "Fashion"],
  ["allbirds.com", "on.com", "Fashion"],
  ["converse.com", "vans.com", "Fashion"],
  ["rayban.com", "oakley.com", "Fashion"],
  ["shein.com", "temu.com", "Shopping"],
  ["amazon.com", "walmart.com", "Shopping"],
  ["target.com", "costco.com", "Shopping"],
  ["ebay.com", "etsy.com", "Shopping"],
  ["bestbuy.com", "newegg.com", "Shopping"],
  ["ikea.com", "wayfair.com", "Shopping"],
  ["sephora.com", "ulta.com", "Beauty"],
  ["glossier.com", "fentybeauty.com", "Beauty"],
  ["dollarshaveclub.com", "harrys.com", "Beauty"],
  ["uber.com", "lyft.com", "Travel"],
  ["airbnb.com", "vrbo.com", "Travel"],
  ["expedia.com", "kayak.com", "Travel"],
  ["delta.com", "united.com", "Travel"],
  ["aircanada.com", "westjet.com", "Travel"],
  ["marriott.com", "hilton.com", "Travel"],
  ["skyscanner.com", "google.com/travel", "Travel"],
  ["robinhood.com", "webull.com", "Finance"],
  ["coinbase.com", "kraken.com", "Finance"],
  ["wise.com", "revolut.com", "Finance"],
  ["chase.com", "bankofamerica.com", "Finance"],
  ["nerdwallet.com", "creditkarma.com", "Finance"],
  ["mint.intuit.com", "ynab.com", "Finance"],
  ["turbotax.intuit.com", "hrblock.com", "Finance"],
  ["wealthsimple.com", "questrade.com", "Finance"],
  ["duolingo.com", "babbel.com", "Learning"],
  ["coursera.org", "udemy.com", "Learning"],
  ["khanacademy.org", "brilliant.org", "Learning"],
  ["masterclass.com", "skillshare.com", "Learning"],
  ["grammarly.com", "quillbot.com", "Learning"],
  ["instagram.com", "tiktok.com", "Social"],
  ["x.com", "threads.net", "Social"],
  ["reddit.com", "quora.com", "Social"],
  ["linkedin.com", "indeed.com", "Social"],
  ["pinterest.com", "tumblr.com", "Social"],
  ["bumble.com", "tinder.com", "Social"],
  ["snapchat.com", "bereal.com", "Social"],
  ["tesla.com", "rivian.com", "Cars"],
  ["ford.com", "chevrolet.com", "Cars"],
  ["toyota.com", "honda.com", "Cars"],
  ["bmw.com", "mercedes-benz.com", "Cars"],
  ["carvana.com", "carmax.com", "Cars"],
  ["playstation.com", "xbox.com", "Gaming"],
  ["nintendo.com", "steampowered.com", "Gaming"],
  ["epicgames.com", "roblox.com", "Gaming"],
  ["chess.com", "lichess.org", "Gaming"],
  ["peloton.com", "tonal.com", "Fitness"],
  ["strava.com", "garmin.com", "Fitness"],
  ["fitbit.com", "whoop.com", "Fitness"],
  ["myfitnesspal.com", "noom.com", "Fitness"],
  ["ring.com", "simplisafe.com", "Home"],
  ["dyson.com", "sharkclean.com", "Home"],
  ["casper.com", "purple.com", "Home"],
  ["homedepot.com", "lowes.com", "Home"]
], CATEGORY_OF = new Map(RIVALS.map(([a, b, c]) => [slugOf(a, b), c]));
async function autoFights(env, n) {
  if (!env.DB) return;
  let done = new Set((await env.DB.prepare("SELECT slug FROM fights UNION SELECT slug FROM blocked").all()).results.map((r) => r.slug)), todo = RIVALS.filter(([a, b]) => !done.has(slugOf(a, b))).slice(0, n);
  for (let [a, b, cat] of todo)
    try {
      let d = await runFight(norm(a), norm(b), env);
      d.category = cat, await saveFight(env, d);
    } catch (e) {
      await env.DB.prepare("INSERT OR REPLACE INTO blocked (slug, reason, at) VALUES (?1, ?2, ?3)").bind(slugOf(a, b), e instanceof Blocked ? "blocked" : "error", Date.now()).run();
    }
}
async function weekly(env) {
  if (!env.DB) return;
  let watches = (await env.DB.prepare("SELECT w.* FROM watches w JOIN members m ON m.email = w.email AND m.active = 1 AND m.plan != 'free' WHERE w.active = 1 LIMIT 500").all()).results;
  for (let w of watches)
    try {
      let d = await runFight(norm(w.a), norm(w.b), env);
      if (await saveFight(env, d), d.a.score !== w.last_a || d.b.score !== w.last_b) {
        let passed = w.last_a >= w.last_b && d.b.score > d.a.score;
        if ((await prefsOf(env, w.email)).fights) {
          let unsub = await unsubUrl(env, w.email, "fights");
          await sendEmail(env, w.email, passed ? `\u{1F6A8} ${d.b.host} just passed you (${d.b.score} vs ${d.a.score})` : `This week: ${d.a.host} ${d.a.score} vs ${d.b.host} ${d.b.score}`, EMAIL.fightReport(w, d, unsub, senderLine(env)), { unsubscribe: unsub });
        }
      }
      await env.DB.prepare("UPDATE watches SET last_a=?1, last_b=?2, checked_at=?3 WHERE id=?4").bind(d.a.score, d.b.score, Date.now(), w.id).run();
    } catch {
    }
  let battles = (await env.DB.prepare("SELECT b.* FROM battles b JOIN members m ON m.key = b.member_key AND m.active = 1 AND m.plan NOT IN ('free', 'lifetime') LIMIT 300").all()).results;
  for (let bt of battles)
    try {
      let res = await battle(env, bt.a, bt.b, JSON.parse(bt.keywords), bt.gl), prev = Object.fromEntries(JSON.parse(bt.last || "[]").map((r) => [r.keyword, r])), moves = res.rows.filter((r) => prev[r.keyword] && (prev[r.keyword].a !== r.a || prev[r.keyword].b !== r.b));
      if (moves.length && (await prefsOf(env, bt.email)).keywords) {
        let unsub = await unsubUrl(env, bt.email, "keywords");
        await sendEmail(env, bt.email, `${moves.length} keyword${moves.length > 1 ? "s" : ""} moved: ${bt.a} vs ${bt.b}`, EMAIL.keywordReport(bt, moves, prev, unsub, senderLine(env)), { unsubscribe: unsub });
      }
      await env.DB.prepare("UPDATE battles SET last=?1, checked_at=?2 WHERE id=?3").bind(JSON.stringify(res.rows), Date.now(), bt.id).run();
    } catch {
    }
}
async function usedOf(env, m, what) {
  let [max, per] = LIMITS[planOf(m)][what.split(":")[0]], used = env.LIMITS && max ? parseInt(await env.LIMITS.get(`u:${what}:${period(per)}:${m.key}`) || "0", 10) : 0;
  return { left: Math.max(0, max - used), max, per };
}
async function huntList(env, m, n) {
  try {
    return await tables(env), (await env.DB.prepare("SELECT id, industry, city, result, at FROM hunts WHERE member_key = ?1 ORDER BY at DESC LIMIT ?2").bind(m.key, n).all()).results.map((h) => {
      let r = { leader: null, prospects: [] };
      try {
        r = JSON.parse(h.result);
      } catch {
      }
      return { id: h.id, industry: h.industry, city: h.city, at: h.at, leader: r.leader, prospects: r.prospects || [] };
    });
  } catch {
    return [];
  }
}
async function homeExtras(env, m) {
  let [fights, hunts, corner] = await Promise.all([usedOf(env, m, "fights"), usedOf(env, m, "hunts"), (async () => {
    try {
      return await tables(env), (await env.DB.prepare("SELECT mf.slug, mf.at, f.a, f.b, f.a_score, f.b_score, f.winner FROM member_fights mf JOIN fights f ON f.slug = mf.slug WHERE mf.member_key = ?1 ORDER BY mf.at DESC LIMIT 3").bind(m.key).all()).results;
    } catch {
      return [];
    }
  })()]);
  return { site: corner[0]?.a || null, ring: { fights, hunts }, corner: corner.map((f) => ({ slug: f.slug, at: f.at, a: f.a, b: f.b, a_score: f.a_score, b_score: f.b_score, winner: f.winner || null })) };
}
var USAGE = [
  ["fights", "fights", "Fights"],
  ["battles", "battles", "Keyword Battles"],
  ["strategy", "strategy", "AI strategies"],
  ["rivals", "rivals", "Rival finder"],
  ["links", "links", "Broken link checks"],
  ["gen:robots", "gen", "Robots.txt generator"],
  ["gen:schema", "gen", "Schema generator"],
  ["gen:llms", "gen", "llms.txt generator"],
  ["hunts", "hunts", "Prospect hunts"],
  ["showdowns", "showdowns", "Showdowns"]
], COUNTRY = { us: "United States", ca: "Canada", gb: "United Kingdom", au: "Australia", nz: "New Zealand", ie: "Ireland" };
async function dashboardData(env, m) {
  let plan = planOf(m), L = LIMITS[plan];
  await tables(env);
  let all = async (sql, ...args) => {
    try {
      return (await env.DB.prepare(sql).bind(...args).all()).results || [];
    } catch {
      return [];
    }
  }, usage = await Promise.all(USAGE.map(async ([what, key, label]) => {
    let [max, per] = L[key], used = env.LIMITS && max ? parseInt(await env.LIMITS.get(`u:${what}:${period(per)}:${m.key}`) || "0", 10) : 0;
    return { what, label, used: Math.min(used, max), max, per, reset: per === "week" ? "Resets Monday" : "Resets on the 1st" };
  })), [fights, battles, hunts, watches] = await Promise.all([
    all("SELECT mf.slug, mf.at, f.a, f.b, f.a_score, f.b_score, f.winner FROM member_fights mf LEFT JOIN fights f ON f.slug = mf.slug WHERE mf.member_key = ?1 ORDER BY mf.at DESC LIMIT 100", m.key),
    paid(m) ? all("SELECT id, a, b, gl, keywords, last, created_at, checked_at FROM battles WHERE member_key = ?1 ORDER BY COALESCE(checked_at, created_at) DESC LIMIT 50", m.key) : [],
    L.hunts[0] ? all("SELECT id, industry, city, result, at FROM hunts WHERE member_key = ?1 ORDER BY at DESC LIMIT 30", m.key) : [],
    all("SELECT id, a, b, last_a, last_b, token, created_at, checked_at FROM watches WHERE email = ?1 AND active = 1 ORDER BY created_at DESC LIMIT 100", m.email)
  ]), parse = (s, d) => {
    try {
      return JSON.parse(s);
    } catch {
      return d;
    }
  }, lp = lifeTier(env).price, upgrades = plan === "free" ? [["/go/pro", "Go Pro \xB7 $19/month", "fight"], ["/go/lifetime", `Lifetime \xB7 $${lp} once`, "ghost"], ["/go/agency", "Agency \xB7 $99/month", "ghost"]] : plan === "pro" ? [["/go/agency", "Go Agency \xB7 $99/month", "fight"]] : plan === "lifetime" ? [["/go/agency", "Agency \xB7 $99/month", "ghost"]] : [];
  return {
    email: m.email,
    plan,
    name: PLAN_NAMES[plan],
    since: m.created_at || null,
    paid: paid(m),
    usage,
    upgrades,
    fights: fights.filter((f) => f.a).map((f) => ({ slug: f.slug, at: f.at, a: f.a, b: f.b, a_score: f.a_score, b_score: f.b_score, winner: f.winner === "a" ? f.a : f.winner === "b" ? f.b : null })),
    battles: { allowed: paid(m) && !!L.battles[0], list: battles.map((b) => {
      let rows = parse(b.last, []), kws = parse(b.keywords, []);
      return { id: b.id, a: b.a, b: b.b, gl: b.gl, keywords: kws.length, winsA: rows.filter((r) => r.edge === "a").length, winsB: rows.filter((r) => r.edge === "b").length, checked: b.checked_at || b.created_at, link: `/keywords-battle?a=${encodeURIComponent(b.a)}&b=${encodeURIComponent(b.b)}` };
    }) },
    hunts: { allowed: !!L.hunts[0], list: hunts.map((h) => ({ id: h.id, industry: h.industry, city: h.city, at: h.at, ...parse(h.result, { leader: null, prospects: [] }) })) },
    watches: watches.map((w) => ({ id: w.id, a: w.a, b: w.b, last_a: w.last_a, last_b: w.last_b, token: w.token, checked: w.checked_at || null, slug: slugOf(w.a, w.b) })),
    billing: { kind: plan === "free" ? "free" : plan === "lifetime" || plan === "owner" ? plan : "sub", portal: plan === "pro" || plan === "agency" ? portalFor(env, m.email) : null, lifePrice: lp },
    prefs: await prefsOf(env, m.email)
  };
}
function huntsHtml(list, openFirst = !0) {
  let e = esc2, day = (t) => t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  return `<div class="dlist">${list.map((h, i) => `<details class="hunt"${i === 0 && openFirst ? " open" : ""}><summary><span><b>${e(h.industry)} in ${e(h.city)}</b><small>${day(h.at)} \xB7 ${(h.prospects || []).length} prospects${h.leader ? ` \xB7 leader ${e(h.leader.host)}` : ""}</small></span></summary><div class="prospects">${(h.prospects || []).map((x, k) => `<div class="prospect"><div class="pr-top"><b>${e(x.host)}</b><span class="pr-score"><i class="r">${x.score}</i> vs <i class="b">${x.rivalScore}</i></span></div>
<p class="muted">${x.gap > 0 ? `Google rank #${e(x.rank)}. Losing by ${e(x.gap)} points to ${e(x.rival)}.` : `Google rank #${e(x.rank)}. Beats ${e(x.rival)} on the page by ${e(-x.gap)}, but still ranks below it.`} Top gaps: ${(x.fixes || []).map(e).join(", ") || "polish"}.</p>
<pre class="out pitch" id="hp${h.id}-${k}">${e(x.pitch || "Pitch unavailable for this one. Open the fight and write your own.")}</pre>
<div class="pr-act"><button class="btn sm" type="button" data-dcopy="hp${h.id}-${k}">Copy pitch</button><a class="btn ghost sm" href="${e(x.fight)}" target="_blank" rel="noopener">Open the fight</a></div></div>`).join("")}</div></details>`).join("")}</div>` + COPY_PITCH;
}
var COPY_PITCH = '<script>document.querySelectorAll("[data-dcopy]").forEach(b=>{if(b.dataset.bound)return;b.dataset.bound=1;b.addEventListener("click",async()=>{const t=document.getElementById(b.dataset.dcopy).textContent;try{await navigator.clipboard.writeText(t);b.textContent="Copied";}catch(e){b.textContent="Select and copy";}setTimeout(()=>b.textContent="Copy pitch",1800);});});</script>', DASH_TABS = [["overview", "Overview"], ["fights", "My fights"], ["battles", "Keyword Battles"], ["hunts", "Prospect Hunts"], ["watching", "Watching"], ["billing", "Billing"], ["settings", "Settings"]], DASH_CSS = `<style>
.seo-sum:has(.dash) { max-width: none; color: var(--ink); padding-top: 8px }
.tools-hero:has(~ .seo-sum .dash) { padding-block: 40px 0 } .tools-hero:has(~ .seo-sum .dash) h1 { font-size: clamp(48px, 8vw, 88px) }
.dash { display: grid; gap: 18px } .dash h3 { margin-bottom: 6px } .dash .muted { margin: 0 }
.dtabs { display: flex; gap: 8px; margin-top: 6px !important; overflow-x: auto; padding: 2px 6px 8px 2px; margin: 0 -16px 0 0; scrollbar-width: none; -webkit-overflow-scrolling: touch } .dtabs::-webkit-scrollbar { display: none }
.dtab { flex: none; appearance: none; cursor: pointer; border: 2px solid var(--ink); background: var(--surface); color: var(--ink); font: 600 14px/1 var(--f-body); padding: 10px 15px; border-radius: 999px; text-decoration: none; display: inline-flex; gap: 7px; align-items: center }
.dtab[aria-selected="true"] { background: var(--ink); color: var(--bg); box-shadow: 3px 3px 0 var(--red) }
.dtab .n { font: 600 11px/1 var(--f-mono); padding: 3px 6px; border-radius: 99px; background: var(--bg); color: var(--muted) } .dtab[aria-selected="true"] .n { background: color-mix(in srgb, var(--bg) 18%, transparent); color: var(--bg) }
.dpane[hidden] { display: none !important } .dpane { display: grid; gap: 16px }
.dash .panel.punch { border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink) }
.dgrid { display: grid; grid-template-columns: 1fr 1.15fr; gap: 16px; align-items: start } @media (max-width: 820px) { .dgrid { grid-template-columns: 1fr } }
@media (min-width: 821px) { .plancard { position: sticky; top: 84px } }
.plancard { background: radial-gradient(120% 90% at 100% 0%, var(--arena-2), var(--arena) 70%); color: #fff; border-radius: 22px; padding: 22px; border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); display: grid; gap: 10px; align-content: start }
.plancard .eyebrow { color: var(--gold) } .plancard .pname { font: 900 clamp(48px, 9vw, 72px)/.9 var(--f-display); text-transform: uppercase } .plancard .pname.free { color: #fff } .plancard .pmeta { color: rgba(255,255,255,.72); font-size: 14px; overflow-wrap: anywhere }
.plancard .belt { justify-self: start; margin: 0; background: color-mix(in srgb, var(--gold) 22%, transparent); color: var(--gold) }
.plancard .acts { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px } .plancard .btn.ghost { color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35) } .plancard .fight { border-color: #fff; box-shadow: 4px 4px 0 #fff }
.dash .btn.fight { grid-column: auto; font-size: 20px; padding: 13px 20px }
.meters { display: grid; gap: 14px; margin-top: 12px }
.meter { display: grid; gap: 6px } .meter .top { display: flex; justify-content: space-between; gap: 10px; font-size: 15px } .meter .top b { font-weight: 600 } .meter .x { font: 600 13px/1.2 var(--f-mono); font-variant-numeric: tabular-nums; white-space: nowrap }
.meter .track { height: 12px; border-radius: 99px; border: 2px solid var(--ink); background: var(--bg); overflow: hidden } .meter .track i { display: block; height: 100%; background: var(--blue); border-radius: 99px } .meter.full .track i { background: var(--red) } .meter.hot .track i { background: var(--gold) }
.meter small { color: var(--muted); font: 500 12px/1 var(--f-mono) } .meter.off { opacity: .55 } .meter.off .track { border-style: dashed }
.dlist { display: grid; gap: 10px }
.frow { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px 12px; align-items: center; padding: 14px 18px; border-radius: 16px; background: var(--surface); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); text-decoration: none; color: inherit; transition: transform .1s }
a.frow:hover { transform: translate(-1px, -1px); box-shadow: 5px 5px 0 var(--ink) }
.frow .h { font-weight: 600; overflow-wrap: anywhere; min-width: 0 } .frow .h.b { text-align: right } .frow .h.w::after { content: " \u2605"; color: var(--gold) }
.frow .s { font: 900 30px/1 var(--f-display); font-variant-numeric: tabular-nums; display: flex; gap: 8px; align-items: center } .frow .s .ra { color: var(--red) } .frow .s .rb { color: var(--blue) } .frow .s i { font: 900 16px/1 var(--f-display); font-style: normal; color: var(--muted) }
.frow .meta { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font: 500 12px/1.3 var(--f-mono); color: var(--muted); border-top: 1px dashed var(--line); padding-top: 8px }
.frow .meta .go { color: var(--ink); font-weight: 600 }
.empty { text-align: center; display: grid; gap: 10px; justify-items: center; padding: 30px 20px } .empty p { max-width: 46ch }
.upsell-box { background: linear-gradient(120deg, var(--red-soft), var(--blue-soft)); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink) }
details.hunt { padding: 0; border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink) } details.hunt > summary { padding: 16px 18px; align-items: center } details.hunt > summary span { display: grid; gap: 4px } details.hunt > summary small { color: var(--muted); font: 500 12px/1.2 var(--f-mono); font-weight: 500 }
details.hunt .prospects { padding: 0 14px 14px; margin-top: 0 }
.dash .prospect { border-width: 1.5px }
.wrowd { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); flex-wrap: wrap }
.wrowd .who { display: grid; gap: 4px; min-width: 0 } .wrowd .who b { overflow-wrap: anywhere } .wrowd .who small { color: var(--muted); font: 500 12px/1.3 var(--f-mono) } .wrowd .acts { display: flex; gap: 8px }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 10px 0 0; font-size: 15px } .kv dt { color: var(--muted); font: 600 12px/1.6 var(--f-mono); text-transform: uppercase; letter-spacing: .08em } .kv dd { margin: 0; overflow-wrap: anywhere }
.dfoot { display: flex; gap: 10px; flex-wrap: wrap }
.dash .btn.cancel { background: var(--surface); color: var(--red); border: 2px solid var(--red) !important; box-shadow: 3px 3px 0 var(--red) }
.dash .btn.cancel[disabled] { opacity: .45; cursor: not-allowed; box-shadow: none }
.panel.danger { border: 2px solid var(--red); box-shadow: 4px 4px 0 var(--red); display: grid; gap: 8px } .panel.danger .eyebrow { color: var(--red) } .panel.danger p { margin: 0 }
.delform { display: grid; gap: 8px; margin-top: 6px } .delform .lbl { font: 600 12px/1 var(--f-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted) }
.delrow { display: flex; gap: 10px; flex-wrap: wrap } .delrow input { flex: 1 1 180px; min-width: 0; border: 2px solid var(--ink); border-radius: 12px; padding: 11px 14px; background: var(--bg); color: var(--ink); font: 600 16px/1 var(--f-mono); letter-spacing: .08em }
.togs { display: grid; gap: 10px; margin-top: 12px }
.tog { display: flex; gap: 14px; align-items: center; padding: 12px 14px; border-radius: 14px; background: var(--bg); cursor: pointer }
.tog input { position: absolute; opacity: 0; pointer-events: none } .tog span:last-child { display: grid; gap: 2px } .tog small { color: var(--muted); font-size: 13px }
.tog .sw { flex: none; width: 46px; height: 28px; border-radius: 99px; border: 2px solid var(--ink); background: var(--surface); position: relative; transition: background .15s }
.tog .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--ink); transition: transform .15s }
.tog input:checked + .sw { background: var(--red) } .tog input:checked + .sw::after { transform: translateX(18px); background: #fff } .tog input:focus-visible + .sw { outline: 2px solid var(--blue); outline-offset: 2px }
@media (max-width: 560px) { .frow { padding: 12px 14px } .frow .s { font-size: 26px } .frow .h { font-size: 14px } }
</style>`;
function dashboardHtml(D) {
  let e = esc2, day = (t) => t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "", btn = ([h, t, k]) => `<a class="btn ${k === "fight" ? "fight" : k}" href="${h}">${e(t)}</a>`, count = { fights: D.fights.length, battles: D.battles.list.length, hunts: D.hunts.list.length, watching: D.watches.length }, tabs = `<div class="dtabs" role="tablist" aria-label="Account">${DASH_TABS.map(([k, n], i) => `<a class="dtab" role="tab" id="t-${k}" href="#${k}" data-tab="${k}" aria-controls="p-${k}" aria-selected="${i === 0}">${n}${count[k] ? `<span class="n">${count[k]}</span>` : ""}</a>`).join("")}</div>`, empty = (title, text, cta2) => `<div class="panel punch empty"><h3>${title}</h3><p class="muted">${text}</p>${cta2 || ""}</div>`, meters = D.usage.map((u) => {
    if (!u.max) return `<div class="meter off"><div class="top"><b>${u.label}</b><span class="x">Not in ${e(D.name)}</span></div><div class="track"><i style="width:0"></i></div></div>`;
    let pct = Math.min(100, Math.round(u.used / u.max * 100));
    return u.max >= 1e5 ? `<div class="meter"><div class="top"><b>${u.label}</b><span class="x">${u.used} used \xB7 Unlimited</span></div></div>` : `<div class="meter${pct >= 100 ? " full" : pct >= 80 ? " hot" : ""}"><div class="top"><b>${u.label}</b><span class="x">${u.used} of ${u.max}</span></div><div class="track" role="progressbar" aria-label="${u.label}" aria-valuemin="0" aria-valuemax="${u.max}" aria-valuenow="${u.used}"><i style="width:${pct}%"></i></div><small>${u.per === "week" ? "This week" : "This month"} \xB7 ${u.reset}</small></div>`;
  }).join(""), blurb = { free: "1 fight and 1 try of each tool every week.", pro: "40 fights a month, every tool, AI strategy and Keyword Battles.", agency: "200 fights a month, Prospect Hunter and every tool.", lifetime: "40 fights a month and every free tool, paid once.", owner: "Owner access. Everything is on." }[D.plan], overview = `<div class="dgrid"><div class="plancard"><span class="eyebrow">Your plan</span><div class="pname">${e(D.name)}</div><p class="pmeta">${blurb}</p>
<dl class="kv" style="color:#fff"><dt style="color:rgba(255,255,255,.55)">Email</dt><dd>${e(D.email)}</dd>${D.since ? `<dt style="color:rgba(255,255,255,.55)">Since</dt><dd>${day(D.since)}</dd>` : ""}</dl>
<div class="acts">${D.upgrades.length ? D.upgrades.map(btn).join("") : ""}${D.plan === "owner" ? '<a class="btn fight" href="/admin">\u{1F4CA} Your stats</a>' : ""}<a class="btn ghost" href="/#test">Back to the ring</a><a class="btn ghost" href="/logout">Sign out</a></div></div>
<div class="panel punch"><h3>Your usage</h3><p class="muted">What you've used so far this period.</p><div class="meters">${meters}</div></div></div>`, fights = D.fights.length ? `<div class="dlist">${D.fights.map((f) => `<a class="frow" href="/fight/${encodeURIComponent(f.slug)}"><span class="h${f.winner === f.a ? " w" : ""}">${e(f.a)}</span><span class="s"><span class="ra">${f.a_score ?? "\u2013"}</span><i>vs</i><span class="rb">${f.b_score ?? "\u2013"}</span></span><span class="h b${f.winner === f.b ? " w" : ""}">${e(f.b)}</span><span class="meta"><span>${day(f.at)} \xB7 ${f.winner ? `${e(f.winner)} won` : "Tie"}</span><span class="go">Open fight \u2192</span></span></a>`).join("")}</div>` : empty("No fights yet", "Put your site in the ring with a rival. Every fight you run shows up here.", '<a class="btn fight" href="/">Start a fight</a>'), battles = D.battles.allowed ? D.battles.list.length ? `<div class="dlist">${D.battles.list.map((b) => `<a class="frow" href="${e(b.link)}"><span class="h${b.winsA > b.winsB ? " w" : ""}">${e(b.a)}</span><span class="s"><span class="ra">${b.winsA}</span><i>vs</i><span class="rb">${b.winsB}</span></span><span class="h b${b.winsB > b.winsA ? " w" : ""}">${e(b.b)}</span><span class="meta"><span>${b.keywords} keywords \xB7 ${e(COUNTRY[b.gl] || String(b.gl || "us").toUpperCase())} \xB7 checked ${day(b.checked)}</span><span class="go">Open battle \u2192</span></span></a>`).join("")}</div><p class="muted" style="font-size:14px">Scores are keywords won. Saved battles re-run every Monday and email you when positions move.</p>` : empty("No Keyword Battles yet", "Pick 10 keywords and a rival. We check who ranks higher on Google, then re-check every Monday.", '<a class="btn fight" href="/keywords-battle">Start a Keyword Battle</a>') : '<div class="panel upsell-box"><h3>Keyword Battle is part of Pro</h3><p>See who ranks higher on Google for 10 keywords, in any country, with a Monday email when positions move.</p><p style="margin-top:12px"><a class="btn fight" href="/go/pro">Go Pro \xB7 $19/month</a> <a class="btn ghost" href="/keywords-battle">Try it free</a></p></div>', hunts = D.hunts.allowed ? D.hunts.list.length ? huntsHtml(D.hunts.list) : empty("No hunts yet", "Pick an industry and a city. Every hunt you run is saved here with its prospects and pitches.", '<a class="btn fight" href="/agency">Hunt prospects</a>') : '<div class="panel upsell-box"><h3>Prospect Hunter is part of Agency</h3><p>Pick an industry and a city. We find local businesses losing to their top competitor, fight each one, and write the pitch. 30 hunts a month.</p><p style="margin-top:12px"><a class="btn fight" href="/go/agency">Go Agency \xB7 $99/month</a> <a class="btn ghost" href="/agency">How it works</a></p></div>', watching = D.watches.length ? `${D.paid ? "" : '<div class="panel upsell-box"><p><b>Monday reports are paused.</b> They need a paid plan. <a href="/go/pro">Go Pro</a> to switch them back on.</p></div>'}<div class="dlist" id="wlist">${D.watches.map((w) => `<div class="wrowd" data-w="${w.id}"><div class="who"><b><span style="color:var(--red)">${e(w.a)}</span> vs <span style="color:var(--blue)">${e(w.b)}</span></b><small>Last scores ${w.last_a} vs ${w.last_b}${w.checked ? ` \xB7 checked ${day(w.checked)}` : ""}</small></div><div class="acts"><a class="btn ghost sm" href="/fight/${encodeURIComponent(w.slug)}">Open</a><button class="btn sm" type="button" data-stop="${w.id}" data-t="${e(w.token)}">Stop</button></div></div>`).join("")}</div><p class="muted" style="font-size:14px">We re-run each fight every Monday and email ${e(D.email)} when a score moves.</p>` : empty("Not watching anything", D.paid ? "Open any fight and tap \u201CWatch\u201D to get a Monday email when the scores move." : "Monday email reports are part of Pro. Watch a fight and we email you when the scores move.", D.paid ? '<a class="btn fight" href="/">Start a fight</a>' : '<a class="btn fight" href="/go/pro">Go Pro \xB7 $19/month</a>'), B2 = D.billing, billing = `<div class="panel punch"><h3>${B2.kind === "free" ? "Upgrade" : "Billing"}</h3>${B2.kind === "free" ? `<p class="muted">Free: 1 fight and 1 try of each tool a week. Pro: 40 fights a month, every tool, AI strategy and Keyword Battles.</p><p style="margin-top:14px"><a class="btn fight" href="/go/pro">Go Pro \xB7 $19/month</a> <a class="btn ghost" href="/go/lifetime">Lifetime \xB7 $${B2.lifePrice} once</a> <a class="btn ghost" href="/go/agency">Agency \xB7 $99/month</a></p>` : B2.kind === "lifetime" || B2.kind === "owner" ? `<p class="muted">${B2.kind === "owner" ? "Owner access." : "Lifetime: paid once, nothing to cancel."}</p>` : B2.portal ? `<p class="muted">Change your card or see invoices in the Stripe billing portal.</p><p style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn ghost" href="${e(B2.portal)}" target="_blank" rel="noopener">Manage billing</a><a class="btn cancel" href="${e(B2.portal)}" target="_blank" rel="noopener">Cancel plan</a></p><p class="muted" style="margin-top:10px;font-size:14px">Your plan stays active until the end of the period you paid for. All payments are final.</p>` : '<p class="muted">Billing management is being set up.</p>'}
<dl class="kv"><dt>Plan</dt><dd>${e(D.name)}</dd><dt>Email</dt><dd>${e(D.email)}</dd></dl></div>
<div class="dfoot"><a class="btn ghost" href="/terms">Terms</a><a class="btn ghost" href="/contact">Help</a><a class="btn ghost" href="/signout">Sign out</a></div>`, P = D.prefs || { fights: !0, keywords: !0 }, tog = (k, label, sub) => `<label class="tog"><input type="checkbox" data-pref="${k}"${P[k] ? " checked" : ""}><span class="sw" aria-hidden="true"></span><span><b>${label}</b><small>${sub}</small></span></label>`, danger = D.plan === "owner" ? `<p class="muted">Owner accounts can't be deleted here.</p>` : B2.kind === "sub" ? `<p><b>Cancel your plan first so you're not charged again.</b> Once your plan has ended you can delete your account here.</p><p style="margin-top:12px">${B2.portal ? `<a class="btn cancel" href="${e(B2.portal)}" target="_blank" rel="noopener">Cancel plan</a>` : '<a class="btn ghost" href="/contact">Contact us to cancel</a>'}</p>` : `<p>${D.plan === "lifetime" ? "<b>You'll lose lifetime access. This can't be undone and payments are final.</b> " : ""}This deletes your account, your saved fights list, Keyword Battles, hunts, Monday reports and usage. Public fight pages stay up. This can't be undone.</p>
<form class="delform" id="delForm" novalidate><label for="delTxt" class="lbl">Type DELETE to confirm</label><div class="delrow"><input id="delTxt" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE"><button class="btn cancel" id="delBtn" type="submit" disabled>Delete my account</button></div><p class="muted" id="delMsg" role="status"></p></form>`, settings = `<div class="panel punch"><h3>Emails</h3><p class="muted">Monday reports. Sign-in links, receipts and welcome emails are always sent.</p><div class="togs">${tog("fights", "Monday fight reports", "When a watched fight's score moves")}${tog("keywords", "Monday keyword reports", "When a Keyword Battle position moves")}</div><p class="muted" id="prefMsg" role="status" style="font-size:14px;min-height:1.4em"></p></div>
<div class="panel punch"><h3>Your data</h3><p class="muted">Your account, fights, Keyword Battles, hunts and Monday reports as a JSON file.</p><p style="margin-top:12px"><a class="btn ghost" href="/api/account/export" download>Download my data</a></p></div>
<div class="panel danger"><span class="eyebrow">Danger zone</span><h3>Delete account</h3>${danger}</div>
<div class="dfoot"><a class="btn ghost" href="/logout">Sign out</a></div>`, panes = { overview, fights, battles, hunts, watching, billing, settings };
  return `${DASH_CSS}<div class="dash">${tabs}${DASH_TABS.map(([k], i) => `<div class="dpane" role="tabpanel" id="p-${k}" aria-labelledby="t-${k}"${i ? " hidden" : ""}>${panes[k]}</div>`).join("")}</div>
<script>(()=>{const tabs=[...document.querySelectorAll(".dtab")],ok=tabs.map(t=>t.dataset.tab);
function show(k,push){if(!ok.includes(k))k="overview";tabs.forEach(t=>{const on=t.dataset.tab===k;t.setAttribute("aria-selected",on);if(on){const bar=t.parentNode;bar.scrollLeft=Math.max(0,t.offsetLeft-bar.offsetLeft-24);}});document.querySelectorAll(".dpane").forEach(p=>p.hidden=p.id!=="p-"+k);if(push)history.replaceState(null,"",location.pathname+"#"+k);}
tabs.forEach(t=>t.addEventListener("click",e=>{e.preventDefault();show(t.dataset.tab,true);}));
show(location.hash.slice(1)||new URLSearchParams(location.search).get("tab")||"overview");addEventListener("hashchange",()=>show(location.hash.slice(1)));
document.querySelectorAll("[data-pref]").forEach(c=>c.addEventListener("change",async()=>{const m=document.getElementById("prefMsg");const body={};body[c.dataset.pref]=c.checked;try{const r=await fetch("/api/account/emails",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});if(!r.ok)throw 0;m.textContent="Saved.";}catch(e){c.checked=!c.checked;m.textContent="Couldn't save. Try again.";}}));
const df=document.getElementById("delForm");if(df){const t=document.getElementById("delTxt"),b=document.getElementById("delBtn"),msg=document.getElementById("delMsg");t.addEventListener("input",()=>{b.disabled=t.value.trim()!=="DELETE";});df.addEventListener("submit",async e=>{e.preventDefault();if(t.value.trim()!=="DELETE")return;b.disabled=true;b.textContent="Deleting\u2026";try{const r=await fetch("/api/account/delete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:"DELETE"})});const j=await r.json();if(!r.ok){msg.textContent=j.error||"Try again.";b.disabled=false;b.textContent="Delete my account";return;}location.href="/?deleted=1";}catch(x){msg.textContent="Try again.";b.disabled=false;b.textContent="Delete my account";}});}
document.querySelectorAll("[data-stop]").forEach(b=>b.addEventListener("click",async()=>{b.disabled=true;b.textContent="Stopping\u2026";try{const r=await fetch("/api/unwatch?id="+encodeURIComponent(b.dataset.stop)+"&t="+encodeURIComponent(b.dataset.t));if(!r.ok)throw 0;const row=b.closest(".wrowd");row.innerHTML='<div class="who"><b>Stopped</b><small>No more Monday emails for this fight.</small></div>';}catch(e){b.disabled=false;b.textContent="Try again";}}));})();</script>`;
}
var DASH_SIGNIN = `<div class="panel punch empty" style="border:2px solid var(--ink);box-shadow:4px 4px 0 var(--ink)"><span class="eyebrow">Members</span><h3>Sign in to your account</h3><p class="muted">Your plan, usage, fights and billing. Free account, no password.</p>
<p style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:6px"><button class="btn fight" type="button" id="dSign" style="grid-column:auto;font-size:20px;padding:13px 22px">Sign in or sign up</button></p></div>
<style>.seo-sum:has(#dSign){max-width:640px;margin-inline:auto;color:var(--ink)}.empty{text-align:center;display:grid;gap:10px;justify-items:center;padding:30px 20px}</style>
<script>document.getElementById("dSign").addEventListener("click",()=>withAccount(()=>location.reload(),"Sign in to SEO Fights","Enter your email. Free accounts get 1 fight a week and 1 try of each tool.","/account"));</script>`;
async function autoBlog(env, { force = !1, slug = null } = {}) {
  if (!env.DB) return { error: "No database." };
  if (!env.AI) return { error: "Workers AI isn't connected." };
  await tables(env);
  let today = /* @__PURE__ */ new Date();
  if (today.setUTCHours(0, 0, 0, 0), !force && (await env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE at >= ?1").bind(+today).first()).n) return { skipped: "Already posted today." };
  let pick = slug;
  if (pick) {
    if (await env.DB.prepare("SELECT slug FROM posts WHERE fight = ?1").bind(pick).first()) return { skipped: "That fight already has a post." };
  } else {
    let free = (await env.DB.prepare("SELECT f.slug FROM fights f LEFT JOIN posts p ON p.fight = f.slug WHERE f.category IS NOT NULL AND p.slug IS NULL AND f.data IS NOT NULL AND f.slug NOT IN (SELECT slug FROM hidden_fights) ORDER BY f.views DESC LIMIT 200").all()).results.map((r) => r.slug);
    if (!free.length) return { skipped: "Every categorized fight already has a post." };
    let heads = HEADLINERS.filter((h) => free.includes(h)), pool = (heads.length ? heads : free).slice(0, 3);
    pick = pool[Math.floor(Math.random() * pool.length)];
  }
  let f = await storedFight(env, pick);
  if (!f || !f.d.a?.checks) return { error: "Fight not found." };
  let d = f.d, at = Date.now(), md = "";
  try {
    md = String((await env.AI.run(env.CF_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: prompt(d), max_tokens: 1400, temperature: 0.2 }))?.response || "");
  } catch {
    return { error: "The AI didn't answer." };
  }
  let words = md.split(/\s+/).filter(Boolean).length, bad = inventedNumbers(md, d);
  if (words < 300) return { error: `Too short (${words} words), skipped.` };
  if (bad.length > 3) return { error: `Numbers not in the data (${bad.slice(0, 6).join(", ")}), skipped.` };
  let wrong = wrongRoundScores(md, d);
  if (wrong.length) return { error: `Wrong round scores (${wrong.slice(0, 6).join(", ")}), skipped.` };
  let ps = postSlug(d.a.host, d.b.host);
  (POSTS.some((x) => x.slug === ps) || await env.DB.prepare("SELECT slug FROM posts WHERE slug = ?1").bind(ps).first()) && (ps += "-" + new Date(at).toISOString().slice(0, 7));
  let body = factsHtml(d, SITE) + `
` + mdToHtml(md);
  return await env.DB.prepare("INSERT OR IGNORE INTO posts (slug, title, desc, body, fight, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(ps, postTitle(d, at), postDesc(d), body, d.slug, at).run(), { ok: !0, slug: ps, fight: d.slug, words };
}
var POST_CSS = "<style>.tools-hero h1{font-size:clamp(38px,6.4vw,76px);max-width:22ch}.post-score{min-width:0;margin:0 0 6px}.post-score th:not(:first-child),.post-score td:not(:first-child){text-align:center}.post-score .won-a{color:var(--red);font-weight:700}.post-score .won-b{color:var(--blue);font-weight:700}.post-score tr.total td{border-bottom:0}.post-facts{margin:8px 0 6px!important}</style>";
async function blogIndex(env, page2) {
  await tables(env);
  let per = 30, off = (page2 - 1) * per, rows = [];
  try {
    rows = (await env.DB.prepare("SELECT slug, title, desc, at FROM posts WHERE fight IS NULL OR fight NOT IN (SELECT slug FROM hidden_fights) ORDER BY at DESC LIMIT ?1 OFFSET ?2").bind(per + 1, off).all()).results;
  } catch {
  }
  let more = rows.length > per;
  rows = rows.slice(0, per);
  let monthOf = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), auto = rows.map((p) => `<a class="panel post" href="/blog/${encodeURIComponent(p.slug)}"><span class="muted">Fight report \xB7 ${monthOf(p.at)}</span><h3>${esc2(p.title)}</h3><p class="muted">${esc2(p.desc)}</p></a>`).join(""), nav = `<p style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">${page2 > 1 ? `<a class="btn ghost" href="${page2 === 2 ? "/blog" : `/blog?page=${page2 - 1}`}">\u2190 Newer posts</a>` : ""}${more ? `<a class="btn ghost" href="/blog?page=${page2 + 1}">More posts \u2192</a>` : ""}<a class="btn fight" href="/" style="grid-column:auto;font-size:20px;padding:13px 22px">Fight your own site</a></p>`;
  if (page2 === 1) {
    let staticCards = BLOG_INDEX.body.match(/<div class="cards-list">([\s\S]*?)<\/div>/)[1];
    return { ...BLOG_INDEX, body: `<div class="cards-list">${staticCards}${auto}</div>${nav}` };
  }
  return rows.length ? { ...BLOG_INDEX, title: `Blog, page ${page2} \xB7 SEO Fights`, lede: "Fight reports built on real SEO fights.", body: `<div class="cards-list">${auto}</div>${nav}`, noindex: !1 } : null;
}
async function autoPost(env, slug) {
  try {
    return await tables(env), await env.DB.prepare("SELECT * FROM posts WHERE slug = ?1").bind(slug).first();
  } catch {
    return null;
  }
}
var worker_default = {
  async fetch(req, env, ctx) {
    env = withStore(env);
    let u = new URL(req.url);
    SITE = env.SITE_URL || u.origin;
    let p = u.pathname.replace(/\/+$/, "") || "/";
    if (u.hostname.endsWith(".workers.dev") && !p.startsWith("/api/") && (env.CANONICAL_HOST || "seofights.com") !== u.hostname)
      return Response.redirect(`https://${env.CANONICAL_HOST || "seofights.com"}${u.pathname}${u.search}`, 301);
    if (await refreshHidden(env), p.startsWith("/api/") || await Promise.all([refreshLife(env), refreshFotn(env)]), p === "/api/duel") {
      let a, b;
      try {
        a = norm(u.searchParams.get("a")), b = norm(u.searchParams.get("b"));
      } catch {
        return json({ error: "Enter two valid websites, like shop.com and rival.com." }, 400);
      }
      if (hostOf(a) === hostOf(b)) return json({ error: "Pick two different websites." }, 400);
      let m = await member(req, env), slug = slugOf(hostOf(a), hostOf(b));
      if (!m) {
        if (HIDDEN.has(slug)) return json({ error: "This fight was removed at the site owner's request." }, 410);
        let old2 = await storedFight(env, slug);
        if (old2 && old2.age < 36e5) return json(teaser(old2.d));
        let now = /* @__PURE__ */ new Date(), wk = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (now.getUTCDay() + 6) % 7)), day = wk.toISOString().slice(0, 10), k = `anon:${day}:${ipOf(req)}`;
        if (cookie(req, "rf_af") === day || env.LIMITS && await env.LIMITS.get(k))
          return ctx.waitUntil(logEv(env, "wall", null, "fight")), json({ error: "Sign up free to keep fighting.", signup: !0, anon: !0 }, 401);
        try {
          let d = await runFight(a, b, env, !0);
          return ctx.waitUntil(Promise.all([saveFight(env, d), env.LIMITS ? env.LIMITS.put(k, "1", { expirationTtl: 8 * 86400 }) : null, logEv(env, "fight_anon", null, slug)])), json(teaser(d), 200, { "set-cookie": `rf_af=${day}; Path=/; Max-Age=${8 * 86400}; Secure; SameSite=Lax` });
        } catch (e) {
          return e instanceof Blocked && env.DB && ctx.waitUntil(env.DB.prepare("INSERT OR REPLACE INTO blocked (slug, reason, at) VALUES (?1, 'blocked', ?2)").bind(slug, Date.now()).run()), json({ error: e instanceof Blocked ? e.message : "Couldn't reach one of the sites. Check the address and try again." }, e instanceof Blocked ? 422 : 502);
        }
      }
      let old = await storedFight(env, slug);
      if (old && old.age < 36e5 && !u.searchParams.get("fresh"))
        return ctx.waitUntil(Promise.all([env.DB.prepare("UPDATE fights SET views=views+1 WHERE slug=?1").bind(slug).run(), logFight(env, m.key, slug)])), json(withReport(old.d, paid(m)));
      let who = m.key, plan = planOf(m);
      if (!await canUse(env, who, "fights", plan))
        return ctx.waitUntil(logEv(env, "wall", plan, "fight limit")), json({ error: paid(m) ? `You've used your ${LIMITS[plan].fights[0]} fights this month. They reset on the 1st.` : "You've used your free fight this week. Go Pro for 40 fights a month." }, 429);
      try {
        let d = await runFight(a, b, env);
        return ctx.waitUntil(Promise.all([saveFight(env, d), spend(env, who, "fights", plan), logFight(env, who, d.slug), logEv(env, "fight", plan, d.slug)])), json(withReport(d, paid(m)));
      } catch (e) {
        return e instanceof Blocked && env.DB && ctx.waitUntil(env.DB.prepare("INSERT OR REPLACE INTO blocked (slug, reason, at) VALUES (?1, 'blocked', ?2)").bind(slug, Date.now()).run()), json({ error: e instanceof Blocked ? e.message : "Couldn't reach one of the sites. Check the address and try again." }, e instanceof Blocked ? 422 : 502);
      }
    }
    if (p === "/api/fight") {
      let slug = String(u.searchParams.get("slug") || "").toLowerCase(), m = await member(req, env);
      if (FOTN || (FOTN_AT = 0), await refreshFotn(env), !m && slug !== FOTN) return NEED_ACCOUNT();
      if (HIDDEN.has(slug)) return json({ error: "This fight was removed at the site owner's request." }, 410);
      let f = await storedFight(env, slug);
      return f ? json(withReport(f.d, paid(m)), 200, { "cache-control": "no-store" }) : json({ error: "Fight not found." }, 404);
    }
    if (p === "/api/vote" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let slug = String(body.slug || "").toLowerCase(), side = body.side === "a" ? "a" : body.side === "b" ? "b" : null;
      if (!slug || !side || !env.DB) return json({ error: "Bad request" }, 400);
      let k = `v:${slug}:${ipOf(req)}`;
      env.LIMITS && await env.LIMITS.get(k) || (await env.DB.prepare(`UPDATE fights SET votes_${side} = COALESCE(votes_${side}, 0) + 1 WHERE slug = ?1`).bind(slug).run(), env.LIMITS && ctx.waitUntil(Promise.all([env.LIMITS.put(k, side, { expirationTtl: 60 * 86400 }), logEv(env, "pick", null, `${slug}:${side}`)])));
      let row = await env.DB.prepare("SELECT COALESCE(votes_a,0) AS votes_a, COALESCE(votes_b,0) AS votes_b FROM fights WHERE slug=?1").bind(slug).first();
      return json(row || { votes_a: 0, votes_b: 0 });
    }
    if (p === "/api/rivals") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      if (!env.SERPER_KEY && !env.AI) return json({ error: "Rival finder isn't available right now. Try again soon." }, 503);
      if (!await canUse(env, m.key, "rivals", planOf(m))) return OUT(planOf(m), "rival finder");
      ctx.waitUntil(spend(env, m.key, "rivals", planOf(m)));
      try {
        let site = norm(u.searchParams.get("site")), pgHtml = await (await get(site)).text(), kws = keywordsFromHtml(pgHtml, hostOf(site));
        if (env.AI) {
          let ai = await aiRivals(env, hostOf(site), pgHtml, kws).catch(() => []);
          if (ai.length || !env.SERPER_KEY) return json({ rivals: ai, keywords: kws, source: "ai" });
        }
        return kws.length ? json({ rivals: await findRivals(env, hostOf(site), kws, u.searchParams.get("gl") || "us"), keywords: kws }) : json({ rivals: [] });
      } catch {
        return json({ error: "Couldn't read that site. Check the address." }, 502);
      }
    }
    if (p === "/api/keywords") {
      if (!await member(req, env)) return NEED_ACCOUNT();
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
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      if (!env.SERPER_KEY) return json({ error: "Keyword Battle isn't available right now. Try again soon." }, 503);
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
      let gl = paid(m) ? String(body.country || "us").slice(0, 2) : "us", who = m.key, plan = planOf(m);
      if (!await canUse(env, who, "battles", plan))
        return json({ error: paid(m) ? LIMITS[plan].battles[0] ? `You've used your ${LIMITS[plan].battles[0]} Keyword Battles this month.` : "Keyword Battle is part of Pro and Agency." : "You've used your free Keyword Battle this week. Go Pro for 4 a month with all 10 keywords." }, 429);
      try {
        let res = await battle(env, a, b, paid(m) ? kws : kws.slice(0, 1), gl);
        return ctx.waitUntil(spend(env, who, "battles", plan)), paid(m) && env.DB && ctx.waitUntil(env.DB.prepare(
          `INSERT INTO battles (member_key, email, a, b, gl, keywords, last, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
           ON CONFLICT(member_key, a, b) DO UPDATE SET gl=?5, keywords=?6, last=?7`
        ).bind(m.key, m.email, a, b, gl, JSON.stringify(kws), JSON.stringify(res.rows), Date.now()).run()), paid(m) || (res.rows = kws.map((k, i) => i === 0 ? res.rows[0] : { locked: !0 }), res.winsA = res.rows[0].edge === "a" ? 1 : 0, res.winsB = res.rows[0].edge === "b" ? 1 : 0), json(res);
      } catch {
        return json({ error: "Google search didn't answer. Try again in a minute." }, 502);
      }
    }
    if (p === "/api/links") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      if (!await canUse(env, m.key, "links", planOf(m))) return OUT(planOf(m), "link check");
      try {
        let url = normPage(u.searchParams.get("url")), r = await get(url, 1e4), out = await checkLinks(r.url || url, await r.text(), UA);
        return ctx.waitUntil(spend(env, m.key, "links", planOf(m))), json(out);
      } catch {
        return json({ error: "Couldn't load that page. Check the address." }, 502);
      }
    }
    if (p === "/api/strategy" && req.method === "POST") {
      let m = await member(req, env);
      if (!paid(m)) return json({ error: "AI strategy is a Pro feature." }, 402);
      if (!env.OPENROUTER_KEY && !env.AI) return json({ error: "AI strategy isn't available right now. Try again soon." }, 503);
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
      if (LIMITS[planOf(m)].strategy[0] === 0) return json({ error: "AI strategy is part of Pro and Agency." }, 402);
      if (!await canUse(env, m.key, "strategy", planOf(m))) return json({ error: "You've used this month's AI strategies. They reset on the 1st." }, 429);
      try {
        let old = await storedFight(env, slugOf(hostOf(a), hostOf(b))), d = old ? old.d : await runFight(a, b, env), strategy = await aiStrategy(env, d);
        return ctx.waitUntil(spend(env, m.key, "strategy", planOf(m))), json({ strategy });
      } catch {
        return json({ error: "The AI didn't answer. Try again in a minute." }, 502);
      }
    }
    if (p === "/api/watch" && req.method === "POST") {
      let m = await member(req, env);
      if (!paid(m)) return json({ error: "Monday email reports are a Pro feature." }, 402);
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
    if (p === "/api/use" && req.method === "POST") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      let body;
      try {
        body = await req.json();
      } catch {
        body = {};
      }
      let tool = ["robots", "schema", "llms"].includes(body.tool) ? body.tool : "robots";
      return await canUse(env, m.key, "gen:" + tool, planOf(m)) ? (await spend(env, m.key, "gen:" + tool, planOf(m)), json({ ok: !0 })) : OUT(planOf(m), "generator use");
    }
    if (p === "/api/lead" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let email = String(body.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return json({ error: "Enter a valid email." }, 400);
      if (!env.DB) return json({ error: "Not set up" }, 503);
      let k = `lead:${ipOf(req)}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`, n = env.LIMITS ? parseInt(await env.LIMITS.get(k) || "0", 10) : 0;
      if (n > 20) return json({ error: "Too many sign-ups today." }, 429);
      env.LIMITS && ctx.waitUntil(env.LIMITS.put(k, String(n + 1), { expirationTtl: 9e4 }));
      let info = JSON.stringify({ site: String(body.site || "").slice(0, 200), fight: String(body.fight || "").slice(0, 200), ...typeof body.info == "object" ? body.info : {} }).slice(0, 2e3);
      if (await env.DB.prepare("INSERT INTO leads (email, plan, info, created_at) VALUES (?1, ?2, ?3, ?4)").bind(email, String(body.plan || "pro").slice(0, 30), info, Date.now()).run(), env.RESEND_KEY && env.OWNER_EMAIL) {
        let isContact = body.plan === "contact" || body.plan === "removal", parsed = JSON.parse(info), rows = [["Email", email], ["Type", String(body.plan || "pro")], ...Object.entries(parsed).filter(([, v]) => v !== "" && v != null).map(([k2, v]) => [k2[0].toUpperCase() + k2.slice(1), typeof v == "object" ? JSON.stringify(v) : String(v)])];
        ctx.waitUntil(sendEmail(
          env,
          env.OWNER_EMAIL,
          body.plan === "removal" ? `Removal request from ${email}` : isContact ? `Contact: ${parsed.subject || "message"} from ${email}` : `New ${body.plan || "pro"} sign-up: ${email}`,
          EMAIL.owner(isContact ? "New message" : `New ${String(body.plan || "pro")} lead`, rows),
          { replyTo: email }
        ));
      }
      return json({ ok: !0 });
    }
    if (p === "/api/prospects" && req.method === "POST") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      let plan = planOf(m);
      if (!LIMITS[plan].hunts[0]) return json({ error: "Prospect Hunter is part of the Agency plan." }, 402);
      if (!env.SERPER_KEY) return json({ error: "Prospect Hunter isn't available right now. Try again soon." }, 503);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let industry = String(body.industry || "").trim().slice(0, 60), city = String(body.city || "").trim().slice(0, 60);
      if (industry.length < 2 || city.length < 2) return json({ error: "Enter an industry and a city." }, 400);
      if (!await canUse(env, m.key, "hunts", plan)) return OUT(plan, "prospect hunt");
      try {
        let res = await prospectHunt(env, industry, city, String(body.country || "us").slice(0, 2));
        return ctx.waitUntil(spend(env, m.key, "hunts", plan)), res.prospects.length && ctx.waitUntil(tables(env).then(() => env.DB.prepare("INSERT INTO hunts (member_key, industry, city, result, at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(m.key, industry, city, JSON.stringify(res), Date.now()).run()).catch(() => {
        })), json({ industry, city, ...res });
      } catch {
        return json({ error: "Google search didn't answer. Try again in a minute." }, 502);
      }
    }
    if (p === "/api/admin/autoblog" && req.method === "POST") {
      let m = await member(req, env);
      if (!m || m.plan !== "owner") return json({ error: "Owner only." }, 403);
      let body = {};
      try {
        body = await req.json();
      } catch {
      }
      let r = await autoBlog(env, { force: !0, slug: body.fight ? String(body.fight).toLowerCase().slice(0, 200) : null });
      return json(r, r.error ? 503 : 200);
    }
    if (p === "/api/admin/hide-fight" && req.method === "POST") {
      let m = await member(req, env);
      if (!m || m.plan !== "owner") return json({ error: "Owner only." }, 403);
      let body = {};
      try {
        body = await req.json();
      } catch {
      }
      let slug = String(body.slug || "").toLowerCase().trim().slice(0, 300);
      if (!slug) return json({ error: "Send { slug }." }, 400);
      await tables(env);
      let undo = body.show === !0;
      return undo ? await env.DB.prepare("DELETE FROM hidden_fights WHERE slug = ?1").bind(slug).run() : await env.DB.batch([env.DB.prepare("INSERT OR REPLACE INTO hidden_fights (slug, at) VALUES (?1, ?2)").bind(slug, Date.now()), env.DB.prepare("INSERT OR REPLACE INTO blocked (slug, reason, at) VALUES (?1, 'removed', ?2)").bind(slug, Date.now())]), await refreshHidden(env, !0), FOTN_AT = 0, json({ ok: !0, slug, hidden: !undo });
    }
    if (p === "/api/me") {
      let m = await member(req, env), auth = { google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), link: !!env.RESEND_KEY };
      if (!m) return json({ auth }, 200, { "cache-control": "no-store" });
      let out = { plan: planOf(m), name: PLAN_NAMES[planOf(m)], email: m.email, auth };
      return u.searchParams.get("home") && Object.assign(out, await homeExtras(env, m)), json(out, 200, { "cache-control": "no-store" });
    }
    if (p === "/api/hunts") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      if (!LIMITS[planOf(m)].hunts[0]) return json({ error: "Prospect Hunter is part of the Agency plan." }, 402);
      let n = Math.max(1, Math.min(30, parseInt(u.searchParams.get("n") || "3", 10) || 3));
      return json({ hunts: await huntList(env, m, n) }, 200, { "cache-control": "no-store" });
    }
    if (p === "/api/signup" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let email = String(body.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return json({ error: "Enter a valid email." }, 400);
      if (!env.DB) return json({ error: "Not set up" }, 503);
      let k = `su:${ipOf(req)}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`, n = env.LIMITS ? parseInt(await env.LIMITS.get(k) || "0", 10) : 0;
      if (env.RESEND_KEY && env.LIMITS) {
        if (n >= 20) return json({ error: "Too many tries from here today." }, 429);
        ctx.waitUntil(env.LIMITS.put(k, String(n + 1), { expirationTtl: 9e4 }));
        let t = rand();
        return await env.LIMITS.put(`login:${t}`, JSON.stringify({ email, next: safeNext(body.next) }), { expirationTtl: 1800 }), await sendEmail(env, email, "Your SEO Fights sign-in link", EMAIL.signIn(`${SITE}/auth/email?t=${t}`)) ? (ctx.waitUntil(logEv(env, "link_sent", null, email)), json({ sent: !0, email })) : json({ error: "Couldn't send the email. Try again." }, 502);
      }
      let old = await env.DB.prepare("SELECT key, plan, active FROM members WHERE email=?1").bind(email).first();
      if (!(old && old.plan === "free")) {
        if (n >= 20) return json({ error: "Too many sign-ups from here today." }, 429);
        env.LIMITS && ctx.waitUntil(env.LIMITS.put(k, String(n + 1), { expirationTtl: 9e4 }));
      }
      if (old && old.plan !== "free" && old.active) return json({ error: "This email has a paid plan. Get your access link on the Account page." }, 409);
      let key = old && old.plan === "free" ? old.key : null;
      return key || (key = rand(), old ? await env.DB.prepare("UPDATE members SET key=?1, plan='free', active=1 WHERE email=?2").bind(key, email).run() : (await env.DB.prepare("INSERT INTO members (key, email, plan, active, created_at) VALUES (?1, ?2, 'free', 1, ?3)").bind(key, email, Date.now()).run(), ctx.waitUntil(logEv(env, "signup", "free", `direct: ${email}`))), env.RESEND_KEY && env.OWNER_EMAIL && ctx.waitUntil(sendEmail(env, env.OWNER_EMAIL, `New free sign-up: ${email}`, EMAIL.owner("New free sign-up", [["Email", email], ["Plan", "Free"]])))), json({ plan: "free", name: "Free", email }, 200, { "set-cookie": cookieFor(key) });
    }
    if (p === "/api/restore" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let email = String(body.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email." }, 400);
      if (!await toolUse(env, req, "rivals")) return json({ error: "Too many tries today." }, 429);
      let m = env.DB && await env.DB.prepare("SELECT key, plan FROM members WHERE email=?1 AND active=1").bind(email).first();
      return m && ctx.waitUntil(sendEmail(env, email, "Your SEO Fights access link", EMAIL.access(`${SITE}/activate?key=${m.key}`, PLAN_NAMES[m.plan] || "Pro"))), json({ ok: !0, email: !!env.RESEND_KEY });
    }
    if (p === "/auth/email") {
      let t = u.searchParams.get("t") || "", raw = env.LIMITS && t ? await env.LIMITS.get(`login:${t}`) : null;
      if (!raw) return infoPage(env, { path: p, noindex: !0, status: 400, title: "Link expired \xB7 SEO Fights", h1: "Link expired", lede: "Sign-in links work once and last 30 minutes.", body: '<p><a class="btn fight" href="/account">Get a new link</a></p>' });
      ctx.waitUntil(env.LIMITS.delete(`login:${t}`));
      let { email, next } = JSON.parse(raw);
      return signedIn(await loginEmail(env, email), safeNext(next));
    }
    if (p === "/auth/google") {
      if (!env.GOOGLE_CLIENT_ID) return new Response(null, { status: 302, headers: { location: "/account" } });
      let state = rand(), next = safeNext(u.searchParams.get("next")), q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: SITE + "/auth/google/callback", response_type: "code", scope: "openid email", state, prompt: "select_account" }), h = new Headers({ location: "https://accounts.google.com/o/oauth2/v2/auth?" + q });
      return h.append("set-cookie", `rf_oauth=${state}.${encodeURIComponent(next)}; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`), new Response(null, { status: 302, headers: h });
    }
    if (p === "/auth/google/callback") {
      let [state, nextEnc] = (cookie(req, "rf_oauth") || "").split("."), fail = () => infoPage(env, { path: p, noindex: !0, status: 400, title: "Sign-in failed \xB7 SEO Fights", h1: "Sign-in didn't work", lede: "Try again, or use your email instead.", body: '<p><a class="btn fight" href="/">Back to SEO Fights</a></p>' });
      if (!state || state !== u.searchParams.get("state") || !u.searchParams.get("code")) return fail();
      try {
        let tok = await (await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code: u.searchParams.get("code"), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: SITE + "/auth/google/callback", grant_type: "authorization_code" })
        })).json(), claims = JSON.parse(atob(tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return !claims.email || !claims.email_verified || claims.aud !== env.GOOGLE_CLIENT_ID ? fail() : signedIn(await loginEmail(env, String(claims.email).toLowerCase(), "google"), safeNext(decodeURIComponent(nextEnc || "%2F")), "rf_oauth=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
      } catch {
        return fail();
      }
    }
    if (p === "/signout" || p === "/logout") return new Response(null, { status: 302, headers: { location: "/", "set-cookie": SIGNOUT_COOKIE, "cache-control": "no-store" } });
    if (p === "/api/logout") return json({ ok: !0 }, 200, { "set-cookie": SIGNOUT_COOKIE, "cache-control": "no-store" });
    if (p === "/login" || p === "/signup") return new Response(null, { status: 302, headers: { location: "/account" } });
    if (p === "/activate") {
      let key = u.searchParams.get("key") || "", m = env.DB && await env.DB.prepare("SELECT key FROM members WHERE key=?1 AND active=1").bind(key).first();
      return m ? new Response(null, { status: 302, headers: { location: "/account?welcome=1", "set-cookie": cookieFor(m.key) } }) : infoPage(env, { path: p, noindex: !0, status: 400, title: "Link not valid \xB7 SEO Fights", h1: "Link not valid", lede: "This access link is old or the plan isn't active.", body: '<p><a class="btn" href="/account">Go to your account</a></p>' });
    }
    if (p === "/showdowns")
      return await sdEnsureOpener(env), infoPage(env, {
        path: p,
        cache: "public, max-age=120",
        title: "SEO Showdown: 2 sites, 1 keyword, 14 days \xB7 SEO Fights",
        desc: "Two websites fight for one Google keyword for 14 days. We check the rank every day, in public. Pick a winner.",
        h1: 'SEO <span class="r">Showdown</span>',
        lede: `2 sites. 1 keyword. ${SD_DAYS} days. Google decides. Everything public.`,
        body: sdIndex(await sdList(env, "live"), await sdList(env, "done", 12))
      });
    if (p.startsWith("/showdown/")) {
      let sd = await sdGet(env, decodeURIComponent(p.slice(10)));
      if (!sd) return infoPage(env, { path: p, status: 404, noindex: !0, title: "Showdown not found \xB7 SEO Fights", h1: "Not found", lede: "This showdown doesn't exist.", body: '<p><a class="btn fight" href="/showdowns">See live showdowns</a></p>' });
      ctx.waitUntil(env.DB.prepare("UPDATE showdowns SET views=views+1 WHERE id=?1").bind(sd.id).run());
      let A = sdName(sd.a), B2 = sdName(sd.b);
      return infoPage(env, {
        path: p,
        cache: "public, max-age=300",
        title: `${A} vs ${B2} for "${sd.keyword}": SEO Showdown \xB7 SEO Fights`,
        desc: `${A} vs ${B2}: who ranks higher on Google for "${sd.keyword}" after ${SD_DAYS} days? Daily ranks, in public.`,
        h1: `<span class="r">${esc2(A)}</span> vs <span class="b">${esc2(B2)}</span>`,
        lede: `Who ranks higher on Google for \u201C${esc2(sd.keyword)}\u201D after ${SD_DAYS} days?`,
        body: sdPage(sd)
      });
    }
    if (p === "/api/showdowns")
      return json({ live: (await sdList(env, "live", Math.min(12, parseInt(u.searchParams.get("n") || "3", 10) || 3))).map((s) => ({ id: s.id, a: s.a, b: s.b, keyword: s.keyword, day: sdDay(s), a_now: s.a_now, b_now: s.b_now })) }, 200, { "cache-control": "public, max-age=120" });
    if (p === "/api/showdown" && req.method === "POST") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let plan = planOf(m);
      if (!LIMITS[plan].showdowns[0]) return json({ error: "Showdowns are part of Pro: 2 a month, checked on Google every day." }, 402);
      if (!await canUse(env, m.key, "showdowns", plan)) return OUT(plan, "showdowns");
      if (!env.SERPER_KEY) return json({ error: "Showdowns aren't available right now. Try again soon." }, 503);
      try {
        let r = await sdCreate(env, { ...body, by: m.key });
        return r.existed || ctx.waitUntil(spend(env, m.key, "showdowns", plan)), json({ id: r.id, existed: r.existed });
      } catch (e) {
        return json({ error: e && e.message || "Enter two valid websites and a keyword." }, 400);
      }
    }
    if (p === "/api/showdown/vote" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Bad request" }, 400);
      }
      let id = String(body.id || ""), side = body.side === "a" ? "a" : body.side === "b" ? "b" : null;
      if (!id || !side || !env.DB) return json({ error: "Bad request" }, 400);
      let k = `sv:${id}:${ipOf(req)}`;
      await env.LIMITS.get(k) || (await env.DB.prepare(`UPDATE showdowns SET votes_${side} = COALESCE(votes_${side}, 0) + 1 WHERE id=?1 AND status='live'`).bind(id).run(), ctx.waitUntil(Promise.all([env.LIMITS.put(k, side, { expirationTtl: 30 * 86400 }), logEv(env, "showdown_vote", null, `${id}:${side}`)])));
      let row = await env.DB.prepare("SELECT COALESCE(votes_a,0) AS votes_a, COALESCE(votes_b,0) AS votes_b FROM showdowns WHERE id=?1").bind(id).first();
      return json(row || { votes_a: 0, votes_b: 0 });
    }
    if (p === "/admin") {
      let m = await member(req, env);
      return !m || m.plan !== "owner" ? new Response("Not found", { status: 404 }) : infoPage(env, { path: p, noindex: !0, cache: "no-store", title: "Stats \xB7 SEO Fights", h1: 'Your <span class="r">stats</span>', lede: "Owner only. Times are Vancouver time.", body: await adminHtml(env) });
    }
    if (p === "/dashboard" || p === "/account") {
      let m = await member(req, env), H1 = 'Your <span class="r">acc</span><span class="b">ount</span>';
      if (!m) return infoPage(env, { path: "/account", noindex: !0, cache: "no-store", title: "Your account \xB7 SEO Fights", h1: H1, lede: "Sign in, or get your access link if you already paid.", body: DASH_SIGNIN + `<div style="margin-top:18px">${RESTORE_HTML}</div>` });
      let D = await dashboardData(env, m);
      return infoPage(env, { path: "/account", noindex: !0, cache: "no-store", title: "Your account \xB7 SEO Fights", h1: H1, lede: `Signed in as ${esc2(m.email)} \xB7 ${esc2(D.name)} plan`, body: dashboardHtml(D) });
    }
    if (p === "/api/dashboard") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      let D = await dashboardData(env, m);
      return json(D, 200, { "cache-control": "no-store" });
    }
    if (p === "/api/account/emails" && req.method === "POST") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      let body = {};
      try {
        body = await req.json();
      } catch {
      }
      let pr = { ...await prefsOf(env, m.email) };
      return typeof body.fights == "boolean" && (pr.fights = body.fights), typeof body.keywords == "boolean" && (pr.keywords = body.keywords), await setPrefs(env, m.email, pr), json({ ok: !0, ...pr });
    }
    if (p === "/api/account/export") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      let D = await dashboardData(env, m), out = {
        exported_at: (/* @__PURE__ */ new Date()).toISOString(),
        account: { email: m.email, plan: planOf(m), active: !!m.active, created_at: m.created_at ? new Date(m.created_at).toISOString() : null },
        email_settings: D.prefs,
        fights: D.fights,
        keyword_battles: D.battles.list,
        prospect_hunts: D.hunts.list,
        monday_reports: D.watches.map(({ token, ...w }) => w)
      };
      return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="seo-fights-data-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
    }
    if (p === "/api/account/delete" && req.method === "POST") {
      let m = await member(req, env);
      if (!m) return NEED_ACCOUNT();
      let body = {};
      try {
        body = await req.json();
      } catch {
      }
      if (body.confirm !== "DELETE") return json({ error: "Type DELETE to confirm." }, 400);
      let plan = planOf(m);
      if (plan === "owner") return json({ error: "Owner accounts can't be deleted here." }, 403);
      if (plan === "pro" || plan === "agency") return json({ error: "Cancel your plan first so you're not charged again.", portal: portalFor(env, m.email) }, 409);
      await tables(env);
      let del = (sql, v) => env.DB.prepare(sql).bind(v);
      return await env.DB.batch([
        env.DB.prepare("INSERT INTO deletions (email_hash, plan, stripe_customer, at) VALUES (?1, ?2, ?3, ?4)").bind(await sha256(m.email), plan, m.customer || null, Date.now()),
        del("DELETE FROM member_fights WHERE member_key = ?1", m.key),
        del("DELETE FROM battles WHERE member_key = ?1", m.key),
        del("DELETE FROM hunts WHERE member_key = ?1", m.key),
        del("DELETE FROM watches WHERE email = ?1", m.email),
        del("DELETE FROM email_prefs WHERE email = ?1", m.email),
        del("DELETE FROM members WHERE key = ?1", m.key)
      ]), env.LIMITS && ctx.waitUntil(Promise.all(USAGE.flatMap(([what]) => ["week", "month"].map((per) => env.LIMITS.delete(`u:${what}:${period(per)}:${m.key}`)))).catch(() => {
      })), ctx.waitUntil(sendEmail(env, m.email, "Your SEO Fights account is deleted", EMAIL.deleted())), json({ ok: !0 }, 200, { "set-cookie": SIGNOUT_COOKIE });
    }
    if (p === "/unsubscribe") {
      let email = String(u.searchParams.get("e") || "").toLowerCase(), kind = ["fights", "keywords", "all"].includes(u.searchParams.get("k")) ? u.searchParams.get("k") : "all";
      if (!(email && u.searchParams.get("s") === await unsubSig(env, email, kind))) return infoPage(env, { path: p, noindex: !0, status: 400, title: "Link not valid \xB7 SEO Fights", h1: "Link not valid", lede: "This unsubscribe link is broken. Change your emails from your account instead.", body: '<p><a class="btn" href="/account#settings">Email settings</a></p>' });
      let what = kind === "fights" ? "Monday fight reports" : kind === "keywords" ? "Monday keyword reports" : "all Monday reports";
      if (req.method === "POST") {
        let pr = await prefsOf(env, email);
        return kind !== "keywords" && (pr.fights = !1), kind !== "fights" && (pr.keywords = !1), await setPrefs(env, email, pr), (req.headers.get("content-type") || "").includes("x-www-form-urlencoded") && !u.searchParams.get("form") ? new Response("Unsubscribed", { headers: { "content-type": "text/plain" } }) : infoPage(env, { path: p, noindex: !0, cache: "no-store", title: "Unsubscribed \xB7 SEO Fights", h1: "Unsubscribed", lede: `${esc2(email)} won't get ${what} anymore.`, body: '<p><a class="btn ghost" href="/account#settings">Email settings</a></p>' });
      }
      return infoPage(env, {
        path: p,
        noindex: !0,
        cache: "no-store",
        title: "Unsubscribe \xB7 SEO Fights",
        h1: "Unsubscribe",
        lede: `Stop ${what} for ${esc2(email)}?`,
        body: `<form method="post" action="${esc2(u.pathname + u.search + "&form=1")}"><button class="btn fight" type="submit" style="grid-column:auto;font-size:20px;padding:13px 22px">Unsubscribe</button></form><p class="muted" style="margin-top:12px">Sign-in links and receipts are always sent.</p>`
      });
    }
    if (p.startsWith("/go/")) {
      let to = { pro: env.STRIPE_PRO_LINK, agency: env.STRIPE_AGENCY_LINK, lifetime: lifeTier(env).link }[p.slice(4)], m = await member(req, env), dest = to && !to.startsWith("#") ? to + (m ? (to.includes("?") ? "&" : "?") + "prefilled_email=" + encodeURIComponent(m.email) : "") : "/pricing";
      return new Response(null, { status: 302, headers: { location: dest } });
    }
    if (p === "/api/stripe" && req.method === "POST") {
      if (!env.STRIPE_WEBHOOK_SECRET || !env.DB) return json({ error: "not set up" }, 503);
      let ev = await verifyStripe(req, env.STRIPE_WEBHOOK_SECRET);
      if (!ev) return json({ error: "bad signature" }, 400);
      let o = ev.data.object;
      if (ev.type === "checkout.session.completed" && (o.payment_status === "paid" || o.payment_status === "no_payment_required")) {
        let email = (o.customer_details?.email || o.customer_email || "").toLowerCase();
        if (!email) return json({ received: !0 });
        let plan = planFromSession(o);
        await env.DB.prepare(`INSERT INTO members (key, email, plan, customer, subscription, session_id, active, created_at) VALUES (?1,?2,?3,?4,?5,?6,1,?7)
          ON CONFLICT(email) DO UPDATE SET plan=CASE WHEN members.plan='owner' THEN 'owner' ELSE ?3 END, customer=?4, subscription=COALESCE(?5, subscription), session_id=?6, active=1`).bind(crypto.randomUUID().replace(/-/g, ""), email, plan, o.customer || "", o.subscription || null, o.id, Date.now()).run();
        let row = await env.DB.prepare("SELECT key FROM members WHERE email=?1").bind(email).first();
        ctx.waitUntil(logEv(env, "sale", plan, `${(o.amount_total || 0) / 100} ${String(o.currency || "usd").toUpperCase()} \xB7 ${email}`)), ctx.waitUntil(sendEmail(env, email, `You're ${PLAN_NAMES[plan]} on SEO Fights \u{1F94A}`, EMAIL.welcome(env, plan, email, row.key))), env.OWNER_EMAIL && ctx.waitUntil(sendEmail(
          env,
          env.OWNER_EMAIL,
          `\u{1F4B0} New ${PLAN_NAMES[plan]}: ${email}`,
          EMAIL.owner(`New ${PLAN_NAMES[plan]} sale`, [["Email", email], ["Plan", PLAN_NAMES[plan]], ["Amount", `${(o.amount_total || 0) / 100} ${String(o.currency || "").toUpperCase()}`]])
        ));
      }
      if (ev.type === "customer.subscription.updated") {
        let on = ["active", "trialing", "past_due"].includes(o.status) ? 1 : 0;
        await env.DB.prepare("UPDATE members SET active=?1 WHERE (subscription=?2 OR customer=?3) AND plan IN ('pro','agency')").bind(on, o.id, o.customer).run();
      }
      return ev.type === "customer.subscription.deleted" && (ctx.waitUntil(logEv(env, "cancel", null, o.customer || "")), await env.DB.prepare("UPDATE members SET plan='free', active=1, subscription=NULL WHERE (subscription=?1 OR customer=?2) AND plan IN ('pro','agency')").bind(o.id, o.customer).run()), (ev.type === "charge.dispute.created" || ev.type === "charge.refunded") && await env.DB.prepare("UPDATE members SET active=0 WHERE customer=?1 AND plan != 'owner'").bind(o.customer || "").run(), json({ received: !0 });
    }
    if (p === "/welcome") return infoPage(env, { path: p, noindex: !0, title: "Welcome to SEO Fights", h1: `You're <span class="r">in</span> \u{1F94A}`, lede: "Setting up your plan\u2026", body: WELCOME_HTML });
    if (p === "/api/welcome") {
      let sid = u.searchParams.get("session_id") || "", m = sid && env.DB && await env.DB.prepare("SELECT key, email, plan FROM members WHERE session_id=?1 AND active=1").bind(sid).first();
      return m ? json({ ready: !0, plan: PLAN_NAMES[m.plan] || "Pro", email: m.email }, 200, { "set-cookie": cookieFor(m.key) }) : json({ ready: !1 });
    }
    if (p.startsWith("/badge/") && p.endsWith(".svg")) {
      let bslug = decodeURIComponent(p.slice(7, -4)).toLowerCase(), old = HIDDEN.has(bslug) ? null : await storedFight(env, bslug);
      return old ? new Response(badgeSvg(old.d), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" } }) : new Response("Not found", { status: 404 });
    }
    if (p === "/kas.jpg") {
      let cache = caches.default, hit = await cache.match(req);
      if (hit) return hit;
      let r = await fetch("https://unavatar.io/x/kas_irani?fallback=false", { headers: { "user-agent": UA } });
      if (!r.ok) return new Response(null, { status: 404 });
      let out = new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400" } });
      return ctx.waitUntil(cache.put(req, out.clone())), out;
    }
    if (p.startsWith("/icon/")) {
      let host2 = decodeURIComponent(p.slice(6)).toLowerCase().replace(/^www\./, ""), letter = (host2[0] || "?").toUpperCase().replace(/[^A-Z0-9]/, "?"), tile = () => new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#172654"/><text x="32" y="43" font-family="Arial,sans-serif" font-size="32" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
      if (!/^[a-z0-9.-]{3,100}$/.test(host2) || unsafeHost(host2)) return tile();
      let cache = caches.default, key = new Request(`${SITE}/icon/${host2}`), hit = await cache.match(key);
      if (hit) return hit;
      try {
        let r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host2)}&sz=64`, { cf: { cacheTtl: 604800 } }), type = r.headers.get("content-type") || "";
        if (!r.ok || !type.startsWith("image/")) return tile();
        let out = new Response(r.body, { headers: { "content-type": type, "cache-control": "public, max-age=604800" } });
        return ctx.waitUntil(cache.put(key, out.clone())), out;
      } catch {
        return tile();
      }
    }
    if (p === "/favicon.svg" || p === "/favicon.ico") return new Response(FAVICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=604800" } });
    if (p === "/apple-touch-icon.png" || p === "/apple-touch-icon-precomposed.png") return new Response(Uint8Array.from(atob(touch_b64_default), (c) => c.charCodeAt(0)), { headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" } });
    if (p === "/og.png") {
      let bin = Uint8Array.from(atob(og_b64_default), (c) => c.charCodeAt(0));
      return new Response(bin, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    }
    if (p === "/blog") {
      let page2 = Math.max(1, Math.min(500, parseInt(u.searchParams.get("page") || "1", 10) || 1)), o = await blogIndex(env, page2);
      return o ? infoPage(env, { ...o, path: page2 > 1 ? `/blog?page=${page2}` : "/blog", cache: "public, max-age=600" }) : Response.redirect(`${SITE}/blog`, 302);
    }
    let CONTENT = { "/about": ABOUT, "/our-position": ABOUT, "/cookie-policy": COOKIES, "/contact": CONTACT, "/remove": REMOVE, "/tools-like": TOOLS_LIKE, "/alternatives": TOOLS_LIKE, ...ALT_PAGES };
    if (CONTENT[p]) return infoPage(env, { ...CONTENT[p], path: p === "/our-position" ? "/about" : p === "/alternatives" ? "/tools-like" : p });
    if (p.startsWith("/blog/")) {
      let post = POSTS.find((x) => x.slug === p.slice(6));
      if (post) {
        let o = postPage(post);
        return infoPage(env, { ...o, path: p, ld: { "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: post.desc, url: SITE + p, author: { "@type": "Person", name: "Kas", url: X_URL }, publisher: { "@type": "Organization", name: "SEO Fights", url: SITE } } });
      }
      let ap = await autoPost(env, decodeURIComponent(p.slice(6)).toLowerCase());
      if (ap && HIDDEN.has(ap.fight)) return infoPage(env, { path: p, noindex: !0, status: 410, title: "Post removed \xB7 SEO Fights", h1: "Post removed", lede: "This post was taken down at the site owner's request.", body: '<p><a class="btn ghost" href="/blog">More posts</a></p>' });
      if (ap) {
        let iso = new Date(ap.at).toISOString();
        return infoPage(env, {
          path: p,
          title: `${ap.title} \xB7 SEO Fights`,
          desc: ap.desc,
          h1: esc2(ap.title),
          lede: esc2(ap.desc),
          cache: "public, max-age=3600",
          body: `${POST_CSS}<article class="panel terms post-body">${ap.body}<p class="muted" style="margin-top:20px">By <a href="${X_URL}" target="_blank" rel="noopener">@${X_HANDLE}</a> \xB7 ${iso.slice(0, 10)} \xB7 Built on a real SEO Fights result</p></article>
<p style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn fight" href="/" style="grid-column:auto;font-size:20px;padding:13px 22px">Fight your own site</a> <a class="btn ghost" href="/fight/${encodeURIComponent(ap.fight)}">See the full fight</a> <a class="btn ghost" href="/blog">More posts</a></p>`,
          ld: { "@context": "https://schema.org", "@type": "BlogPosting", headline: ap.title, description: ap.desc, url: SITE + p, datePublished: iso, dateModified: iso, image: SITE + "/og.png", mainEntityOfPage: SITE + p, author: { "@type": "Person", name: "Kas", url: X_URL }, publisher: { "@type": "Organization", name: "SEO Fights", url: SITE } }
        });
      }
    }
    if (p === "/terms") return infoPage(env, { path: p, title: "Terms \xB7 SEO Fights", h1: "Terms", lede: "Short and plain.", body: TERMS_HTML });
    if (p === "/privacy") return infoPage(env, { path: p, title: "Privacy \xB7 SEO Fights", h1: "Privacy", lede: "What we collect and why.", body: PRIVACY_HTML });
    if (p.startsWith("/fight/")) {
      let slug = decodeURIComponent(p.slice(7)).toLowerCase();
      if (HIDDEN.has(slug)) return infoPage(env, { path: p, noindex: !0, status: 410, title: "Fight removed \xB7 SEO Fights", h1: "Fight removed", lede: "This fight page was taken down at the site owner's request.", body: '<p><a class="btn fight" href="/" style="grid-column:auto;font-size:20px;padding:13px 22px">Start your own fight</a> <a class="btn ghost" href="/remove">About removals</a></p>' });
      let old = await storedFight(env, slug), viewer = old ? await member(req, env) : null;
      if (old) return fightPage(env, old.d, `/fight/${encodeURIComponent(slug)}`, slug !== FOTN && !viewer, paid(viewer));
      let mm = slug.match(/^(.+\.[a-z]{2,})-vs-(.+\.[a-z]{2,})$/);
      return mm ? page(env, { ...HOME, view: "home", cards: await cardsList(env, 24), a: mm[1], b: mm[2], path: p, cache: "no-store" }) : page(env, { ...HOME, view: "home", cards: await cardsList(env, 24), a: "", b: "", status: 404, cache: "no-store" });
    }
    if (p === "/fights") return boardPage(env);
    if (p === "/pricing") return page(env, {
      ...HOME,
      view: "pricing",
      path: "/pricing",
      mode: "",
      cards: [],
      a: "",
      b: "",
      cache: "public, max-age=300",
      title: "Pricing \xB7 SEO Fights",
      desc: "SEO Fights pricing: Free, Pro $19/month, Agency $99/month, or Lifetime from $" + lifeTier(env).price + " once. All payments are final.",
      h1: 'Pick your <span class="r">weight</span> <span class="b">class</span>',
      lede: "Start free. Upgrade when you want more fights, Keyword Battles and AI strategy."
    });
    if (p === "/faq") return Response.redirect(`${SITE}/#faq`, 301);
    if (p === "/agency") {
      let m = await member(req, env);
      if (m && LIMITS[planOf(m)].hunts[0]) {
        let [left, list] = await Promise.all([usedOf(env, m, "hunts"), huntList(env, m, 30)]);
        return toolPage(env, p, u, {
          cache: "private, no-store",
          noindex: !0,
          crumbs: [],
          h1: '<span class="r">Prospect</span> <span class="b">Hunter</span>',
          lede: left.max >= 1e5 ? "Unlimited hunts. Pick an industry and a city." : `${left.left} of ${left.max} hunts left this month. Pick an industry and a city.`,
          css: `#agHow{display:none!important}[data-tool="agency"] .tool{grid-template-columns:1fr}.seo-sum:has(.dash){max-width:none;color:var(--ink)}${DASH_CSS.replace(/<\/?style>/g, "")}`,
          about: `<div class="dash"><div class="sec-head" style="margin:0;align-items:center"><h2 class="display" style="font-size:clamp(32px,4.4vw,44px)">Your hunts</h2><span class="tag">${list.length} saved</span></div>${list.length ? huntsHtml(list, !0) : '<div class="panel punch empty"><h3>No hunts yet</h3><p class="muted">Every hunt you run is saved here with its prospects and pitches.</p></div>'}</div>`
        });
      }
    }
    if (TOOL_PAGES[p]) return toolPage(env, p, u);
    if (p === "/sitemap.xml") {
      await tables(env);
      let rows = env.DB ? (await env.DB.prepare(`SELECT slug, updated_at FROM fights WHERE (category IS NOT NULL OR COALESCE(votes_a,0) + COALESCE(votes_b,0) >= 5) AND ${NOT_HIDDEN} ORDER BY views DESC LIMIT 45000`).all()).results : [], posts = [];
      try {
        posts = env.DB ? (await env.DB.prepare("SELECT slug, at FROM posts WHERE fight IS NULL OR fight NOT IN (SELECT slug FROM hidden_fights) ORDER BY at DESC LIMIT 5000").all()).results : [];
      } catch {
      }
      let urls = ["/", "/pricing", "/fights", ...Object.keys(TOOL_PAGES), "/about", "/blog", ...POSTS.map((x) => "/blog/" + x.slug), "/tools-like", ...Object.keys(ALT_PAGES), "/contact", "/remove", "/terms", "/privacy", "/cookie-policy"].map((x) => `<url><loc>${SITE}${x}</loc></url>`).concat(posts.map((r) => `<url><loc>${SITE}/blog/${encodeURIComponent(r.slug)}</loc><lastmod>${new Date(r.at).toISOString().slice(0, 10)}</lastmod></url>`)).concat(rows.map((r) => `<url><loc>${SITE}/fight/${encodeURIComponent(r.slug)}</loc><lastmod>${new Date(r.updated_at).toISOString().slice(0, 10)}</lastmod></url>`)).concat([`<url><loc>${SITE}/showdowns</loc></url>`]).concat(env.DB ? (await env.DB.prepare("SELECT id, start FROM showdowns ORDER BY start DESC LIMIT 2000").all().catch(() => ({ results: [] }))).results.map((r) => `<url><loc>${SITE}/showdown/${encodeURIComponent(r.id)}</loc><lastmod>${new Date(r.start).toISOString().slice(0, 10)}</lastmod></url>`) : []);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, { headers: { "content-type": "application/xml" } });
    }
    return p === "/robots.txt" ? new Response(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /activate

Sitemap: ${SITE}/sitemap.xml
`, { headers: { "content-type": "text/plain" } }) : p === "/llms.txt" ? new Response(`# SEO Fights

> SEO Fights compares two websites head to head on 31 live SEO and AI-search checks, names a winner, and gives the loser a ranked fix list.

## Pages

- [Start a fight](${SITE}/): compare two websites
- [Keyword Battle](${SITE}/keywords-battle): who ranks higher on Google for 10 keywords
- [Free SEO tools](${SITE}/tools): broken link checker, robots.txt, schema and llms.txt generators
- [Biggest fights](${SITE}/fights): most-watched brand vs brand results
- [SEO Showdown](${SITE}/showdowns): two sites, one keyword, 14 days of daily Google ranks
- [Blog](${SITE}/blog): plain guides to beating competitors on SEO
- [About](${SITE}/about): built in public by ${X_URL}

Free: 1 fight per week. Pro: $19/month. Agency: $99/month. Lifetime: founder price from $49 once, rising as spots sell.
`, { headers: { "content-type": "text/plain; charset=utf-8" } }) : p === "/" ? page(env, { ...HOME, view: "home", cards: await cardsList(env, 24), night: await nightData(env), a: "", b: "", cache: "public, max-age=120" }) : page(env, { ...HOME, status: 404, cache: "no-store" });
  },
  async scheduled(event, env, ctx) {
    env = withStore(env), ctx.waitUntil((async () => {
      try {
        await tables(env), await env.DB.prepare("DELETE FROM kv WHERE exp IS NOT NULL AND exp < ?1").bind(Date.now()).run(), await env.DB.prepare("DELETE FROM events WHERE at < ?1").bind(Date.now() - 400 * 864e5).run();
      } catch {
      }
    })()), env.SITE_URL && (SITE = env.SITE_URL), new Date(event.scheduledTime).getUTCDay() === 1 && new Date(event.scheduledTime).getUTCHours() === 15 ? ctx.waitUntil(weekly(env)) : ctx.waitUntil((async () => {
      try {
        await autoFights(env, 12);
      } catch {
      }
      try {
        await autoBlog(env);
      } catch {
      }
      try {
        await sdDaily(env);
      } catch {
      }
    })());
  }
};
export {
  worker_default as default
};
