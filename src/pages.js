// Public pages: home, terms, privacy.

import { page } from "./ui.js";

const HERO_CSS = `<style>
.hero{padding:76px 0 40px}
.hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}
.kick{font:600 15px/1 var(--f);color:var(--blue);margin-bottom:18px;display:flex;gap:8px;align-items:center}
.hero h1{font-size:clamp(40px,6vw,68px);line-height:1.02;font-weight:750;letter-spacing:-.04em}
.hero h1 .soft{color:#9AA1AE}
.hero p.lede{font-size:20px;line-height:1.5;color:var(--ink2);margin:22px 0 30px;max-width:33em}
.ctas{display:flex;gap:12px;flex-wrap:wrap}
.trust{margin-top:22px;display:flex;gap:18px;flex-wrap:wrap;font-size:14px;color:var(--muted)}
.trust b{color:var(--ink)}
/* The timeline card: one real-looking customer coming back */
.story{background:#fff;border:1px solid var(--line);border-radius:26px;padding:22px;box-shadow:0 30px 60px -30px rgba(11,18,32,.25)}
.who{display:flex;gap:12px;align-items:center;padding-bottom:16px;border-bottom:1px solid var(--line)}
.av{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#C7D5FF,#2456F5);color:#fff;display:grid;place-items:center;font:700 16px/1 var(--fd)}
.who b{display:block;font-size:16px}.who span{font-size:13.5px;color:var(--muted)}
.rhythm{margin:16px 0 6px;display:grid;grid-template-columns:repeat(12,1fr);gap:5px}
.rhythm i{height:26px;border-radius:7px;background:#EEF0F4}.rhythm i.v{background:var(--blue)}.rhythm i.late{background:repeating-linear-gradient(45deg,#FDE7C7,#FDE7C7 4px,#FEF3E2 4px,#FEF3E2 8px)}.rhythm i.back{background:var(--green)}
.legend{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-bottom:14px}
.step{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)}
.step .ic{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none;font-size:15px}
.step b{font-size:15px;display:block}.step span{font-size:13.5px;color:var(--muted)}
.verified{margin-top:6px;display:flex;justify-content:space-between;align-items:center;background:var(--gsoft);border-radius:14px;padding:12px 14px;font-size:14px;color:var(--green);font-weight:600}
.verified big{font:750 20px/1 var(--fd);color:var(--ink)}
.sec{padding:72px 0 10px}.sec h2{font-size:clamp(30px,4vw,44px);line-height:1.08;font-weight:750;max-width:20em}
.sec p.sub{font-size:19px;color:var(--ink2);max-width:36em;margin:14px 0 0}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:34px}
.steps .card{padding:26px}.steps .n{font:750 15px/1 var(--fd);color:var(--blue);margin-bottom:16px}
.steps h3{font-size:21px;margin-bottom:8px}.steps p{margin:0;color:var(--ink2);font-size:16px}
.price{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-top:34px}
.price .big{font:750 64px/1 var(--fd);letter-spacing:-.04em}.price .big small{font-size:22px;color:var(--muted);font-weight:600;letter-spacing:-.01em}
.price ul{margin:16px 0 0;padding:0;list-style:none}.price li{padding:9px 0;border-top:1px solid var(--line);font-size:16px}
.rules{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:34px}
.rules .card h3{font-size:18px;margin-bottom:6px}.rules .card p{margin:0;color:var(--ink2);font-size:15.5px}
.cta-band{margin-top:80px;background:var(--ink);color:#fff;border-radius:28px;padding:48px 40px;display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.cta-band h2{font-size:clamp(28px,3.4vw,40px);max-width:16em}
@media (max-width:900px){.hero .grid,.price{grid-template-columns:1fr}.steps,.rules{grid-template-columns:1fr}.hero{padding-top:40px}.cta-band{padding:34px 24px}}
</style>`;

export function home() {
  const rhythm = ["v", "", "", "v", "", "", "v", "", "", "late", "late", "back"].map((c) => `<i class="${c}"></i>`).join("");
  const body = `
<main>
<section class="hero"><div class="wrap grid">
  <div>
    <div class="kick"><span class="dot"></span>For businesses on Square</div>
    <h1>Your past customers are your easiest <span class="soft">next customers.</span></h1>
    <p class="lede">Rebooked connects to Square, spots the regulars who are late for their usual visit, and brings them back with friendly emails in your name. You only pay when they come back, and Square confirms it.</p>
    <div class="ctas"><a class="btn" href="/signin?next=/app">Connect Square, free to start</a><a class="btn ghost" href="/demo">See the live demo</a></div>
    <div class="trust"><span><b>$0</b> if nobody comes back</span><span><b>2-minute</b> setup</span><span>Built for <b>Canada's anti-spam law</b></span></div>
  </div>
  <div class="story" aria-label="Example: a regular customer brought back">
    <div class="who"><div class="av">SN</div><div><b>Sara Nguyen</b><span>Usually comes every 3 weeks · last visit 7 weeks ago</span></div></div>
    <div class="rhythm">${rhythm}</div>
    <div class="legend"><span>12 weeks ago</span><span>this week</span></div>
    <div class="step"><div class="ic" style="background:var(--asoft)">⏰</div><div><b>Flagged as overdue</b><span>Her gap is twice her normal rhythm</span></div></div>
    <div class="step"><div class="ic" style="background:var(--soft)">✉️</div><div><b>Tuesday, 10:04am: "Sara, ready for your next visit?"</b><span>Sent from Kits Pilates Studio, with one tap to book</span></div></div>
    <div class="step"><div class="ic" style="background:var(--gsoft)">✓</div><div><b>Friday: booked, came in, paid</b><span>Matched to her sale in Square</span></div></div>
    <div class="verified"><span>Verified return</span><big>$35.00</big></div>
  </div>
</div></section>

<section class="sec"><div class="wrap">
  <h2>Every business has a list of people who meant to come back.</h2>
  <p class="sub">Most never get a reminder. Staff are busy, the marketing tool sits switched off, and the regular who used to come every three weeks quietly drifts away. Rebooked does the remembering for you.</p>
  <div class="steps">
    <div class="card"><div class="n">Step 1</div><h3>Connect Square</h3><p>One button. Rebooked reads your customers and sales. It can't charge cards or change anything in Square.</p></div>
    <div class="card"><div class="n">Step 2</div><h3>We find who's overdue</h3><p>Each customer's own rhythm: weekly regulars, monthly regulars, one-time visitors. Late ones get a friendly note, at most three, then we stop.</p></div>
    <div class="card"><div class="n">Step 3</div><h3>They come back, you pay a share</h3><p>When someone we emailed pays you within 30 days, Square shows it, and that's the only time you're charged.</p></div>
  </div>
</div></section>

<section class="sec" id="pricing"><div class="wrap">
  <h2>Pay for customers, not for software.</h2>
  <div class="price">
    <div class="card" style="padding:30px">
      <div class="big">12%<small> of what they spend</small></div>
      <ul><li>Only for customers we emailed who pay you within 30 days</li><li>Minimum $5 per returning customer</li><li><b>Never more than $500 a month</b></li><li>Nobody comes back? You pay nothing</li></ul>
    </div>
    <div class="card" style="padding:30px">
      <h3 style="font-size:21px;margin-bottom:10px">Honest numbers, built in</h3>
      <p style="margin:0;color:var(--ink2)">We hold back 1 in 10 overdue customers and don't email them. Your dashboard compares the two groups, so you can see exactly how many returns Rebooked caused, not just how many happened.</p>
    </div>
  </div>
</div></section>

<section class="sec"><div class="wrap">
  <h2>Careful with your customers by design.</h2>
  <div class="rules">
    <div class="card"><h3>Only real customers, only recent ones</h3><p>We only email people who bought from you in the last 2 years, the window Canada's anti-spam law (CASL) allows. Older contacts are never touched.</p></div>
    <div class="card"><h3>Your name, your address, one-click unsubscribe</h3><p>Every email comes from your business, shows your address, and stops instantly when someone unsubscribes.</p></div>
    <div class="card"><h3>No texts without a yes</h3><p>Customers can choose to get openings by text. Until someone ticks that box themselves, we only email.</p></div>
    <div class="card"><h3>Gentle by default</h3><p>Three emails at most, sent during business hours, never to the same person twice in 60 days.</p></div>
  </div>
  <div class="cta-band"><h2>See who's waiting to come back to you.</h2><a class="btn white" href="/signin?next=/app">Connect Square</a></div>
</div></section>
</main>`;
  return page({ title: "Rebooked: bring your past customers back", head: HERO_CSS, body, nav: `<a class="l hide-m" href="/demo">Demo</a><a class="l hide-m" href="#pricing">Pricing</a><a class="btn sm" href="/signin?next=/app">Sign in</a>` });
}

const legalWrap = (title, html) => page({ title: `${title} · Rebooked`, body: `<main class="wrap" style="max-width:760px;padding-top:56px"><h1 style="font-size:40px;margin-bottom:6px">${title}</h1><p class="muted small">Last updated November 9, 2026</p><div style="font-size:16px;line-height:1.65">${html}</div></main>` });

export function terms() {
  return legalWrap("Terms of service", `
<h3>1. What Rebooked does</h3><p>Rebooked is operated from Vancouver, British Columbia. When you connect your Square account, Rebooked reads your customers and completed sales, identifies customers who are late for their usual visit, and sends win-back emails in your business's name. Rebooked acts as your service provider: you are the sender of these messages.</p>
<h3>2. Your responsibilities</h3><p>You confirm that the customers in your Square account are real customers of your business who gave you their contact details, and that you have the right to contact them about your business. You agree not to use Rebooked for anything unlawful. You're responsible for the offers you choose to make and for honouring them.</p>
<h3>3. Messaging rules we apply for you</h3><p>We only email customers whose last purchase was within the past 2 years. Every email identifies your business, includes your mailing address and a working unsubscribe link, and unsubscribes are honoured immediately. Text messages are only sent to customers who have given express consent, and only when texting is switched on.</p>
<h3>4. Fees</h3><p>You pay a success fee for each verified return: a customer Rebooked emailed who completes a paid sale in your Square account within 30 days of being added to a campaign. The fee is 12% of that sale, with a minimum of $5 per returning customer and a maximum of $500 per calendar month, unless agreed otherwise in writing. Customers in the comparison group (who receive no email) never create fees. Fees are billed monthly. All payments are final.</p>
<h3>5. Your data</h3><p>Your data stays yours. We use it only to provide Rebooked to you. You can disconnect Square or delete all your data from your dashboard at any time. See our <a href="/privacy">privacy policy</a>.</p>
<h3>6. No guarantees</h3><p>We can't promise any number of returning customers. Rebooked is provided "as is". To the extent the law allows, our total liability is limited to the fees you paid us in the 3 months before a claim.</p>
<h3>7. Changes and ending</h3><p>You can stop using Rebooked at any time. We may update these terms and will tell you by email before material changes take effect. These terms are governed by the laws of British Columbia and Canada.</p>
<p class="muted small">Questions: <a href="mailto:hello@rebooked.app">hello@rebooked.app</a></p>`);
}

export function privacy() {
  return legalWrap("Privacy policy", `
<p>Rebooked is operated from Vancouver, British Columbia, and follows Canada's PIPEDA and British Columbia's PIPA.</p>
<h3>Business owners</h3><p>We keep your email address, your business details from Square (name, address, phone, website, time zone), encrypted Square access tokens, your settings, and records of fees.</p>
<h3>Your customers</h3><p>For each business, we process customer names, email addresses, phone numbers, and sales dates and amounts from Square, only to work out who is overdue, send win-back emails on the business's behalf, and confirm returns. We record unsubscribes and text-message consent (what was agreed, when, and from which device) as proof. We never sell personal information or use one business's customers for another business.</p>
<h3>Service providers</h3><p>We use Cloudflare (hosting and database), Square (data you connect), Resend (sending email) and Stripe (billing). Data may be processed in Canada and the United States.</p>
<h3>Keeping and deleting</h3><p>Owners can delete all of their business's data from the dashboard at any time. Customers can unsubscribe from any email, and can ask the business or us (<a href="mailto:privacy@rebooked.app">privacy@rebooked.app</a>) for access to or deletion of their information.</p>
<h3>Cookies</h3><p>One sign-in cookie for business owners. No advertising cookies.</p>`);
}
