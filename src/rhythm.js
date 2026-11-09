// Visit rhythm: how often each customer comes back, and who is overdue.
// Pure functions, no I/O, so they're easy to test.

import { DAY } from "./util.js";

// Rules in one place.
export const RULES = {
  maxAgeDays: 730,        // Canada (CASL): implied permission lasts 2 years after a purchase. Older = never contacted.
  overdueFactor: 1.5,     // "overdue" once the gap is 1.5x their normal rhythm
  lostFactor: 4,          // "lost" once the gap is 4x their rhythm (or 180+ days)
  lostDays: 180,
  oneTimerMinDays: 30,    // one-time visitors: wait at least 30 days before inviting them back
  minCycle: 7,
  maxCycle: 365,
  defaultCycle: 42,       // used when we only know one gap that looks odd
  trialMinDays: 2,        // intro buyers: give them a couple of days to take their first class
  trialMaxDays: 120,      // after 4 months an intro buyer is treated like any other past customer
};

// Intro / trial offers, and the paid plans that mean someone joined. Matched against item names in sales.
export const TRIAL_RE = /\b(intro|introductory|trial|new (client|student|member|customer)s?|first (class|visit|session|time)|starter|welcome|taster)\b/i;
export const PLAN_RE = /\b(member(ship)?s?|unlimited|monthly|annual|yearly|auto.?renew\w*|packs?|packages?|bundles?|\d+\s*(class|session|visit|ride)e?s?|punch ?card|class card|subscription)\b/i;

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// visits: array of { at, amount_cents }. Same-day visits count once.
export function profile(visits, now = Date.now()) {
  const days = [...new Set(visits.map((v) => Math.floor(v.at / DAY)))].sort((a, b) => a - b);
  const total = visits.reduce((s, v) => s + (v.amount_cents || 0), 0);
  const n = days.length;
  if (!n) return { visits: 0, segment: "none" };
  const first = days[0] * DAY, last = days[n - 1] * DAY;
  const since = Math.floor((now - last) / DAY);
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  let cycle = null;
  if (gaps.length) cycle = Math.round(Math.min(RULES.maxCycle, Math.max(RULES.minCycle, median(gaps))));
  const p = { visits: n, first, last, since, cycle, total_cents: total, avg_cents: Math.round(total / visits.length) || 0 };
  // Intro buyers: bought a trial offer, and no membership or class pack since.
  const trials = visits.filter((v) => v.item && TRIAL_RE.test(v.item));
  if (trials.length) {
    const t0 = Math.min(...trials.map((v) => v.at));
    p.trial_days = Math.floor((now - t0) / DAY);
    p.joined = visits.some((v) => v.item && v.at >= t0 && !TRIAL_RE.test(v.item) && PLAN_RE.test(v.item));
  }
  p.segment = segmentOf(p);
  p.due_at = cycle ? last + cycle * DAY : null;
  return p;
}

export function segmentOf({ visits, since, cycle, trial_days, joined }) {
  if (!visits) return "none";
  if (since > RULES.maxAgeDays) return "too_old";
  if (trial_days != null && !joined && trial_days <= RULES.trialMaxDays) return trial_days >= RULES.trialMinDays ? "trial" : "new";
  if (visits === 1) return since >= RULES.oneTimerMinDays ? "one_timer" : "new";
  if (since >= Math.max(RULES.lostDays, cycle * RULES.lostFactor)) return "lost";
  if (since >= cycle * RULES.overdueFactor) return "overdue";
  return "active";
}

// Which segments each campaign targets.
export const CAMPAIGNS = {
  trial: { segment: "trial", name: "Intro → member", blurb: "Bought an intro offer but haven't joined yet." },
  overdue: { segment: "overdue", name: "Overdue regulars", blurb: "Regulars who are late for their usual visit." },
  lost: { segment: "lost", name: "Lost regulars", blurb: "Regulars who stopped coming months ago." },
  one_timer: { segment: "one_timer", name: "One-time visitors", blurb: "People who came once and never came back." },
};

export const SEGMENT_LABEL = {
  trial: "Tried, not joined", active: "On track", overdue: "Overdue", lost: "Lost", one_timer: "One-timer", new: "New",
  too_old: "Over 2 years (never contacted)", none: "No visits",
};
