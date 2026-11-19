import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { sameOrigin } from "./http.mjs";

const BTOP = fileURLToPath(new URL("../vendor/btop", import.meta.url));
export const BTOP_PATH = "/api/btop";
const MAX_SESSIONS = 8;
const MAX_COLS = 400;
const MAX_ROWS = 150;
const MAX_LIFETIME_MS = 15 * 60_000;

function size(value, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 20 && n <= max ? n : fallback;
}

function terminate(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export function createBtop() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  const sessions = new Map();

  function control(ws, data) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  }

  function spawnBtop(ws, cols, rows) {
    const config = path.join(tmpdir(), "tty-btop");
    mkdirSync(config, { recursive: true });
    const env = {
      ...process.env,
      HOME: tmpdir(),
      XDG_CONFIG_HOME: config,
      TERM: "xterm-256color",
      LANG: "C.UTF-8",
    };
    const command = `stty rows ${rows} cols ${cols}; exec ${JSON.stringify(BTOP)} --force-utf`;
    const child = spawn("script", ["-qfec", command, "/dev/null"], {
      env,
      stdio: ["pipe", "pipe", "ignore"],
      detached: true,
    });
    child.stdout.on("data", (chunk) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
    });
    child.on("error", (err) => {
      control(ws, { type: "error", error: `btop could not start: ${err.message}` });
      ws.close(1011, "btop could not start");
    });
    return child;
  }

  wss.on("connection", (ws) => {
    if (sessions.size >= MAX_SESSIONS) {
      control(ws, { type: "error", error: "too many btop sessions, try again later" });
      return ws.close(4003, "busy");
    }

    const id = randomUUID();
    const session = { ws, child: null, cols: 0, rows: 0, timer: null };
    sessions.set(id, session);

    const stop = () => {
      terminate(session.child);
      session.child = null;
      clearTimeout(session.timer);
      sessions.delete(id);
    };

    const run = (cols, rows) => {
      terminate(session.child);
      session.cols = cols;
      session.rows = rows;
      const child = spawnBtop(ws, cols, rows);
      session.child = child;
      child.on("exit", (code) => {
        if (session.child !== child) return;
        session.child = null;
        if (code) control(ws, { type: "error", error: `btop exited with status ${code}` });
        if (ws.readyState === ws.OPEN) ws.close(1000, "btop exited");
      });
    };

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        if (session.child?.stdin.writable) session.child.stdin.write(data);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!msg || msg.cols == null || msg.rows == null) return;
      const cols = size(msg.cols, MAX_COLS, 100);
      const rows = size(msg.rows, MAX_ROWS, 30);
      if (session.child && cols === session.cols && rows === session.rows) return;
      const first = !session.child;
      run(cols, rows);
      if (first) control(ws, { type: "ready" });
    });

    ws.on("close", stop);
    ws.on("error", stop);
    session.timer = setTimeout(() => ws.close(1000, "session timed out"), MAX_LIFETIME_MS);
    session.timer.unref();
  });

  return {
    path: BTOP_PATH,
    handleUpgrade(req, socket, head) {
      try {
        if (!sameOrigin(req)) {
          socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
      } catch (err) {
        console.error("btop: upgrade failed:", err);
        socket.destroy();
      }
    },
  };
}
