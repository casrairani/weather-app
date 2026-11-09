// Small shared helpers: HTML escaping, responses, cookies, crypto, time.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const DAY = 86400000;

export function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin", ...headers } });
}
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}
export function redirect(to, headers = {}) {
  return new Response(null, { status: 302, headers: { location: to, ...headers } });
}

export function cookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
export const setCookie = (name, value, maxAge, secure = true, path = "/") =>
  `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(t) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmac(secret, msg, len = 32) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return [...sig].slice(0, len).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Square tokens are stored encrypted (AES-GCM). TOKEN_KEY is any long random string kept as a secret.
async function aesKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.TOKEN_KEY || "rebooked-dev-only-key"));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function encrypt(env, text) {
  if (text == null) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), new TextEncoder().encode(text)));
  return b64(iv) + "." + b64(ct);
}
export async function decrypt(env, blob) {
  if (!blob) return null;
  const [iv, ct] = blob.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(env), unb64(ct));
  return new TextDecoder().decode(pt);
}

// Deterministic 0..99 bucket, used for the 10% holdout group.
export async function bucket(seed) {
  const h = await sha256(seed);
  return parseInt(h.slice(0, 8), 16) % 100;
}

export const money = (cents, cur = "CAD") => {
  const v = (cents || 0) / 100;
  const d = v >= 1000 || (cents || 0) % 100 === 0 ? 0 : 2; // $2,258 · $140 · $19.08
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

// Local hour/weekday in a business time zone (falls back to Vancouver).
export function localParts(ts, tz = "America/Vancouver") {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", hour12: false, weekday: "short" });
  const parts = Object.fromEntries(f.formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour) % 24, weekday: parts.weekday };
}
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim());
export const ago = (ts, now = Date.now()) => {
  const d = Math.round((now - ts) / DAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 730) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} years ago`;
};
