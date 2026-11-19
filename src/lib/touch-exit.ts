import type { Shell } from "./shell";

export function attachPassthroughExit(element: HTMLElement | undefined, shell: Shell) {
  if (!element) return () => {};

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let lastTap = 0;
  let multi = false;
  let multiTime = 0;

  const escape = (e: TouchEvent) => {
    if (!shell.inPassthrough) return;
    if (e.cancelable) e.preventDefault();
    lastTap = 0;
    multi = false;
    shell.handleInput("\x03");
  };

  const onStart = (e: TouchEvent) => {
    if (!shell.inPassthrough) return;
    if (e.touches.length >= 2) {
      multi = true;
      multiTime = Date.now();
      return;
    }
    if (e.touches.length !== 1) return;
    multi = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
  };

  const onEnd = (e: TouchEvent) => {
    if (!shell.inPassthrough) return;
    if (multi) {
      if (Date.now() - multiTime < 600 && e.touches.length === 0) escape(e);
      multi = false;
      return;
    }
    if (e.touches.length || !e.changedTouches.length) return;
    const touch = e.changedTouches[0];
    if (Date.now() - startTime > 300) return;
    if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 12) return;
    const now = Date.now();
    if (now - lastTap < 350) escape(e);
    else lastTap = now;
  };

  const onCancel = () => {
    multi = false;
    lastTap = 0;
  };

  element.addEventListener("touchstart", onStart, { passive: true });
  element.addEventListener("touchend", onEnd);
  element.addEventListener("touchcancel", onCancel);

  return () => {
    element.removeEventListener("touchstart", onStart);
    element.removeEventListener("touchend", onEnd);
    element.removeEventListener("touchcancel", onCancel);
  };
}
