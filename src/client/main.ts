import { btopCommand } from "../lib/features/btop";
import { lazyCommand } from "../lib/lazy-command";
import { Shell } from "../lib/shell";
import { attachSoftKeyboard } from "../lib/soft-keyboard";
import { attachTouchScroll } from "../lib/touch-scroll";
import { attachPassthroughExit } from "../lib/touch-exit";
import { FONT_FAMILY, FONT_SIZE, MELLOW } from "../lib/terminal-theme";
import { TUIS } from "./tui-registry.generated";

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

function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  let last = 0;
  const update = () => {
    if (Math.abs(vv.scale - 1) > 0.01) return;
    const height = Math.round(vv.height);
    if (Math.abs(height - last) < 40) return;
    last = height;
    root.style.setProperty("--app-height", `${height}px`);
    window.scrollTo(0, 0);
  };
  vv.addEventListener("resize", update);
  update();
  return () => {
    vv.removeEventListener("resize", update);
    root.style.removeProperty("--app-height");
  };
}

async function boot() {
  const container = document.getElementById("term") as HTMLElement;
  const error = document.getElementById("term-error") as HTMLElement;

  try {
    const fontsReady = Promise.allSettled([
      document.fonts.load(`400 ${FONT_SIZE}px ${FONT_FAMILY}`),
      document.fonts.load(`700 ${FONT_SIZE}px ${FONT_FAMILY}`),
    ]);
    const { init, Terminal, FitAddon } = await import("ghostty-web");
    await init();
    await fontsReady;

    const term = new Terminal({
      fontSize: FONT_SIZE,
      fontFamily: FONT_FAMILY,
      cursorStyle: "underline",
      cursorBlink: true,
      theme: MELLOW,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    makeBackgroundTransparent(container);
    const renderer = (term as unknown as { renderer?: { devicePixelRatio?: number } }).renderer;
    if (renderer && (renderer.devicePixelRatio ?? 1) > 2) renderer.devicePixelRatio = 2;
    fit.fit();
    fit.observeResize();

    let compact = false;
    const setCompact = (on: boolean) => {
      if (compact === on) return;
      compact = on;
      let size = on ? Math.max(5, Math.min(FONT_SIZE, container.clientWidth / 80 / 0.72)) : FONT_SIZE;
      term.options.fontSize = size;
      fit.fit();
      for (let i = 0; i < 4 && on && term.cols < 80; i++) {
        size = Math.max(5, size * (term.cols / 80) * 0.97);
        term.options.fontSize = size;
        fit.fit();
      }
    };

    const shell = new Shell({
      write: (data) => term.write(data),
      clear: () => term.clear(),
      setCompact,
      get cols() {
        return term.cols;
      },
      get rows() {
        return term.rows;
      },
    });
    shell.register(
      lazyCommand(
        "auth",
        [
          ["hc auth login", "log in with Hack Club Auth"],
          ["hc auth status", "who you're logged in as"],
          ["hc auth logout", "log out"],
        ],
        async () => (await import("../lib/features/auth")).authCommand,
      ),
    );
    shell.register(btopCommand);
    shell.register(
      lazyCommand("chat", [["hc chat", "talk with everyone here (needs login)"]], async () => (await import("../lib/features/chat")).chatCommand),
    );
    shell.register(
      lazyCommand("prizes", [["hc prizes [n]", "browse the prizes"]], async () => (await import("../lib/features/prizes")).prizesCommand),
    );
    shell.register(
      lazyCommand("rsvp", [["hc rsvp", "RSVP and join #tty on Slack (needs login)"]], async () => (await import("../lib/features/rsvp")).rsvpCommand),
    );
    shell.register(
      lazyCommand("guide", [["hc guide [name]", "open the guides in your browser"]], async () => (await import("../lib/features/guide")).guideCommand),
    );
    for (const tui of TUIS) {
      shell.register(
        lazyCommand(tui.name, [[tui.name, tui.summary]], async () => (await import("../lib/tui-runner")).wasmTuiCommand(tui)),
      );
    }
    shell.alias("login", ["auth", "login"]);
    shell.alias("logout", ["auth", "logout"]);
    shell.alias("whoami", ["auth", "status"]);
    shell.alias("guides", ["guide"]);

    const sub = term.onData((data: string) => shell.handleInput(data));
    const resize = term.onResize(({ cols, rows }) => shell.resize(cols, rows));
    const detachKeyboard = term.textarea ? attachSoftKeyboard(term.textarea, (data) => shell.handleInput(data)) : () => {};
    const detachTouchScroll = attachTouchScroll(term, () => !shell.inPassthrough);
    const detachExit = attachPassthroughExit(term.element ?? undefined, shell);
    const detachViewport = trackVisualViewport();
    shell.start();
    term.focus();

    window.addEventListener("pagehide", () => {
      sub.dispose();
      resize.dispose();
      detachKeyboard();
      detachTouchScroll();
      detachExit();
      detachViewport();
      shell.dispose();
      fit.dispose();
      term.dispose();
    });
  } catch (err) {
    console.error("failed to start libghostty", err);
    error.hidden = false;
  }
}

void boot();
