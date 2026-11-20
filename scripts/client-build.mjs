import { build } from "esbuild";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createBrotliCompress, createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import { buildTuiWat } from "./tui-build.mjs";
import { createGuideRenderer } from "./guide-pages.mjs";

const root = new URL("../", import.meta.url);
const publicDir = new URL("../public/", import.meta.url);
const distDir = new URL("../dist/", import.meta.url);
const entry = new URL("../src/client/main.ts", import.meta.url);
const workerEntry = new URL("../src/workers/tui-host.ts", import.meta.url);
const tuisDir = new URL("../tuis/", import.meta.url);
const registryFile = new URL(
  "../src/client/tui-registry.generated.ts",
  import.meta.url,
);
const guidesDir = new URL("../guides/", import.meta.url);
const guideRegistryFile = new URL(
  "../src/client/guide-registry.generated.ts",
  import.meta.url,
);
const RESERVED = new Set([
  "help",
  "guide",
  "guides",
  "about",
  "clear",
  "auth",
  "chat",
  "prizes",
  "rsvp",
  "btop",
  "login",
  "logout",
  "whoami",
]);
const MAX_TUI_BYTES = 2_000_000;

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function asciiArt() {
  const raw = await readFile(
    new URL("public/ascii/ascii-art.txt", root),
    "utf8",
  );
  const lines = raw
    .replace(/^\s*\n/, "")
    .trimEnd()
    .split("\n");
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length),
  );
  return lines.map((l) => l.slice(indent)).join("\n");
}

const css = `@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:100 900;font-display:swap;src:url("/fonts/jetbrains-mono-latin.woff2") format("woff2")}
@font-face{font-family:"JetBrains Mono Fallback";src:local(Arial);ascent-override:75.79%;descent-override:22.29%;line-gap-override:0%;size-adjust:134.59%}
*,:before,:after{box-sizing:border-box;border:0 solid;margin:0;padding:0}
[hidden]{display:none!important}
html{height:100%;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;-webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{height:100%;overflow:hidden;overscroll-behavior:none;background:#161617;display:flex;flex-direction:column}
pre{font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace);font-size:1em}
canvas,img,svg{display:block;vertical-align:middle}
.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.hidden{display:none}
.min-h-0{min-height:0}.min-h-full{min-height:100%}.h-full{height:100%}.w-full{width:100%}.w-screen{width:100vw}
.flex{display:flex}.flex-1{flex:1}.flex-col{flex-direction:column}.grid{display:grid}.place-items-center{place-items:center}
.items-center{align-items:center}.justify-end{justify-content:flex-end}.overflow-hidden{overflow:hidden}
.p-1{padding:4px}
.select-none{-webkit-user-select:none;user-select:none}.leading{line-height:1.15}.opacity-30{opacity:.3}
.caret-transparent{caret-color:transparent}.outline-none{outline:none}
.font-mono{font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace)}
.text-sm{font-size:.875rem;line-height:1.25}.text-zinc-400{color:#9f9fa9}
:root{--font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
.art{position:absolute;inset:0;display:none;pointer-events:none;align-items:center;justify-content:flex-end;overflow:hidden;padding-right:4vw}
@media(min-width:64rem){.art{display:flex}}
.wrapper{height:var(--app-height,100dvh);width:100vw;display:flex;flex-direction:column;overflow:hidden;touch-action:manipulation;background:#161617;color:#c9c7cd;font-family:"Berkeley Mono","JetBrains Mono","JetBrains Mono Fallback"}
.error{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--font-mono);font-size:.875rem;color:#9f9fa9}`;

function html(art, cols, ghosttyChunk, iconVersion, appVersion) {
  return `<!DOCTYPE html>
<html lang="en" class="h-full antialiased">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">
<title>TTY!</title>
<meta name="description" content="A Hack Club YSWS powered by libghostty">
<link rel="icon" href="/ico.png?v=${iconVersion}" type="image/png" sizes="64x64">
<link rel="preload" href="/ghostty-vt.wasm" as="fetch" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="modulepreload" href="/${ghosttyChunk}">
<script type="module" src="/app.js?v=${appVersion}"></script>
<style>${css}</style>
</head>
<body>
<main class="wrapper">
<div class="relative min-h-0 flex-1">
<div aria-hidden="true" class="art">
<pre class="select-none leading opacity-30" style="color:#f5a191;font-size:min(14px, calc(55vw / ${cols * 0.6}))">${escapeHtml(art)}</pre>
</div>
<div class="relative h-full p-1">
<div class="relative h-full w-full">
<div id="term-error" class="error" hidden>failed to load terminal, check the console</div>
<div id="term" class="h-full w-full caret-transparent outline-none"></div>
</div>
</div>
</div>
</main>
</body>
</html>
`;
}

async function compress(filePath) {
  for (const [ext, codec] of [
    [".br", createBrotliCompress()],
    [".gz", createGzip({ level: 9 })],
  ]) {
    await pipeline(
      createReadStream(filePath),
      codec,
      createWriteStream(filePath + ext),
    );
  }
}

async function walk(dir, base = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    if (e.isDirectory())
      out.push(...(await walk(new URL(`${e.name}/`, dir), rel)));
    else out.push(rel);
  }
  return out;
}

async function buildTuis() {
  const entries = [];
  let dirs = [];
  try {
    dirs = await readdir(tuisDir, { withFileTypes: true });
  } catch {
    await mkdir(tuisDir, { recursive: true });
  }
  await mkdir(new URL("tuis/", distDir), { recursive: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const base = `tuis/${dir.name}`;
    let manifest;
    try {
      manifest = JSON.parse(
        await readFile(new URL(`${dir.name}/manifest.json`, tuisDir), "utf8"),
      );
    } catch (err) {
      throw new Error(`${base}: invalid manifest.json: ${err.message}`);
    }
    const { name, summary, wasm } = manifest;
    if (
      typeof name !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,31}$/.test(name) ||
      name !== dir.name
    ) {
      throw new Error(
        `${base}: name must be a lowercase slug matching the directory`,
      );
    }
    if (RESERVED.has(name)) throw new Error(`${base}: name is reserved`);
    if (
      typeof summary !== "string" ||
      summary.length < 1 ||
      summary.length > 80 ||
      /[^\x20-\x7e]/.test(summary)
    ) {
      throw new Error(
        `${base}: summary must be 1-80 printable ASCII characters`,
      );
    }
    if (typeof wasm !== "string" || !/^[a-z0-9._-]+\.wasm$/.test(wasm)) {
      throw new Error(`${base}: wasm must be a .wasm filename`);
    }
    const source = new URL(`${dir.name}/${wasm}`, tuisDir);
    const info = await stat(source).catch(() => null);
    if (!info?.isFile() || info.size === 0 || info.size > MAX_TUI_BYTES) {
      throw new Error(
        `${base}: ${wasm} must exist and be at most ${MAX_TUI_BYTES} bytes`,
      );
    }
    await cp(source, new URL(`tuis/${dir.name}/${wasm}`, distDir));
    entries.push({ name, summary, url: `/${base}/${wasm}` });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  const source = `export type TuiEntry = { name: string; summary: string; url: string };\n\nexport const TUIS: TuiEntry[] = ${JSON.stringify(entries, null, 2)};\n`;
  const current = await readFile(registryFile, "utf8").catch(() => null);
  if (current !== source) await writeFile(registryFile, source);
}

function parseFrontmatter(text, where) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`${where}: missing frontmatter`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

const printable = (s) =>
  typeof s === "string" && s.length >= 1 && s.length <= 80 && !/[^\x20-\x7e]/.test(s);

async function buildGuides(iconVersion) {
  const { renderGuide, renderIndex } = await createGuideRenderer({ iconVersion });
  const entries = [];
  let files = [];
  try {
    files = await readdir(guidesDir, { withFileTypes: true });
  } catch {}
  await mkdir(new URL("guides/", distDir), { recursive: true });

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".mdx")) continue;
    const name = file.name.slice(0, -4);
    const where = `guides/${file.name}`;
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(name)) {
      throw new Error(`${where}: filename must be a lowercase slug`);
    }
    const text = await readFile(new URL(file.name, guidesDir), "utf8");
    const { title, description } = parseFrontmatter(text, where);
    if (!printable(title) || !printable(description)) {
      throw new Error(`${where}: title and description must be 1-80 printable ASCII characters`);
    }
    const nonAscii = text.split("\n").findIndex((line) => /[^\x09\x20-\x7e]/.test(line));
    if (nonAscii >= 0) throw new Error(`${where}:${nonAscii + 1}: guides must be ASCII only`);

    const hash = createHash("sha256").update(text);
    const images = new Map();
    for (const [, src] of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (!/^\.\/images\/[a-z0-9/._-]+\.(png|webp)$/.test(src) || src.includes("..")) {
        throw new Error(`${where}: image ${src} must be ./images/<path>.png or .webp`);
      }
      const image = await readFile(new URL(src, guidesDir)).catch(() => null);
      if (!image) throw new Error(`${where}: image ${src} not found`);
      hash.update(image);
      const imageVersion = createHash("sha256").update(image).digest("hex").slice(0, 8);
      images.set(src, { buffer: image, url: `/guides/${src.slice(2)}?v=${imageVersion}` });
    }

    const markdown = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    await writeFile(
      new URL(`guides/${name}.html`, distDir),
      renderGuide({ name, title, description, markdown, images }),
    );
    entries.push({
      name,
      title,
      description,
      url: `/guides/${name}`,
      version: hash.digest("hex").slice(0, 8),
    });
  }
  await cp(new URL("images/", guidesDir), new URL("guides/images/", distDir), {
    recursive: true,
  }).catch((err) => {
    if (err.code !== "ENOENT") throw err;
  });

  entries.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(new URL("guides/index.html", distDir), renderIndex(entries));
  const source = `export type GuideEntry = { name: string; title: string; description: string; url: string; version: string };\n\nexport const GUIDES: GuideEntry[] = ${JSON.stringify(entries, null, 2)};\n`;
  const current = await readFile(guideRegistryFile, "utf8").catch(() => null);
  if (current !== source) await writeFile(guideRegistryFile, source);
}

export async function buildClient() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await buildTuiWat();
  await buildTuis();
  const icon = await readFile(new URL("ico.png", publicDir));
  const iconVersion = createHash("sha256")
    .update(icon)
    .digest("hex")
    .slice(0, 8);
  await buildGuides(iconVersion);

  const worker = await build({
    entryPoints: [workerEntry.pathname],
    outdir: new URL("workers/", distDir).pathname,
    entryNames: "tui-host-[hash]",
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    legalComments: "none",
    metafile: true,
  });
  const workerPath = Object.keys(worker.metafile.outputs)[0];
  const workerUrl = "/" + workerPath.slice(workerPath.indexOf("workers/"));

  const client = await build({
    entryPoints: [entry.pathname],
    outdir: distDir.pathname,
    entryNames: "app",
    chunkNames: "chunks/[name]-[hash]",
    bundle: true,
    splitting: true,
    format: "esm",
    target: "es2022",
    minify: true,
    legalComments: "none",
    metafile: true,
    define: { TUI_WORKER_URL: JSON.stringify(workerUrl) },
  });
  const chunkPath = Object.keys(client.metafile.outputs).find((name) =>
    /chunks\/ghostty-web-.*\.js$/.test(name),
  );
  if (!chunkPath) throw new Error("ghostty chunk not found in client build");
  const ghosttyChunk = chunkPath.slice(chunkPath.indexOf("chunks/"));

  const appVersion = createHash("sha256")
    .update(await readFile(new URL("app.js", distDir)))
    .digest("hex")
    .slice(0, 8);

  await cp(publicDir, distDir, { recursive: true });

  const art = await asciiArt();
  const cols = Math.max(...art.split("\n").map((l) => l.length));
  await writeFile(
    new URL("index.html", distDir),
    html(art, cols, ghosttyChunk, iconVersion, appVersion),
  );

  for (const rel of await walk(distDir)) {
    if (/\.(br|gz)$/.test(rel) || !/\.(html|js|css|wasm|svg|txt)$/.test(rel))
      continue;
    await compress(new URL(rel, distDir).pathname);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildClient();
}
