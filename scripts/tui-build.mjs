import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import wabtFactory from "wabt";

const root = new URL("../", import.meta.url);
const tuisDir = new URL("tuis/", root);

export async function buildTuiWat() {
  const dirs = await readdir(tuisDir, { withFileTypes: true }).catch(() => []);
  const watFiles = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const wat = new URL(`${dir.name}/${dir.name}.wat`, tuisDir);
    if (await readFile(wat, "utf8").catch(() => null)) watFiles.push(wat);
  }
  if (!watFiles.length) return;
  const wabt = await wabtFactory();
  for (const wat of watFiles) {
    const source = await readFile(wat, "utf8");
    const module = wabt.parseWat(path.basename(wat.pathname), source);
    module.resolveNames();
    module.validate();
    const { buffer } = module.toBinary({ log: false, write_debug_names: false });
    module.destroy();
    const wasm = new URL(`${path.basename(path.dirname(wat.pathname))}.wasm`, new URL("./", wat));
    const bytes = Buffer.from(buffer);
    const existing = await readFile(wasm).catch(() => null);
    if (existing && existing.equals(bytes)) continue;
    await writeFile(wasm, bytes);
    console.log(`compiled ${path.basename(wat.pathname)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildTuiWat();
}
