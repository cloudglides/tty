import { Marked } from "marked";
import { createHighlighter } from "shiki";

const mellow = {
  name: "mellow",
  type: "dark",
  colors: { "editor.background": "#1c1c1e", "editor.foreground": "#c9c7cd" },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#6c6c74", fontStyle: "italic" } },
    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#90b99f" } },
    { scope: ["constant.numeric", "constant.language", "constant.character"], settings: { foreground: "#e6b99d" } },
    { scope: ["keyword", "storage", "storage.type", "keyword.control", "keyword.operator.new"], settings: { foreground: "#aca1cf" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#e29eca" } },
    { scope: ["entity.name.tag", "support.class.component", "entity.name.type", "support.type"], settings: { foreground: "#f5a191" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#e6b99d" } },
    { scope: ["variable.parameter", "variable.other.property", "meta.object-literal.key"], settings: { foreground: "#c1c0d4" } },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: "#8b8a93" } },
  ],
};

const LANGS = ["tsx", "ts", "js", "jsx", "sh", "bash", "json", "rust", "zig", "c", "go", "python", "wasm"];

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s) =>
  s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const css = `
:root{--bg:#161617;--panel:#1c1c1e;--line:#2a2a2d;--fg:#c9c7cd;--dim:#8b8a93;--accent:#f5a191;--link:#e6b99d;--code:#ea83a5}
@font-face{font-family:"JetBrains Mono";src:url("/fonts/jetbrains-mono-latin.woff2") format("woff2");font-weight:100 800;font-display:swap}
*{box-sizing:border-box}
html{background:var(--bg);color:var(--fg);-webkit-text-size-adjust:100%}
body{margin:0;font:15px/1.75 "JetBrains Mono",ui-monospace,monospace}
main{max-width:84ch;margin:0 auto;padding:32px 16px 96px}
nav{color:var(--dim);font-size:14px;margin-bottom:40px}
nav a{color:var(--dim)}
nav a:hover{color:var(--fg)}
h1{color:var(--accent);font-size:24px;line-height:1.3;margin:0 0 8px}
.description{color:var(--dim);margin:0 0 40px}
h2{font-size:18px;margin:48px 0 12px;color:#e6e4ea}
h3{font-size:15px;margin:32px 0 8px;color:#e6e4ea}
h2 a,h3 a{color:inherit;text-decoration:none}
p,ul,ol{margin:0 0 16px}
ul,ol{padding-left:2ch}
li{margin:4px 0}
li::marker{color:var(--dim)}
a{color:var(--link);text-underline-offset:3px}
code{font-family:inherit;font-size:14px}
:not(pre)>code{color:var(--code);background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:1px 5px}
pre{background:var(--panel)!important;border:1px solid var(--line);border-radius:6px;padding:14px 16px;overflow-x:auto;margin:0 0 20px;line-height:1.6}
figure{margin:24px 0 28px}
figure img{display:block;max-width:100%;height:auto}
figcaption{color:var(--dim);font-size:13px;margin-top:6px;text-align:center}
.guides{list-style:none;padding:0}
.guides li{margin:0 0 20px}
.guides a{font-weight:700}
.guides span{display:block;color:var(--dim)}
footer{margin-top:64px;padding-top:16px;border-top:1px solid var(--line);color:var(--dim);font-size:14px}
footer a{color:var(--dim)}
@media (max-width:600px){body{font-size:14px}h1{font-size:20px}pre{padding:12px;font-size:13px}}
`;

function layout({ title, description, crumbs, body, iconVersion }) {
  const nav = crumbs
    .map(([label, href]) => (href ? `<a href="${href}">${escapeHtml(label)}</a>` : escapeHtml(label)))
    .join(" / ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - tty</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" href="/ico.png?v=${iconVersion}" type="image/png" sizes="64x64">
<link rel="preload" href="/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>${css}</style>
</head>
<body>
<main>
<nav>${nav}</nav>
${body}
<footer>tty is a Hack Club YSWS for terminal apps. <a href="/">open the terminal</a></footer>
</main>
</body>
</html>
`;
}

export async function createGuideRenderer({ iconVersion }) {
  const highlighter = await createHighlighter({ themes: [mellow], langs: LANGS });

  function renderGuide({ name, title, description, markdown, images }) {
    const marked = new Marked({
      gfm: true,
      renderer: {
        html({ text }) {
          return escapeHtml(text);
        },
        heading({ tokens, depth }) {
          const text = this.parser.parseInline(tokens);
          const level = Math.min(Math.max(depth, 2), 4);
          const id = slugify(text);
          return `<h${level} id="${id}"><a href="#${id}">${text}</a></h${level}>\n`;
        },
        code({ text, lang }) {
          const language = LANGS.includes(lang) ? lang : "text";
          return highlighter.codeToHtml(text, { lang: language, theme: "mellow" }) + "\n";
        },
        image({ href, text }) {
          const image = images.get(href);
          if (!image) throw new Error(`guides/${name}.mdx: image ${href} not found`);
          const size = pngSize(image.buffer);
          const dims = size ? ` width="${size.width / 2}" height="${size.height / 2}"` : "";
          return `<figure><img src="${image.url}" alt="${escapeHtml(text)}"${dims} loading="lazy" decoding="async"><figcaption>${escapeHtml(text)}</figcaption></figure>`;
        },
        paragraph({ tokens }) {
          if (tokens.length === 1 && tokens[0].type === "image") return this.parser.parseInline(tokens) + "\n";
          return `<p>${this.parser.parseInline(tokens)}</p>\n`;
        },
      },
    });
    const body = `<h1>${escapeHtml(title)}</h1>\n<p class="description">${escapeHtml(description)}</p>\n${marked.parse(markdown)}`;
    return layout({
      title,
      description,
      crumbs: [["tty", "/"], ["guides", "/guides/"], [name]],
      body,
      iconVersion,
    });
  }

  function renderIndex(entries) {
    const items = entries
      .map((g) => `<li><a href="/guides/${g.name}">${escapeHtml(g.title)}</a><span>${escapeHtml(g.description)}</span></li>`)
      .join("\n");
    return layout({
      title: "guides",
      description: "guides for building terminal apps for tty",
      crumbs: [["tty", "/"], ["guides"]],
      body: `<h1>guides</h1>\n<p class="description">guides for building terminal apps for tty</p>\n<ul class="guides">\n${items || "<li>no guides yet</li>"}\n</ul>`,
      iconVersion,
    });
  }

  return { renderGuide, renderIndex };
}
