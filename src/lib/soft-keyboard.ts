const SENTINEL = " ";
const BACKSPACE = "\x7f";

const chars = (s: string) => Array.from(s);

export function attachSoftKeyboard(textarea: HTMLTextAreaElement, send: (data: string) => void) {
  textarea.setAttribute("autocomplete", "off");
  textarea.setAttribute("enterkeyhint", "send");
  textarea.style.fontSize = "16px";

  let sent: string[] = [];

  const reset = () => {
    textarea.value = SENTINEL;
    textarea.setSelectionRange(1, 1);
    sent = [];
  };

  const sync = () => {
    let value = textarea.value.replace(/[\r\n]/g, "");
    let extraBackspaces = 0;
    if (value.startsWith(SENTINEL)) value = value.slice(SENTINEL.length);
    else extraBackspaces = 1;

    const next = chars(value);
    let same = 0;
    while (same < sent.length && same < next.length && sent[same] === next[same]) same++;
    const out = BACKSPACE.repeat(sent.length - same + extraBackspaces) + next.slice(same).join("");
    sent = next;
    if (out) send(out);
    if (extraBackspaces) reset();
  };

  const onInput = (e: Event) => {
    const type = (e as InputEvent).inputType;
    if (type === "insertLineBreak" || type === "insertParagraph") {
      sync();
      send("\r");
      reset();
      return;
    }
    sync();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.keyCode === 229 || e.isComposing) return;
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) queueMicrotask(reset);
  };

  const swallow = (e: Event) => e.stopPropagation();
  const swallowed = ["beforeinput", "compositionstart", "compositionupdate", "compositionend"] as const;

  textarea.addEventListener("input", onInput);
  textarea.addEventListener("keydown", onKeyDown);
  textarea.addEventListener("focus", reset);
  for (const type of swallowed) textarea.addEventListener(type, swallow);
  reset();

  return () => {
    textarea.removeEventListener("input", onInput);
    textarea.removeEventListener("keydown", onKeyDown);
    textarea.removeEventListener("focus", reset);
    for (const type of swallowed) textarea.removeEventListener(type, swallow);
  };
}
