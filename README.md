# Rebooked

Brings past customers back to businesses on Square. The owner connects Square; Rebooked learns each customer's visit rhythm, emails the ones who are overdue (in the business's name), and charges only for **verified returns**: a paid sale in Square within 30 days.

Live as the Cloudflare Worker **rebooked** (D1 database `rebooked`). A public demo with simulated data is at `/demo`.

## How it works

1. **Connect Square** (`/square/connect`, OAuth, read-only scopes: merchant profile, customers, orders, payments).
2. **Sync** every 30 minutes (cron): customers, completed orders and payments from the last 2 years. Big accounts import over several runs.
3. **Rhythm** (`src/rhythm.js`): each customer's median gap between visits → segment:
   - `overdue`: gap ≥ 1.5× their rhythm · `lost`: ≥ 4× or 180+ days · `one_timer`: one visit, 30+ days ago
   - `too_old`: last purchase over 2 years ago → **never contacted** (CASL implied-consent window)
4. **Campaigns** (owner switches on): 3 emails (day 0, 4, 10), 9am–6pm Mon–Sat local time, max N new people a day, 60-day cooldown per person.
5. **Comparison group**: 10% of eligible people get no email, so the dashboard shows how many returns the emails actually caused.
6. **Verified returns** (`matchReturns`): first paid sale within 30 days of being added. Fee: 12% of that sale, min $5, max $500/month. Comparison-group returns never create fees.


## Getting customer data in

- **Upload any export (CSV).** `/app/import`. Works with Mindbody, Momence, Mariana Tek, Arketa, Glofox, Vagaro, Fresha, Jane, Square, spreadsheets. The browser parses the file (`src/importer.js`), detects columns from their names and contents, and shows the owner the mapping to confirm. Handles one-row-per-visit and one-row-per-customer files, title lines above the header, `Last, First` names, many date formats, refunds and cancelled/no-show rows. Only mapped fields are sent, in chunks; re-uploading the same file never double counts.
- **Square.** Live sync every 30 minutes (read-only OAuth).
- Later: a Zapier/Make webhook, then direct connectors for the systems pilots use.

## Leak Report

The first thing an owner sees. A conservative yearly win-back estimate: 1 in 10 overdue regulars and intro buyers come back, 1 in 33 lost regulars and one-time visitors (`LEAK_RATES` in `src/engine.js`). Only counts people who can legally be emailed.

## Intro → member

Sales whose item name looks like an intro or trial offer (`TRIAL_RE` in `src/rhythm.js`) with no membership or class pack bought since (`PLAN_RE`) put the customer in the `trial` segment for up to 120 days. Its campaign: how was your first class, book your next one, membership options.

## Messaging rules built in

- Only customers with a purchase in the last 2 years; only email (no texts) unless the customer opts in.
- Every email: business name, mailing address, one-click unsubscribe (`List-Unsubscribe` header + `/u/<token>`), "Sent by Rebooked on behalf of …".
- Unsubscribes stop all emails immediately and are stored in `consents` as proof.
- Text opt-in page (`/t/<token>`): unticked checkbox with the exact wording saved with time, IP and device. Texting itself isn't switched on yet.
- Owner must tick 3 boxes to turn on autopilot (real customers, terms/fees, correct address).

## Files

| Path | What it is |
| --- | --- |
| `src/worker.js` | Routes, owner sign-in (email link), Square connect, public links, cron |
| `src/square.js` | OAuth, token refresh/revoke, sync, mock mode |
| `src/rhythm.js` | Visit rhythm and segments (pure, unit-tested) |
| `src/engine.js` | Recompute, enrol, send, match returns, fees, dashboard stats |
| `src/email.js` | Win-back email templates (3 per campaign) and Resend sending |
| `src/demo.js` | Builds the `/demo` studio step by step and keeps it current |
| `src/mock.js` | Fake Square data (sample studio) |
| `src/app.js`, `src/pages.js`, `src/ui.js` | Dashboard, public pages, design |
| `test/` | `node --test test/*.test.js` |

## Local

```
npx wrangler dev -c wrangler.local.toml --port 8810
```
`wrangler.local.toml` sets `DEV=1` (sign-in link shown on screen) and `SQUARE_MOCK=1` (fake Square, nothing is emailed).

## Deploy

Pushing to the `rebooked` branch runs `.github/workflows/deploy-rebooked.yml` (tests, then `wrangler deploy`). It needs one repo secret: `CLOUDFLARE_API_TOKEN` (Cloudflare API token with "Edit Cloudflare Workers" + D1 edit permissions).

## Secrets and variables (Cloudflare dashboard → rebooked → Settings → Variables)

| Name | What for |
| --- | --- |
| `SQUARE_APP_ID`, `SQUARE_APP_SECRET` | From the Square Developer app (sandbox first, then production) |
| `SQUARE_ENV` | `sandbox` (default) or `production` |
| `TOKEN_KEY` | Long random string; encrypts Square tokens in the database |
| `RESEND_KEY` | Sending email (sign-in links and win-back emails) |
| `FROM_ADDRESS` | Sending address on a domain verified in Resend, e.g. `hello@send.rebooked.app` |
| `SITE_URL` | Public address, e.g. `https://rebooked.app` (used in email links and the Square redirect) |

Square app settings: OAuth redirect URL = `SITE_URL/square/callback`.

## Before the first paying business

- Lawyer review of `/terms`, `/privacy` and the text opt-in wording.
- Stripe billing for monthly fees (fees are calculated and shown; charging is not wired yet).
- Business mailing address for Rebooked itself in email footers if required.
