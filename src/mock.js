// Fake Square data: a believable boutique studio with ~400 customers and 2 years of visits.
// Used for local testing (SQUARE_MOCK=1) and the public /demo. Deterministic: same seed, same data.

import { DAY } from "./util.js";

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FIRST = ["Sara", "Maya", "Olivia", "Priya", "Emma", "Chloe", "Ava", "Noor", "Leila", "Hannah", "Grace", "Zoe", "Mia", "Isla", "Ruby", "Nina", "Tara", "Jess", "Kiran", "Lena", "Sofia", "Amara", "Yuki", "Elena", "Dana", "Ben", "Leo", "Omar", "Sam", "Jordan", "Alex", "Daniel", "Arash", "Kai", "Eli", "Noah", "Ryan", "Theo", "Marco", "Jin"];
const LAST = ["Nguyen", "Patel", "Smith", "Chen", "Wong", "Singh", "Martin", "Brown", "Kim", "Lee", "Garcia", "Taylor", "Ahmadi", "Rossi", "Dubois", "Murphy", "Clark", "Lewis", "Young", "Walker", "Hall", "Tremblay", "Gagnon", "Roy", "Côté"];

export const MOCK_MERCHANT = {
  name: "Kits Pilates Studio", currency: "CAD", timezone: "America/Vancouver",
  address: "2190 W 4th Ave, Vancouver, BC V6K 1N7", phone: "(604) 555-0142", website: "https://kitspilates.example",
  booking_url: "https://kitspilates.example/book",
};

// Returns { customers, orders: [{id, customer_ext, at, amount_cents}], bookings: [{id, customer_ext, start_at, status}] }
export function mockData(now = Date.now(), seed = 42) {
  const r = rng(seed);
  const customers = [], orders = [], bookings = [];
  const N = 700;
  for (let i = 0; i < N; i++) {
    const fn = FIRST[Math.floor(r() * FIRST.length)], ln = LAST[Math.floor(r() * LAST.length)];
    const ext = `SQC${String(1000 + i)}`;
    const hasEmail = r() < 0.86;
    customers.push({
      ext_id: ext, first_name: fn, last_name: ln,
      email: hasEmail ? `${fn}.${ln}${i}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@example.com" : null,
      phone: r() < 0.7 ? `+1604555${String(1000 + i).slice(-4)}` : null,
      provider_unsub: r() < 0.04 ? 1 : 0,
    });
    // Customer type decides the visit pattern.
    const kind = r();
    const price = [2800, 3200, 3500, 4200, 15900, 18900][Math.floor(r() * 6)]; // drop-in, class pack, monthly
    let visits = [];
    if (kind < 0.30) { // one-timers (intro class), from 5 to 900 days ago
      visits = [Math.floor(5 + r() * 895)];
    } else {
      const cycle = [7, 7, 10, 14, 14, 21, 28, 30, 35][Math.floor(r() * 9)];
      const count = 3 + Math.floor(r() * 14);
      // where are they now? active / overdue / lost / ancient
      const state = r();
      const since = state < 0.45 ? Math.floor(r() * cycle * 1.2) : state < 0.72 ? Math.floor(cycle * (1.6 + r() * 2.2)) : state < 0.93 ? Math.floor(Math.max(180, cycle * 4) + r() * 300) : Math.floor(740 + r() * 200);
      let d = since;
      for (let k = 0; k < count; k++) { visits.push(d); d += Math.max(3, Math.round(cycle * (0.75 + r() * 0.5))); }
    }
    // Some customers already have their next appointment booked (mostly regulars on track, a few overdue ones).
    const lastAgo = Math.min(...visits);
    if (lastAgo < 400 && r() < (lastAgo < 30 ? 0.45 : 0.08)) bookings.push({ id: `SQB${i}`, customer_ext: ext, start_at: now + Math.floor(1 + r() * 12) * DAY + 10 * 3600000, status: "ACCEPTED" });
    visits.forEach((daysAgo, k) => {
      if (daysAgo > 1000) return;
      orders.push({ id: `SQO${i}_${k}`, customer_ext: ext, at: now - daysAgo * DAY - Math.floor(r() * 8) * 3600000, amount_cents: price });
    });
  }
  // Walk-ins with no customer attached (Square sales without a profile). These can't be contacted.
  for (let j = 0; j < 120; j++) orders.push({ id: `SQW${j}`, customer_ext: null, at: now - Math.floor(r() * 700) * DAY, amount_cents: 2800 });
  return { customers, orders, bookings };
}
