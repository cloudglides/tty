export const HCA = "https://auth.hackclub.com";
export const SCOPES = "openid profile slack_id";
export const STATE_COOKIE = "tty_oauth_state";

export function hcaConfig() {
  const clientId = process.env.HCA_CLIENT_ID;
  const clientSecret = process.env.HCA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("HCA_CLIENT_ID and HCA_CLIENT_SECRET must be set");
  return { clientId, clientSecret };
}

export function redirectUri(origin) {
  return `${process.env.APP_URL ?? origin}/api/auth/callback`;
}

export async function exchangeCode(code, redirect) {
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
  const data = await res.json();
  if (!data.access_token) throw new Error("token exchange returned no access token");
  return data.access_token;
}

export async function userInfo(accessToken) {
  const res = await fetch(`${HCA}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`userinfo failed (${res.status})`);
  return res.json();
}

export async function slackDisplayName(slackId) {
  try {
    const res = await fetch(`https://cachet.dunkirk.sh/users/${encodeURIComponent(slackId)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.displayName || data.realName || null;
  } catch {
    return null;
  }
}
