import type { Terminal } from "ghostty-web";

export function attachTouchScroll(term: Terminal, enabled: () => boolean = () => true) {
  const element = term.element;
  if (!element) return () => {};

  let lastY = 0;
  let dragging = false;
  let rowHeight = 20;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || !enabled()) {
      dragging = false;
      return;
    }
    dragging = true;
    lastY = e.touches[0].clientY;
    const canvas = element.querySelector("canvas");
    rowHeight = canvas && term.rows ? canvas.clientHeight / term.rows : 20;
  };

  const onMove = (e: TouchEvent) => {
    if (!dragging || e.touches.length !== 1 || !enabled() || term.getScrollbackLength() === 0) return;
    const y = e.touches[0].clientY;
    const dy = y - lastY;
    lastY = y;
    if (dy === 0) return;
    e.preventDefault();
    term.scrollLines(-dy / rowHeight);
  };

  const onEnd = () => {
    dragging = false;
  };

  element.addEventListener("touchstart", onStart, { passive: true });
  element.addEventListener("touchmove", onMove, { passive: false });
  element.addEventListener("touchend", onEnd);
  element.addEventListener("touchcancel", onEnd);

  return () => {
    element.removeEventListener("touchstart", onStart);
    element.removeEventListener("touchmove", onMove);
    element.removeEventListener("touchend", onEnd);
    element.removeEventListener("touchcancel", onEnd);
  };
}
