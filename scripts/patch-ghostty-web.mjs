import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = new URL("../node_modules/ghostty-web/", import.meta.url);
const dist = new URL("dist/ghostty-web.js", pkg);
const INLINE_WASM = /new URL\("data:application\/wasm;base64,[A-Za-z0-9+/=]+"(, self\.location)?\)/;
const SERVED_WASM = `new URL("/ghostty-vt.wasm", self.location)`;
const LOADER_OLD = `    if (!B)
      try {
        const I = await (await import("./__vite-browser-external-2447137e.js")).readFile(A);
        B = I.buffer.slice(I.byteOffset, I.byteOffset + I.byteLength);
      } catch {
      }
    if (!B) {
      const C = await fetch(A);
      if (!C.ok)
        throw new Error(\`Failed to fetch WASM: \${C.status} \${C.statusText}\`);
      if (B = await C.arrayBuffer(), B.byteLength === 0)
        throw new Error(\`WASM file is empty (0 bytes). Check path: \${A}\`);
    }
    if (!B)
      throw new Error(\`Could not load WASM from path: \${A}\`);
    const g = await WebAssembly.compile(B), E = await WebAssembly.instantiate(g, {`;
const LOADER_NEW = `    const C = await fetch(A);
    if (!C.ok)
      throw new Error(\`Failed to fetch WASM: \${C.status} \${C.statusText}\`);
    let g;
    try {
      g = await WebAssembly.compileStreaming(C);
    } catch {
      const R = await fetch(A);
      g = await WebAssembly.compile(await R.arrayBuffer());
    }
    const E = await WebAssembly.instantiate(g, {`;

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
copyFileSync(new URL("ghostty-vt.wasm", pkg), new URL("../public/ghostty-vt.wasm", import.meta.url));

let src = readFileSync(dist, "utf8");
let changed = false;
if (!src.includes(SERVED_WASM)) {
  if (!INLINE_WASM.test(src)) {
    console.error("patch-ghostty-web: inline wasm not found in ghostty-web/dist, the package layout changed");
    process.exit(1);
  }
  src = src.replace(INLINE_WASM, SERVED_WASM);
  changed = true;
}
if (src.includes(LOADER_OLD)) {
  src = src.replace(LOADER_OLD, LOADER_NEW);
  changed = true;
} else if (!src.includes("WebAssembly.compileStreaming(C)")) {
  console.error("patch-ghostty-web: WASM loader not found in ghostty-web/dist, the package layout changed");
  process.exit(1);
}
if (changed) writeFileSync(dist, src);
console.log("patch-ghostty-web: wasm served from /ghostty-vt.wasm with streaming compile");
