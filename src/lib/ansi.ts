export const SGR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

export const paint = (color: string, s: string) => color + s + SGR.reset;
export const bold = (s: string) => paint(SGR.bold, s);
export const dim = (s: string) => paint(SGR.dim, s);
export const red = (s: string) => paint(SGR.red, s);
export const green = (s: string) => paint(SGR.green, s);
export const yellow = (s: string) => paint(SGR.yellow, s);
export const blue = (s: string) => paint(SGR.blue, s);
export const magenta = (s: string) => paint(SGR.magenta, s);
export const cyan = (s: string) => paint(SGR.cyan, s);

export const link = (url: string, text = url) => `\x1b]8;;${url}\x1b\\${paint("\x1b[4m", text)}\x1b]8;;\x1b\\`;

export const visibleLength = (s: string) =>
  s.replace(/\x1b\[[0-9;]*m|\x1b\]8;;.*?\x1b\\/g, "").length;

const NICK_COLORS = ["\x1b[91m", "\x1b[92m", "\x1b[93m", "\x1b[94m", "\x1b[95m", "\x1b[96m"];
export function nickColor(nick: string) {
  let h = 0;
  for (const ch of nick) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return NICK_COLORS[Math.abs(h) % NICK_COLORS.length];
}

export const error = (s: string) => `${red("error:")} ${s}`;
export const warning = (s: string) => `${yellow("warning:")} ${s}`;
