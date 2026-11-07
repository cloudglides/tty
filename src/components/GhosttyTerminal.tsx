"use client";

import { useEffect, useRef, useState } from "react";
import { authCommand } from "@/lib/features/auth";
import { chatCommand } from "@/lib/features/chat";
import { prizesCommand } from "@/lib/features/prizes";
import { rsvpCommand } from "@/lib/features/rsvp";
import { Shell } from "@/lib/shell";
import { FONT_FAMILY, FONT_SIZE, MELLOW } from "@/lib/terminal-theme";

function makeBackgroundTransparent(container: HTMLElement) {
  const canvas = container.querySelector("canvas");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const fillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = (x, y, w, h) =>
    ctx.fillStyle === MELLOW.background ? ctx.clearRect(x, y, w, h) : fillRect(x, y, w, h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export default function GhosttyTerminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        const { init, Terminal, FitAddon } = await import("ghostty-web");
        await init();
        await Promise.allSettled([
          document.fonts.load(`400 ${FONT_SIZE}px ${FONT_FAMILY}`),
          document.fonts.load(`700 ${FONT_SIZE}px ${FONT_FAMILY}`),
        ]);
        if (disposed || !containerRef.current) return;

        const term = new Terminal({
          fontSize: FONT_SIZE,
          fontFamily: FONT_FAMILY,
          cursorStyle: "underline",
          cursorBlink: true,
          theme: MELLOW,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current);
        makeBackgroundTransparent(containerRef.current);
        fit.fit();
        fit.observeResize();

        const shell = new Shell({
          write: (data) => term.write(data),
          clear: () => term.clear(),
          get cols() {
            return term.cols;
          },
        });
        shell.register(authCommand);
        shell.register(chatCommand);
        shell.register(prizesCommand);
        shell.register(rsvpCommand);
        shell.alias("login", ["auth", "login"]);
        shell.alias("logout", ["auth", "logout"]);
        shell.alias("whoami", ["auth", "status"]);

        const sub = term.onData((data: string) => shell.handleInput(data));
        shell.start();

        term.focus();
        setStatus("ready");
        cleanup = () => {
          sub.dispose();
          shell.dispose();
          fit.dispose();
          term.dispose();
        };
      } catch (err) {
        console.error("failed to start libghostty", err);
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center font-mono text-sm text-zinc-400">
          failed to load terminal — check the console
        </div>
      )}
      <div ref={containerRef} className="h-full w-full caret-transparent outline-none" />
    </div>
  );
}
