import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, signSession, verifySession } from "./session-token.mjs";

export type SessionUser = { sub: string; slackId: string; name: string };

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setSession(res: NextResponse, user: SessionUser) {
  res.cookies.set(SESSION_COOKIE, signSession(user), { ...cookieOptions, maxAge: SESSION_MAX_AGE_S });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
