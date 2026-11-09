import test from "node:test";
import assert from "node:assert/strict";
import { importKit } from "../src/importer.js";

const kit = importKit();
const NOW = Date.UTC(2026, 10, 9, 12);

test("visit-style export with a title line, quotes, cancelled rows and refunds", () => {
  const csv = [
    "Client Visits Report,,,,,",
    "Date Range: 11/1/2025 - 11/8/2026,,,,,",
    "Client,Email,Mobile Phone,Visit Date,Class,Pricing Option,Status,Amount",
    '"Nguyen, Sara",sara@example.com,(604) 555-0101,10/02/2026 9:00 AM,Lagree Core,Intro Offer - 3 Classes,Completed,$59.00',
    '"Nguyen, Sara",sara@example.com,(604) 555-0101,10/09/2026 9:00 AM,Lagree Core,Intro Offer - 3 Classes,Completed,$0.00',
    '"Patel, Maya",maya@example.com,604-555-0102,09/15/2026 6:30 PM,Lagree Core,Monthly Unlimited,Completed,"$1,189.00"',
    '"Patel, Maya",maya@example.com,604-555-0102,09/22/2026 6:30 PM,Lagree Core,Monthly Unlimited,Late Cancel,$0.00',
    '"Chen, Ben",,,08/30/2026,Lagree Core,Drop-in,Completed,($35.00)',
    "Totals,,,,,,",
  ].join("\r\n");
  const { headers, rows } = kit.parseCSV(csv);
  assert.equal(headers[0], "Client");
  assert.equal(rows.length, 5);
  const map = kit.detect(headers, rows);
  assert.equal(headers[map.full_name], "Client");
  assert.equal(headers[map.email], "Email");
  assert.equal(headers[map.phone], "Mobile Phone");
  assert.equal(headers[map.date], "Visit Date");
  assert.equal(headers[map.item], "Pricing Option");
  assert.equal(headers[map.status], "Status");
  assert.equal(headers[map.amount], "Amount");
  const n = kit.normalize(headers, rows, map, NOW);
  assert.equal(n.shape, "visits");
  assert.equal(n.customers.length, 3);
  const sara = n.customers.find((c) => c.e === "sara@example.com");
  assert.equal(sara.f, "Sara"); assert.equal(sara.l, "Nguyen"); assert.equal(sara.p, "+16045550101");
  assert.equal(n.visits.length, 3); // late cancel and refund skipped
  assert.equal(n.skipped, 2);
  const maya = n.visits.find((v) => v.k === "e:maya@example.com");
  assert.equal(maya.c, 118900);
  assert.equal(new Date(maya.a).toISOString().slice(0, 16), "2026-09-15T18:30");
  const s = kit.summary(n);
  assert.equal(s.intro, 1);
});

test("customer-list export (one row per customer) becomes spread-out visits", () => {
  const csv = [
    "First Name;Last Name;E-mail Address;Client Since;Last Visit Date;Total Visits;Lifetime Value;Email Opt In",
    "Ava;Smith;ava@example.com;14/01/2026;28/10/2026;10;1.250,00 €;Yes",
    "Noor;Ahmadi;noor@example.com;02/03/2025;02/03/2025;1;35,00 €;No",
  ].join("\n");
  const { headers, rows } = kit.parseCSV(csv);
  const map = kit.detect(headers, rows);
  assert.equal(headers[map.email], "E-mail Address");
  assert.equal(headers[map.first_visit], "Client Since");
  assert.equal(headers[map.last_visit], "Last Visit Date");
  assert.equal(headers[map.visit_count], "Total Visits");
  assert.equal(headers[map.total_spent], "Lifetime Value");
  assert.equal(headers[map.marketing], "Email Opt In");
  const n = kit.normalize(headers, rows, map, NOW);
  assert.equal(n.shape, "customers");
  const ava = n.visits.filter((v) => v.k === "e:ava@example.com").sort((a, b) => a.a - b.a);
  assert.equal(ava.length, 10);
  assert.equal(new Date(ava[0].a).toISOString().slice(0, 10), "2026-01-14");
  assert.equal(new Date(ava[9].a).toISOString().slice(0, 10), "2026-10-28");
  assert.equal(ava[0].c, 12500);
  assert.equal(n.customers.find((c) => c.k === "e:noor@example.com").u, 1);
});

test("dates in many formats", () => {
  const d = (s, o) => new Date(kit.parseDate(s, o)).toISOString().slice(0, 10);
  assert.equal(d("2026-11-03"), "2026-11-03");
  assert.equal(d("2026-11-03T18:00:00Z"), "2026-11-03");
  assert.equal(d("Nov 3, 2026"), "2026-11-03");
  assert.equal(d("Tue, November 3rd, 2026"), "2026-11-03");
  assert.equal(d("3 Nov 2026"), "2026-11-03");
  assert.equal(d("03/11/2026", "dmy"), "2026-11-03");
  assert.equal(d("11/03/26"), "2026-11-03");
  assert.equal(kit.parseDate("not a date"), null);
  assert.equal(kit.parseMoney("CA$1,234.50"), 123450);
  assert.equal(kit.parseMoney("-12.00"), -1200);
});

test("same file twice gives the same row ids", () => {
  const csv = "Name,Email,Date,Total\nSam Lee,sam@example.com,2026-10-01,32\n";
  const a = kit.normalize(...(() => { const p = kit.parseCSV(csv); return [p.headers, p.rows, kit.detect(p.headers, p.rows), NOW]; })());
  const b = kit.normalize(...(() => { const p = kit.parseCSV(csv); return [p.headers, p.rows, kit.detect(p.headers, p.rows), NOW]; })());
  assert.equal(a.visits[0].i, b.visits[0].i);
  assert.equal(a.customers[0].f, "Sam");
});

test("the kit survives being serialised into a page", () => {
  const k2 = new Function(`return (${importKit.toString()})()`)();
  assert.equal(typeof k2.normalize, "function");
});
