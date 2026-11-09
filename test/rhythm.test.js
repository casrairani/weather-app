import { test } from "node:test";
import assert from "node:assert/strict";
import { profile, segmentOf } from "../src/rhythm.js";

const DAY = 86400000;
const now = Date.UTC(2026, 10, 9);
const v = (daysAgo, cents = 5000) => ({ at: now - daysAgo * DAY, amount_cents: cents });

test("regular every 3 weeks, last seen 50 days ago is overdue", () => {
  const p = profile([v(113), v(92), v(71), v(50)], now);
  assert.equal(p.cycle, 21);
  assert.equal(p.segment, "overdue");
});

test("regular still on rhythm is active", () => {
  assert.equal(profile([v(63), v(42), v(21), v(10)], now).segment, "active");
});

test("regular gone 200 days is lost", () => {
  assert.equal(profile([v(260), v(230), v(200)], now).segment, "lost");
});

test("one visit 40 days ago is a one-timer, 10 days ago is new", () => {
  assert.equal(profile([v(40)], now).segment, "one_timer");
  assert.equal(profile([v(10)], now).segment, "new");
});

test("anyone whose last purchase is over 2 years old is never contacted", () => {
  assert.equal(profile([v(900), v(800), v(740)], now).segment, "too_old");
});

test("same-day visits count once", () => {
  const p = profile([v(30), v(30), v(9)], now);
  assert.equal(p.visits, 2);
});

test("segmentOf handles empty", () => {
  assert.equal(segmentOf({ visits: 0 }), "none");
});

test("intro buyers who haven't joined are 'trial'; joining or 4 months later ends it", async () => {
  const { profile } = await import("../src/rhythm.js");
  const now = Date.UTC(2026, 10, 9);
  const D = 86400000;
  const intro = [{ at: now - 20 * D, amount_cents: 5900, item: "Intro Offer - 3 Classes" }, { at: now - 14 * D, amount_cents: 0, item: "Intro Offer - 3 Classes" }];
  assert.equal(profile(intro, now).segment, "trial");
  assert.equal(profile([...intro, { at: now - 5 * D, amount_cents: 18900, item: "Monthly Unlimited" }], now).segment, "active");
  assert.equal(profile([...intro, { at: now - 5 * D, amount_cents: 3500, item: "Drop-in Class" }], now).segment, "trial");
  assert.equal(profile([{ at: now - 1 * D, amount_cents: 5900, item: "New Client Special" }], now).segment, "new");
  assert.equal(profile([{ at: now - 200 * D, amount_cents: 5900, item: "Intro week" }], now).segment, "one_timer");
});
