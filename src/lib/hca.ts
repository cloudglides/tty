// Hack Club Auth (https://auth.hackclub.com/docs) OAuth/OIDC client. Server-only.

export const HCA = "https://auth.hackclub.com";
// slack_id gates chat: no slack account, no chat
export const SCOPES = "openid profile slack_id";
export const STATE_COOKIE = "tty_oauth_state";

export function hcaConfig() {
  const clientId = process.env.HCA_CLIENT_ID;
  const clientSecret = process.env.HCA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("HCA_CLIENT_ID and HCA_CLIENT_SECRET must be set");
  return { clientId, clientSecret };
}

export function redirectUri(origin: string) {
  return `${process.env.APP_URL ?? origin}/api/auth/callback`;
}

export async function exchangeCode(code: string, redirect: string): Promise<string> {
  const { clientId, clientSecret } = hcaConfig();
  const res = await fetch(`${HCA}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token exchange returned no access token");
  return data.access_token;
}

export type UserInfo = { sub: string; slack_id?: string; nickname?: string; name?: string };

export async function userInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(`${HCA}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`userinfo failed (${res.status})`);
  return res.json();
}

export async function slackDisplayName(slackId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://cachet.dunkirk.sh/users/${encodeURIComponent(slackId)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string; realName?: string };
    return data.displayName || data.realName || null;
  } catch {
    return null;
  }
}
