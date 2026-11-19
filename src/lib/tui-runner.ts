import { error } from "./ansi";
import type { Command, PassthroughMode } from "./shell";
import type { TuiEntry } from "../client/tui-registry.generated";

const WORKER_URL = "/workers/tui-host.js";

type WorkerEvent =
  | { type: "ready"; cols: number; rows: number }
  | { type: "out"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; error: string };

export function wasmTuiCommand(tui: TuiEntry): Command {
  return {
    name: tui.name,
    help: [[tui.name, tui.summary]],
    run(_args, { shell }) {
      let worker: Worker;
      let active = false;
      let closing = false;
      let ready = false;

      const leave = (message?: string) => {
        if (!active) return;
        active = false;
        worker.terminate();
        shell.exitPassthrough();
        if (message) shell.println(message);
      };

      const mode: PassthroughMode = {
        onData(data) {
          if (closing || !ready) return;
          if (data === "\x03") {
            closing = true;
            leave();
            return;
          }
          worker.postMessage({ type: "key", data });
        },
        onResize(cols, rows) {
          if (!closing) worker.postMessage({ type: "resize", cols, rows });
        },
        exit() {
          closing = true;
          worker.terminate();
        },
      };

      try {
        worker = new Worker(WORKER_URL, { type: "module" });
      } catch {
        shell.println(error("could not start the tui sandbox"));
        return;
      }

      active = true;
      shell.enterPassthrough(mode);

      const timeout = setTimeout(() => {
        if (!ready) {
          closing = true;
          leave(error("tui did not start in time"));
        }
      }, 10_000);

      worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
        const message = event.data;
        if (message.type === "ready") {
          ready = true;
          clearTimeout(timeout);
        } else if (message.type === "out") {
          shell.write(message.data);
        } else if (message.type === "exit") {
          clearTimeout(timeout);
          if (message.code !== 0) leave(error(`tui exited with code ${message.code}`));
          else leave();
        } else if (message.type === "error") {
          clearTimeout(timeout);
          leave(error(message.error));
        }
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        leave(error("tui sandbox crashed"));
      };

      worker.postMessage({ type: "start", url: tui.url, cols: shell.cols, rows: shell.rows });
    },
  };
}
