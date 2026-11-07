// inline: terminal-theme loads next/font, which route handlers can't use
const C = { bg: "#161617", fg: "#c9c7cd", green: "#90b99f", red: "#f5a191", dim: "#424246" };

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function authPage(title: string, detail: string, ok: boolean) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>tty · ${escape(title)}</title>
<style>
  html,body{margin:0;height:100%;background:${C.bg};color:${C.fg};
    font:15px/1.5 "Berkeley Mono","JetBrains Mono",ui-monospace,monospace}
  main{padding:24px}
  .t{color:${ok ? C.green : C.red}}
  .d{color:${C.dim}}
</style></head>
<body><main>
  <div class="t">${ok ? "✓" : "✗"} ${escape(title)}</div>
  <div class="d">${escape(detail)}</div>
</main>
${ok ? "<script>setTimeout(() => window.close(), 1200)</script>" : ""}
</body></html>`;
}
