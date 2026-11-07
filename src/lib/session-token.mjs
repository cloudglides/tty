import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tty_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return s;
}

const mac = (data) => createHmac("sha256", sessionSecret()).update(data).digest("base64url");

export function signSession(user) {
  const payload = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${mac(data)}`;
}

export function verifySession(token) {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(mac(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString());
    if (typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    return { sub: p.sub, slackId: p.slackId, name: p.name };
  } catch {
    return null;
  }
}
