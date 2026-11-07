import WebSocket from "ws";

const PROFILE_TTL_MS = 60 * 60 * 1000;
const MAX_PROFILES = 2000;
const MAX_MENTIONS = 10;
const SLACK_USER_ID = /^[UW][A-Z0-9]{2,20}$/;
const MAX_TEXT = 1000;
const profiles = new Map();

export async function slackProfile(slackId) {
  if (!SLACK_USER_ID.test(slackId)) return { name: null, imageUrl: null };
  const hit = profiles.get(slackId);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile;
  let profile = { name: null, imageUrl: null };
  try {
    const res = await fetch(`https://cachet.dunkirk.sh/users/${encodeURIComponent(slackId)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = await res.json();
      profile = { name: data.displayName || data.realName || null, imageUrl: data.imageUrl || null };
    }
  } catch {}
  profiles.delete(slackId);
  profiles.set(slackId, { at: Date.now(), profile });
  while (profiles.size > MAX_PROFILES) profiles.delete(profiles.keys().next().value);
  return profile;
}

const escapeForSlack = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function fromSlackMarkup(raw) {
  const text = raw.slice(0, MAX_TEXT * 2);
  const parts = [];
  let last = 0;
  let lookups = 0;
  for (const m of text.matchAll(/<([^>]*)>/g)) {
    parts.push(text.slice(last, m.index));
    last = m.index + m[0].length;
    const [target, label] = m[1].split("|", 2);
    if (target.startsWith("@")) {
      const id = target.slice(1);
      const name = label || (lookups++ < MAX_MENTIONS ? (await slackProfile(id)).name : null);
      parts.push(`@${name || "someone"}`);
    }
    else if (target.startsWith("#")) parts.push(`#${label || "channel"}`);
    else if (target.startsWith("!")) parts.push(`@${label?.replace(/^@/, "") || target.slice(1).split("^")[0]}`);
    else parts.push(label && label !== target ? `${label} (${target})` : target);
  }
  parts.push(text.slice(last));
  return parts.join("").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

async function api(method, token, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.error}`);
  return data;
}

export function createSlackBridge({ onSlackMessage }) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!botToken || !channel) return { post() {} };

  async function post(user, text) {
    try {
      const profile = await slackProfile(user.slackId);
      await api("chat.postMessage", botToken, {
        channel,
        text: escapeForSlack(text),
        username: user.name,
        icon_url: profile.imageUrl ?? undefined,
        unfurl_links: false,
        unfurl_media: false,
      });
    } catch (err) {
      console.error("slack bridge: post failed:", err.message);
    }
  }

  async function handleEvent(event) {
    if (event?.type !== "message" || event.channel !== channel) return;
    if (event.bot_id || event.app_id) return;
    if (event.subtype && event.subtype !== "file_share" && event.subtype !== "thread_broadcast") return;
    if (event.thread_ts && event.thread_ts !== event.ts && event.subtype !== "thread_broadcast") return;
    if (!event.user) return;

    let text = await fromSlackMarkup(event.text ?? "");
    if (event.files?.length) text = `${text} [${event.files.length === 1 ? "file" : `${event.files.length} files`}]`.trim();
    if (!text) return;
    const profile = await slackProfile(event.user);
    onSlackMessage({
      id: event.user,
      nick: profile.name || "someone on slack",
      text: text.slice(0, MAX_TEXT),
      ts: Math.round(Number(event.ts) * 1000) || Date.now(),
    });
  }

  let retry = 1000;
  async function connect() {
    let url;
    try {
      url = (await api("apps.connections.open", appToken)).url;
    } catch (err) {
      console.error("slack bridge: connect failed:", err.message);
      return setTimeout(connect, (retry = Math.min(retry * 2, 60_000))).unref();
    }
    const ws = new WebSocket(url);
    ws.on("open", () => {
      retry = 1000;
      console.log("slack bridge: connected");
    });
    ws.on("message", (data) => {
      let envelope;
      try {
        envelope = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (envelope.envelope_id) ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
      if (envelope.type === "disconnect") return ws.close();
      if (envelope.type === "events_api") {
        handleEvent(envelope.payload?.event).catch((err) => console.error("slack bridge: event failed:", err.message));
      }
    });
    ws.on("close", () => setTimeout(connect, retry).unref());
    ws.on("error", (err) => console.error("slack bridge: socket error:", err.message));
  }

  if (appToken) connect();
  else console.log("slack bridge: SLACK_APP_TOKEN not set, only posting web messages to slack");

  return { post };
}
