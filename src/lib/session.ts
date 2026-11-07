import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export type SessionUser = { sub: string; slackId: string; name: string };
type Payload = SessionUser & { exp: number };

const COOKIE = "tty_session";
const MAX_AGE_S = 30 * 24 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return s;
}

const mac = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

function sign(user: SessionUser) {
  const payload: Payload = { ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${mac(data)}`;
}

function verify(token: string): SessionUser | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(mac(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as Payload;
    if (p.exp < Date.now() / 1000) return null;
    return { sub: p.sub, slackId: p.slackId, name: p.name };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? verify(token) : null;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setSession(res: NextResponse, user: SessionUser) {
  res.cookies.set(COOKIE, sign(user), { ...cookieOptions, maxAge: MAX_AGE_S });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
