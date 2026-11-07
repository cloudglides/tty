import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { authPage } from "@/lib/auth-page";
import { sanitize } from "@/lib/chat-types";
import { STATE_COOKIE, exchangeCode, redirectUri, slackDisplayName, userInfo } from "@/lib/hca";
import { setSession } from "@/lib/session";

const MAX_NAME = 32;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return page("login cancelled", "you can close this window and try again.", false);

  const state = params.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  if (!state || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
    return page("login expired", "run `hc auth login` again from the terminal.", false);
  }

  const code = params.get("code");
  if (!code) return page("login failed", "no authorization code was returned.", false);

  try {
    const info = await userInfo(await exchangeCode(code, redirectUri(request.nextUrl.origin)));
    if (!info.slack_id) {
      return page(
        "no Slack account linked",
        "chat is for Hack Club Slack members. Link Slack to your Hack Club Auth account, then try again.",
        false,
      );
    }

    const raw = (await slackDisplayName(info.slack_id)) ?? info.nickname ?? info.name ?? info.slack_id;
    const name = sanitize(raw).slice(0, MAX_NAME) || info.slack_id;

    const res = page(`logged in as ${name}`, "you can close this window and go back to the terminal.", true);
    setSession(res, { sub: info.sub, slackId: info.slack_id, name });
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("hca callback failed", err);
    return page("login failed", "something went wrong talking to Hack Club Auth. try again.", false, 502);
  }
}

function page(title: string, detail: string, ok: boolean, status = ok ? 200 : 400) {
  return new NextResponse(authPage(title, detail, ok), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
