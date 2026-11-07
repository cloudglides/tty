import type { ChatEvent } from "./chat-types";

const RECONNECT_MS = 2000;

type Handlers = {
  onEvent(event: ChatEvent, reconnected: boolean): void;
  onStatus(message: string): void;
  onFatal(message: string): void;
};

export class ChatClient {
  private source: EventSource | null = null;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private handlers: Handlers) {
    this.connect(false);
  }

  private connect(reconnecting: boolean) {
    const source = new EventSource("/api/chat");
    this.source = source;

    source.onmessage = (m) => this.handlers.onEvent(JSON.parse(m.data) as ChatEvent, reconnecting);
    source.addEventListener("refused", (m) => this.fatal((JSON.parse((m as MessageEvent).data) as { error: string }).error));
    source.onerror = async () => {
      source.close();
      if (this.closed) return;
      const me = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
      if (this.closed) return;
      if (me?.status === 401) return this.fatal("you were logged out, run hc auth login");
      this.handlers.onStatus("connection lost, reconnecting…");
      this.retryTimer = setTimeout(() => this.connect(true), RECONNECT_MS);
    };
  }

  async send(text: string): Promise<{ error?: string }> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.source?.close();
  }

  private fatal(message: string) {
    this.close();
    this.handlers.onFatal(message);
  }
}
