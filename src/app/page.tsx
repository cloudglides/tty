import { readFile } from "node:fs/promises";
import path from "node:path";
import GhosttyTerminal from "@/components/GhosttyTerminal";
import { FONT_FAMILY, MELLOW } from "@/lib/terminal-theme";

async function getAsciiArt() {
  "use cache";
  const raw = await readFile(path.join(process.cwd(), "public/ascii/ascii-art.txt"), "utf8");
  const lines = raw.replace(/^\s*\n/, "").trimEnd().split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(indent)).join("\n");
}

export default async function Home() {
  const art = await getAsciiArt();
  const cols = Math.max(...art.split("\n").map((l) => l.length));

  return (
    <main
      className="flex h-[var(--app-height,100dvh)] w-screen flex-col overflow-hidden"
      style={{ background: MELLOW.background, color: MELLOW.foreground, fontFamily: FONT_FAMILY }}
    >
      <div className="relative min-h-0 flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden items-center lg:flex justify-end overflow-hidden pr-[4vw]">
          <pre
            className="select-none leading-[1.15] opacity-30"
            style={{ color: MELLOW.red, fontSize: `min(14px, calc(55vw / ${cols * 0.6}))` }}
          >
            {art}
          </pre>
        </div>
        <div className="relative h-full p-1">
          <GhosttyTerminal />
        </div>
      </div>
    </main>
  );
}
