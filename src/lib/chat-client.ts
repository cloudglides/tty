import { CHAT_PATH, CLOSE_REFUSED, CLOSE_UNAUTHORIZED, type ChatEvent } from "./chat-types";

const RECONNECT_MS = 2000;

type Handlers = {
  onEvent(event: ChatEvent, reconnected: boolean): void;
  onStatus(message: string): void;
  onFatal(message: string): void;
};

export class ChatClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private handlers: Handlers) {
    this.connect(false);
  }

  private connect(reconnecting: boolean) {
    const url = new URL(CHAT_PATH, location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onmessage = (m) => this.handlers.onEvent(JSON.parse(m.data) as ChatEvent, reconnecting);
    ws.onclose = (e) => {
      if (this.closed) return;
      if (e.code === CLOSE_UNAUTHORIZED) return this.fatal("you were logged out, run hc auth login");
      if (e.code === CLOSE_REFUSED) return this.fatal(e.reason || "the chat refused the connection");
      this.handlers.onStatus("connection lost, reconnecting...");
      this.retryTimer = setTimeout(() => this.connect(true), RECONNECT_MS);
    };
  }

  send(text: string): string | null {
    if (this.ws?.readyState !== WebSocket.OPEN) return "not connected yet, try again in a moment";
    this.ws.send(JSON.stringify({ type: "say", text }));
    return null;
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
  }

  private fatal(message: string) {
    this.close();
    this.handlers.onFatal(message);
  }
}
