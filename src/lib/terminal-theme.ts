import { JetBrains_Mono } from "next/font/google";

// berkeley mono is paid, so it isn't bundled
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"] });
export const FONT_FAMILY = `"Berkeley Mono", ${mono.style.fontFamily}`;
export const FONT_SIZE = 16.5;

export const MELLOW = {
  background: "#161617",
  foreground: "#c9c7cd",
  cursor: "rgba(202, 201, 221, 0.9)",
  cursorAccent: "#161617",
  selectionBackground: "#2a2a2d",
  selectionForeground: "#c1c0d4",
  black: "#27272a",
  red: "#f5a191",
  green: "#90b99f",
  yellow: "#e6b99d",
  blue: "#aca1cf",
  magenta: "#e29eca",
  cyan: "#ea83a5",
  white: "#c1c0d4",
  brightBlack: "#424246",
  brightRed: "#ffae9f",
  brightGreen: "#9dc6ac",
  brightYellow: "#f0c5a9",
  brightBlue: "#b9aeda",
  brightMagenta: "#ecaad6",
  brightCyan: "#f591b2",
  brightWhite: "#cac9dd",
};
