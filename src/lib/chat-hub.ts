// in-memory: each server process gets its own room, so run a single instance
import { type ChatEvent, type ChatMessage, MAX_MESSAGE_LENGTH, sanitize } from "./chat-types";
import type { SessionUser } from "./session";

type Connection = { id: string; user: SessionUser; send: (e: ChatEvent) => void };

const HISTORY_SIZE = 50;
const MAX_CONNECTIONS = 500;
const MAX_TABS_PER_USER = 5;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 8;

class ChatHub {
  private connections = new Map<string, Connection>();
  private history: ChatMessage[] = [];
  private sent = new Map<string, number[]>();

  join(user: SessionUser, send: (e: ChatEvent) => void): Connection | string {
    if (this.connections.size >= MAX_CONNECTIONS) return "the lobby is full, try again later";
    const tabs = this.connectionsOf(user.slackId);
    if (tabs.length >= MAX_TABS_PER_USER) return "you have too many chat tabs open";

    const conn: Connection = { id: crypto.randomUUID(), user, send };
    if (tabs.length === 0) this.broadcast({ type: "join", nick: user.name });
    this.connections.set(conn.id, conn);
    conn.send({ type: "welcome", nick: user.name, online: this.online(), history: this.history });
    return conn;
  }

  leave(id: string) {
    const conn = this.connections.get(id);
    if (!conn) return;
    this.connections.delete(id);
    if (this.connectionsOf(conn.user.slackId).length === 0) {
      this.broadcast({ type: "leave", nick: conn.user.name });
    }
  }

  say(user: SessionUser, raw: string): string | null {
    if (this.connectionsOf(user.slackId).length === 0) return "join the chat first";
    const text = sanitize(raw);
    if (!text) return "empty message";
    if (text.length > MAX_MESSAGE_LENGTH) return `message too long (max ${MAX_MESSAGE_LENGTH} chars)`;

    const now = Date.now();
    const recent = (this.sent.get(user.slackId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX) return "slow down a little";
    recent.push(now);
    this.sent.set(user.slackId, recent);

    const msg: ChatMessage = { nick: user.name, text, ts: now };
    this.history.push(msg);
    if (this.history.length > HISTORY_SIZE) this.history.shift();
    this.broadcast({ type: "msg", ...msg });
    return null;
  }

  private connectionsOf(slackId: string) {
    return [...this.connections.values()].filter((c) => c.user.slackId === slackId);
  }

  private online() {
    const bySlackId = new Map<string, string>();
    for (const c of this.connections.values()) bySlackId.set(c.user.slackId, c.user.name);
    return [...bySlackId.values()];
  }

  private broadcast(event: ChatEvent) {
    for (const conn of this.connections.values()) {
      try {
        conn.send(event);
      } catch {
        // stream already closed; its abort handler removes it
      }
    }
  }
}

// survives dev hot reloads; bump the key when the class shape changes
const g = globalThis as typeof globalThis & { __ttyChatHubV2?: ChatHub };
export const chatHub = (g.__ttyChatHubV2 ??= new ChatHub());
