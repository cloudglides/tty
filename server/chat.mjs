import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { CHAT_PATH, MAX_MESSAGE_LENGTH, sanitize } from "../src/lib/chat-shared.mjs";
import { SESSION_COOKIE, verifySession } from "../src/lib/session-token.mjs";
import { createSlackBridge } from "./slack.mjs";

const MAX_CONNECTIONS = 500;
const MAX_TABS_PER_USER = 5;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 8;
const HEARTBEAT_MS = 25_000;
const CLOSE_UNAUTHORIZED = 4001;
const CLOSE_REFUSED = 4003;

function cookie(header, name) {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const { host } = new URL(origin);
    const allowed = [req.headers.host, process.env.APP_URL && new URL(process.env.APP_URL).host];
    return allowed.includes(host);
  } catch {
    return false;
  }
}

export function createChat() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const connections = new Map();
  const sent = new Map();

  const send = (ws, event) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  };
  const broadcast = (event) => {
    for (const c of connections.values()) send(c.ws, event);
  };
  const tabsOf = (slackId) => [...connections.values()].filter((c) => c.user.slackId === slackId);
  const slack =
    process.env.SLACK_SYNC === "on"
      ? createSlackBridge({ onSlackMessage: (msg) => broadcast({ type: "msg", source: "slack", ...msg }) })
      : { post() {} };
  const identity = (user) => ({ id: user.slackId, nick: user.name });
  const online = () => [...new Map([...connections.values()].map((c) => [c.user.slackId, identity(c.user)])).values()];

  function say(conn, raw) {
    const text = sanitize(typeof raw === "string" ? raw : "");
    if (!text) return "empty message";
    if (text.length > MAX_MESSAGE_LENGTH) return `message too long (max ${MAX_MESSAGE_LENGTH} chars)`;
    const now = Date.now();
    const recent = (sent.get(conn.user.slackId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX) return "slow down a little";
    recent.push(now);
    sent.set(conn.user.slackId, recent);
    broadcast({ type: "msg", ...identity(conn.user), text, ts: now });
    slack.post(conn.user, text);
    return null;
  }

  wss.on("connection", (ws, user) => {
    if (connections.size >= MAX_CONNECTIONS) return ws.close(CLOSE_REFUSED, "the lobby is full, try again later");
    const tabs = tabsOf(user.slackId);
    if (tabs.length >= MAX_TABS_PER_USER) return ws.close(CLOSE_REFUSED, "you have too many chat tabs open");

    const conn = { id: randomUUID(), ws, user, alive: true };
    if (tabs.length === 0) broadcast({ type: "join", ...identity(user) });
    connections.set(conn.id, conn);
    send(ws, { type: "welcome", ...identity(user), online: online() });

    ws.on("pong", () => (conn.alive = true));
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return send(ws, { type: "error", error: "invalid message" });
      }
      if (msg?.type !== "say") return send(ws, { type: "error", error: "unknown message type" });
      const error = say(conn, msg.text);
      if (error) send(ws, { type: "error", error });
    });
    ws.on("close", () => {
      connections.delete(conn.id);
      if (tabsOf(user.slackId).length === 0) {
        broadcast({ type: "leave", ...identity(user) });
      }
    });
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [slackId, times] of sent) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) sent.delete(slackId);
    }
    for (const c of connections.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    path: CHAT_PATH,
    handleUpgrade(req, socket, head) {
      try {
        upgrade(req, socket, head);
      } catch (err) {
        console.error("chat: upgrade failed:", err);
        socket.destroy();
      }
    },
  };

  function upgrade(req, socket, head) {
    const reject = (code, reason) =>
      wss.handleUpgrade(req, socket, head, (ws) => ws.close(code, reason));
    if (!sameOrigin(req)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const token = cookie(req.headers.cookie, SESSION_COOKIE);
    const user = token ? verifySession(token) : null;
    if (!user) return reject(CLOSE_UNAUTHORIZED, "not logged in");
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, user));
  }
}
