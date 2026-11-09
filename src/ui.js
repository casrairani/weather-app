// Page shell, logo and styles. Apple-clean: off-white, one strong blue, generous space, system type.

import { esc } from "./util.js";

export const LOGO = (s = 28) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="9" fill="#2456F5"/><g fill="none" stroke="#fff" stroke-width="1.8"><rect x="6.5" y="8" width="8" height="6.5" rx="2"/><rect x="17.5" y="8" width="8" height="6.5" rx="2"/><rect x="6.5" y="17.5" width="8" height="6.5" rx="2"/></g><rect x="17.5" y="17.5" width="8" height="6.5" rx="2" fill="#fff"/></svg>`;

const CSS = `
:root{--bg:#FBFBFD;--card:#fff;--ink:#0B1220;--ink2:#2B3445;--muted:#6B7280;--line:#E7E8EC;--blue:#2456F5;--blue2:#1A44D6;--soft:#EEF3FF;--green:#12924A;--gsoft:#E8F7EE;--amber:#B45309;--asoft:#FEF3E2;--red:#C2410C;--r:18px;
--f:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--fd:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.55 var(--f);-webkit-font-smoothing:antialiased}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1120px;margin:0 auto;padding:0 22px}
.nav{position:sticky;top:0;z-index:20;background:rgba(251,251,253,.82);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);border-bottom:1px solid rgba(0,0,0,.06)}
.nav .wrap{display:flex;align-items:center;gap:14px;height:58px}
.brand{display:flex;align-items:center;gap:9px;font:700 18px/1 var(--fd);letter-spacing:-.02em;color:var(--ink)}.brand:hover{text-decoration:none}
.nav .sp{flex:1}.nav a.l{color:var(--ink2);font-size:15px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:var(--blue);color:#fff;font:600 16px/1 var(--f);padding:14px 22px;cursor:pointer;transition:background .15s,transform .05s;white-space:nowrap}
.btn:hover{background:var(--blue2);text-decoration:none}.btn:active{transform:scale(.98)}
.btn.sm{font-size:14px;padding:10px 16px}.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--line)}.btn.ghost:hover{background:#fff}
.btn.white{background:#fff;color:var(--ink)}.btn[disabled]{opacity:.45;cursor:not-allowed}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:22px}
.muted{color:var(--muted)}.small{font-size:14px}.tiny{font-size:12.5px}
h1,h2,h3{font-family:var(--fd);letter-spacing:-.025em;margin:0}
input[type=text],input[type=email],input[type=url],input[type=tel],input[type=number],textarea{width:100%;font:400 16px/1.4 var(--f);color:var(--ink);background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:12px 14px;outline:none;transition:border .15s}
input:focus,textarea:focus{border-color:var(--blue)}
label.f{display:block;font:600 14px/1.3 var(--f);margin:0 0 7px}
.pill{display:inline-flex;align-items:center;gap:6px;font:600 12.5px/1 var(--f);padding:6px 10px;border-radius:999px;background:var(--soft);color:var(--blue)}
.pill.g{background:var(--gsoft);color:var(--green)}.pill.a{background:var(--asoft);color:var(--amber)}.pill.n{background:#F1F2F4;color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
:focus-visible{outline:3px solid rgba(36,86,245,.35);outline-offset:2px;border-radius:10px}
.foot{border-top:1px solid var(--line);margin-top:80px;padding:28px 0 40px;color:var(--muted);font-size:14px}
.foot .wrap{display:flex;gap:18px;flex-wrap:wrap;align-items:center}.foot a{color:var(--muted)}
.switch{position:relative;display:inline-block;width:51px;height:31px;flex:none;vertical-align:middle}.switch input{opacity:0;width:0;height:0}
.switch span{position:absolute;inset:0;background:#E3E5E8;border-radius:999px;transition:.2s;cursor:pointer}
.switch span:before{content:"";position:absolute;width:27px;height:27px;left:2px;top:2px;background:#fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.18);transition:.2s}
.switch input:checked+span{background:#34C759}.switch input:checked+span:before{transform:translateX(20px)}
.switch input:disabled+span{opacity:.5;cursor:not-allowed}
table.t{width:100%;border-collapse:collapse;font-size:15px}table.t th{font:600 12.5px/1 var(--f);color:var(--muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
table.t td{padding:12px;border-bottom:1px solid var(--line);vertical-align:middle}table.t tr:last-child td{border-bottom:0}
.notice{border-radius:14px;padding:14px 16px;font-size:15px;background:var(--soft);color:var(--ink2)}
@media (max-width:720px){body{font-size:16px}.wrap{padding:0 16px}.nav a.l.hide-m{display:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

export function page({ title, body, nav = "", head = "", desc = "Rebooked brings past customers back to local businesses. Connect Square, we email the people who are late for their usual visit, and you only pay when they come back." }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#FBFBFD">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(LOGO(32))}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>${head}</head><body>
<nav class="nav"><div class="wrap"><a class="brand" href="/">${LOGO(26)}Rebooked</a><span class="sp"></span>${nav}</div></nav>
${body}
<footer class="foot"><div class="wrap"><span>© ${new Date().getFullYear()} Rebooked · Vancouver, BC</span><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/demo">Live demo</a><a href="mailto:hello@rebooked.app">Contact</a></div></footer>
</body></html>`;
}

// Simple centered message page (sign-in sent, unsubscribed, etc.).
export function simple(title, inner, nav = "") {
  return page({ title, nav, body: `<main class="wrap" style="max-width:520px;padding-top:72px"><div class="card" style="padding:30px">${inner}</div></main>` });
}
