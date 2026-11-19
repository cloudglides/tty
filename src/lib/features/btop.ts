import { error } from "../ansi";
import type { Command, PassthroughMode } from "../shell";

const PATH = "/api/btop";

function socketUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${PATH}`;
}

export const btopCommand: Command = {
  name: "btop",
  help: [["btop", "live system monitor (q to quit)"]],
  run(_args, { shell }) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let active = false;
    let closing = false;
    let ready = false;

    const leave = (message?: string) => {
      if (!active) return;
      active = false;
      shell.exitPassthrough();
      if (message) shell.println(message);
    };

    let socket: WebSocket;
    const mode: PassthroughMode = {
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
      if (ready) shell.write(decoder.decode(event.data, { stream: true }));
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
