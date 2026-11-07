import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { authPage } from "@/lib/auth-page";
import { HCA, SCOPES, STATE_COOKIE, hcaConfig, redirectUri } from "@/lib/hca";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  let clientId: string;
  try {
    clientId = hcaConfig().clientId;
  } catch (err) {
    return html(authPage("login isn't set up on this server", (err as Error).message, false), 500);
  }

  const state = randomBytes(16).toString("base64url");
  const url = new URL(`${HCA}/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri(request.nextUrl.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);

  const email = request.nextUrl.searchParams.get("email")?.trim();
  if (email && EMAIL_RE.test(email)) {
    url.searchParams.set("email", email);
    url.searchParams.set("login_hint", email);
  }

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}

function html(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
