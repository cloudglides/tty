import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = new URL("../node_modules/ghostty-web/", import.meta.url);
const dist = new URL("dist/ghostty-web.js", pkg);
const INLINE_WASM = /new URL\("data:application\/wasm;base64,[A-Za-z0-9+/=]+"(, self\.location)?\)/;
const SERVED_WASM = `new URL("/ghostty-vt.wasm", self.location)`;

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
copyFileSync(new URL("ghostty-vt.wasm", pkg), new URL("../public/ghostty-vt.wasm", import.meta.url));

const src = readFileSync(dist, "utf8");
if (src.includes(SERVED_WASM)) process.exit(0);
if (!INLINE_WASM.test(src)) {
  console.error("patch-ghostty-web: inline wasm not found in ghostty-web/dist, the package layout changed");
  process.exit(1);
}
writeFileSync(dist, src.replace(INLINE_WASM, SERVED_WASM));
console.log("patch-ghostty-web: wasm now served from /ghostty-vt.wasm");
