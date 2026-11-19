import { authCommand } from "../lib/features/auth";
import { btopCommand } from "../lib/features/btop";
import { chatCommand } from "../lib/features/chat";
import { prizesCommand } from "../lib/features/prizes";
import { rsvpCommand } from "../lib/features/rsvp";
import { Shell } from "../lib/shell";
import { attachSoftKeyboard } from "../lib/soft-keyboard";
import { attachTouchScroll } from "../lib/touch-scroll";
import { FONT_FAMILY, FONT_SIZE, MELLOW } from "../lib/terminal-theme";
import { TUIS } from "./tui-registry.generated";
import { wasmTuiCommand } from "../lib/tui-runner";

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
  const update = () => {
    root.style.setProperty("--app-height", `${vv.height}px`);
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
    fit.fit();
    fit.observeResize();

    const shell = new Shell({
      write: (data) => term.write(data),
      clear: () => term.clear(),
      get cols() {
        return term.cols;
      },
      get rows() {
        return term.rows;
      },
    });
    shell.register(authCommand);
    shell.register(btopCommand);
    shell.register(chatCommand);
    shell.register(prizesCommand);
    shell.register(rsvpCommand);
    for (const tui of TUIS) shell.register(wasmTuiCommand(tui));
    shell.alias("login", ["auth", "login"]);
    shell.alias("logout", ["auth", "logout"]);
    shell.alias("whoami", ["auth", "status"]);

    const sub = term.onData((data: string) => shell.handleInput(data));
    const resize = term.onResize(({ cols, rows }) => shell.resize(cols, rows));
    const detachKeyboard = term.textarea ? attachSoftKeyboard(term.textarea, (data) => shell.handleInput(data)) : () => {};
    const detachTouchScroll = attachTouchScroll(term, () => !shell.inPassthrough);
    const detachViewport = trackVisualViewport();
    shell.start();
    term.focus();

    window.addEventListener("pagehide", () => {
      sub.dispose();
      resize.dispose();
      detachKeyboard();
      detachTouchScroll();
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
