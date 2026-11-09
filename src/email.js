// Win-back emails, sent in the business's name. Email-client safe: tables + inline styles.
// Every email carries: who it's from, the business address, a working unsubscribe link (CASL + CAN-SPAM).

import { esc } from "./util.js";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = { bg: "#F4F5F7", ink: "#0B1220", muted: "#6B7280", line: "#E5E7EB", blue: "#2456F5" };

export const DEFAULT_OFFERS = {
  overdue: "",
  lost: "Come back this month and your next visit is 20% off.",
  one_timer: "Your second visit is 20% off when you book this month.",
};

const COPY = {
  overdue: [
    { subject: (f, b) => `${f || "Hi"}, ready for your next visit?`, lines: (f, b, wk) => [`Hi ${f || "there"},`, `It's been about ${wk} since your last visit to ${b}. We'd love to see you again. Want to grab a spot this week?`] },
    { subject: (f, b) => `Still a spot for you this week`, lines: (f, b) => [`Hi ${f || "there"},`, `Just a quick nudge: there are still open spots at ${b} this week. Booking takes less than a minute.`] },
    { subject: (f, b) => `Last reminder from ${b}`, lines: (f, b) => [`Hi ${f || "there"},`, `This is our last reminder, promise. Whenever you're ready, your spot at ${b} is one tap away.`] },
  ],
  lost: [
    { subject: (f, b) => `We miss you at ${b}`, lines: (f, b, wk) => [`Hi ${f || "there"},`, `It's been ${wk} since we last saw you at ${b}, and we miss having you around. A lot has happened since then, and we'd love to welcome you back.`] },
    { subject: (f, b) => `A little something to come back`, lines: (f, b) => [`Hi ${f || "there"},`, `If life got busy, we get it. Coming back to ${b} is easy, and this one's on us.`] },
    { subject: (f, b) => `Last call from ${b}`, lines: (f, b) => [`Hi ${f || "there"},`, `This is our last note. If now's the right time to come back, your offer is still here.`] },
  ],
  one_timer: [
    { subject: (f, b) => `Thanks for visiting ${b}`, lines: (f, b, wk) => [`Hi ${f || "there"},`, `Thanks again for coming to ${b}. Most people say the second visit is when it really clicks. Ready for round two?`] },
    { subject: (f, b) => `Ready for round two?`, lines: (f, b) => [`Hi ${f || "there"},`, `Your second visit to ${b} is waiting. Pick a time that suits you.`] },
    { subject: (f, b) => `Last reminder from ${b}`, lines: (f, b) => [`Hi ${f || "there"},`, `Our last reminder: your second-visit offer at ${b} is still open.`] },
  ],
};

export const STEP_DAYS = [0, 4, 10]; // email 1 now, email 2 after 4 days, email 3 after 10 days

const weeks = (days) => (days >= 60 ? `${Math.round(days / 30)} months` : `${Math.max(2, Math.round(days / 7))} weeks`);

export function buildEmail({ biz, customer, campaign, step, offer, links, daysSince }) {
  const c = COPY[campaign][step];
  const first = customer.first_name ? customer.first_name.split(" ")[0] : "";
  const subject = c.subject(first, biz.name);
  const lines = c.lines(esc(first), esc(biz.name), weeks(daysSince || 30));
  const p = (t) => `<p style="margin:0 0 14px;font:400 16px/1.6 ${FONT};color:${C.ink}">${t}</p>`;
  const offerBox = offer ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="background:#EEF3FF;border-radius:12px;padding:14px 16px;font:600 15px/1.45 ${FONT};color:${C.ink}">${esc(offer)}</td></tr></table>` : "";
  const button = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="background:${C.blue};border-radius:999px"><a href="${esc(links.book)}" style="display:inline-block;padding:14px 26px;font:600 16px/1 ${FONT};color:#fff;text-decoration:none">Book your next visit</a></td></tr></table>`;
  const textOpt = `<p style="margin:0;font:400 14px/1.5 ${FONT};color:${C.muted}">Prefer texts? <a href="${esc(links.optin)}" style="color:${C.blue}">Get openings and offers by text</a>.</p>`;
  const footer = `<p style="margin:0 0 6px;font:400 12px/1.6 ${FONT};color:${C.muted}"><b style="color:${C.ink}">${esc(biz.name)}</b>${biz.address ? ` · ${esc(biz.address)}` : ""}${biz.phone ? ` · ${esc(biz.phone)}` : ""}</p>
<p style="margin:0;font:400 12px/1.6 ${FONT};color:${C.muted}">You're getting this because you're a customer of ${esc(biz.name)}. <a href="${esc(links.unsub)}" style="color:${C.muted};text-decoration:underline">Unsubscribe</a> anytime.<br>Sent by Rebooked on behalf of ${esc(biz.name)}.</p>`;
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 6px 14px;font:700 17px/1 ${FONT};color:${C.ink}">${esc(biz.name)}</td></tr>
<tr><td style="background:#fff;border-radius:18px;padding:28px 26px 24px;border:1px solid ${C.line}">
${lines.map(p).join("")}${offerBox}${button}${textOpt}
</td></tr>
<tr><td style="padding:18px 8px 0">${footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [...lines.map((l) => l.replace(/&[a-z#0-9]+;/g, (m) => ({ "&amp;": "&", "&#39;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" }[m] || m))),
    offer || "", `Book your next visit: ${links.book}`, `Prefer texts? ${links.optin}`, "",
    `${biz.name}${biz.address ? ", " + biz.address : ""}`, `Unsubscribe: ${links.unsub}`, `Sent by Rebooked on behalf of ${biz.name}.`].filter((x) => x !== null).join("\n");
  return { subject, html: body, text };
}

// Send with Resend. Without RESEND_KEY in dev, pretend it sent (logged in messages as a dev send).
export async function sendEmail(env, { to, fromName, replyTo, subject, html, text, unsub }) {
  if (!env.RESEND_KEY) return env.DEV === "1" ? { ok: true, dev: true } : { ok: false };
  const from = `${fromName.replace(/[<>"]/g, "")} <${env.FROM_ADDRESS || "hello@send.rebooked.app"}>`;
  const msg = { from, to, subject, html, text, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
  if (replyTo) msg.reply_to = replyTo;
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_KEY}`, "content-type": "application/json" }, body: JSON.stringify(msg) });
    return { ok: r.ok };
  } catch { return { ok: false }; }
}

// Plain system emails to owners (sign-in links).
export function ownerEmail(title, text, button) {
  return `<!doctype html><html><body style="margin:0;background:${C.bg}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" style="max-width:480px"><tr><td style="padding:0 6px 14px;font:700 18px/1 ${FONT};color:${C.ink}">Rebooked</td></tr>
<tr><td style="background:#fff;border-radius:18px;padding:28px 26px;border:1px solid ${C.line}">
<h1 style="margin:0 0 12px;font:700 22px/1.2 ${FONT};color:${C.ink}">${esc(title)}</h1>
<p style="margin:0 0 18px;font:400 16px/1.6 ${FONT};color:${C.ink}">${esc(text)}</p>
<a href="${esc(button.href)}" style="display:inline-block;background:${C.blue};color:#fff;border-radius:999px;padding:13px 24px;font:600 16px/1 ${FONT};text-decoration:none">${esc(button.text)}</a>
<p style="margin:18px 0 0;font:400 13px/1.5 ${FONT};color:${C.muted}">This link works once and expires in 30 minutes. If you didn't ask for it, ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}
