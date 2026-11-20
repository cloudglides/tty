import { error } from "../ansi";
import type { Command, PassthroughMode } from "../shell";

const PATH = "/api/btop";

function socketUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${PATH}`;
}

export const btopCommand: Command = {
  name: "btop",
  help: [["btop", "live system monitor (q or double-tap to quit)"]],
  run(_args, { shell }) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let active = false;
    let closing = false;
    let ready = false;

    let pending = "";
    let frame = 0;
    const flush = () => {
      if (!pending) return;
      const text = pending;
      pending = "";
      shell.write(text);
    };

    const leave = (message?: string) => {
      if (!active) return;
      active = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      flush();
      shell.exitPassthrough();
      if (message) shell.println(message);
    };

    let socket: WebSocket;
    const mode: PassthroughMode = {
      minCols: 80,
      onData(data) {
        if (closing || socket.readyState !== WebSocket.OPEN) return;
        if (data === "\x03") {
          closing = true;
          socket.close();
          leave();
          return;
        }
        socket.send(encoder.encode(data));
      },
      onResize(cols, rows) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ cols, rows }));
      },
      exit() {
        closing = true;
        socket.close();
      },
    };

    try {
      socket = new WebSocket(socketUrl());
    } catch {
      shell.println(error("could not open a btop connection"));
      return;
    }

    active = true;
    shell.enterPassthrough(mode);
    socket.binaryType = "arraybuffer";

    const timeout = setTimeout(() => {
      if (!ready) {
        closing = true;
        socket.close();
        leave(error("btop did not start in time"));
      }
    }, 10_000);

    socket.onopen = () => socket.send(JSON.stringify({ cols: shell.cols, rows: shell.rows }));
    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        let message: { type?: string; error?: string };
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === "error") {
          closing = true;
          socket.close();
          leave(error(message.error ?? "btop failed"));
        } else if (message.type === "ready") {
          ready = true;
        }
        return;
      }
      if (!ready) return;
      pending += decoder.decode(event.data, { stream: true });
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          flush();
        });
      }
    };
    socket.onerror = () => {
      if (!ready && !closing) {
        closing = true;
        leave(error("btop connection failed"));
      }
    };
    socket.onclose = () => {
      clearTimeout(timeout);
      leave();
    };
  },
};
