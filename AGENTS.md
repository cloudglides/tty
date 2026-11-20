# tty

The website for tty, a Hack Club YSWS for terminal apps. The whole site is one terminal: Ghostty's VT engine (libghostty-vt, via `ghostty-web`) compiled to WebAssembly and rendered to a canvas. There is no other UI. Everything a visitor does happens by typing commands at `hackclub@ysws ~/tty>`.

## Commands

```sh
npm run dev      # node server.mjs (builds client, serves static files + API + chat WebSocket, watches for changes)
npm run build    # generate dist/: static HTML + bundled client + precompressed assets
npm start        # NODE_ENV=production node server.mjs
npm run typecheck # tsc --noEmit
npm run tui:build # compile WAT sources in tuis/ (build does this too)
```

There is no test suite and no lint step. Before calling a change done, run typecheck and build, then check it in a real browser. For terminal behaviour, drive the page with puppeteer-core and a local Chromium, take screenshots, and read them. For mobile, emulate a touch viewport and send keyboard input the way phones do (keyCode 229 keydown followed by `Input.insertText` / IME composition over CDP).

Only one dev server can run per project directory. If one is already running, test against it or against a production build started with `PORT=<port> NODE_ENV=production node server.mjs`.

## Stack

- Plain Node HTTP server, no framework. The client is one vanilla ESM bundle built with esbuild. TypeScript is used for the browser-facing source and compiled/bundled at build time; server code runs directly on Node.
- `ghostty-web` 0.4 for the terminal (xterm.js compatible API). `scripts/patch-ghostty-web.mjs` runs on `postinstall`: it copies the engine to `public/ghostty-vt.wasm` (gitignored), patches `ghostty-web/dist` to load it from there instead of a 560 KB base64 string, and switches the loader to `WebAssembly.compileStreaming`. `dist/index.html` preloads that file. If the script fails after a `ghostty-web` upgrade, update its pattern.
- `scripts/client-build.mjs` generates `dist/index.html` (inline CSS, ASCII art embedded) and bundles `src/client/main.ts` into `dist/app.js` plus a dynamically imported ghostty chunk. It copies `public/` into `dist/` and precompresses text assets to `.br` / `.gz`. The server picks the right encoding at request time.
- The font is self-hosted at `public/fonts/jetbrains-mono-latin.woff2`; `dist/index.html` declares its `@font-face` and the client waits for `document.fonts.load` before opening the terminal.
- Postgres (`pg`) for RSVPs
- Hack Club Auth (OIDC) for login, Slack Web API for channel invites
- Contributed TUIs are WASM binaries that run in a Web Worker behind a fixed WASI-style ABI (no DOM, fetch or filesystem). Contributed code is never executed on the server.

## Layout

```
server.mjs                    http server: static files, API routes, WebSocket upgrade routing
server/http.mjs               cookie parsing/serialization, send/json/html, origin helpers
server/session.mjs            session cookie helpers (get/set/clear)
server/hca.mjs                Hack Club Auth client (token exchange, user info)
server/rsvp-store.mjs         Postgres access for RSVPs
server/auth-page.mjs          HTML for the login callback result page
server/slack-invite.mjs       Slack channel invite helper
server/chat.mjs               chat WebSocket server (auth, rate limits, broadcast)
server/slack.mjs              Slack <-> chat bridge (draft, off unless SLACK_SYNC=on)
src/client/main.ts            vanilla client entry: boots ghostty-web, wires input to the shell, registers WASM TUIs
src/client/tui-registry.generated.ts  generated list of contributed TUI commands
src/workers/tui-host.ts       Web Worker host: WASI-style ABI, input buffering, output limits
src/lib/tui-runner.ts         browser-side launcher for contributed WASM TUIs
src/lib/shell.ts              the shell: line editor, history, command dispatch, modes
src/lib/lazy-command.ts       registers commands whose implementation loads on first use
src/lib/features/*.ts         one file per command (auth, chat, prizes, rsvp)
src/lib/soft-keyboard.ts      mobile keyboard input that ghostty-web drops
src/lib/touch-scroll.ts       mobile touch-drag scrollback for the terminal
src/lib/touch-exit.ts         double-tap/two-finger exit from fullscreen TUIs
src/lib/ansi.ts               SGR colours, OSC 8 links, error/warning helpers
src/lib/ansi-image.ts         renders PNGs as truecolor half-block characters
src/lib/session-token.mjs     HMAC session sign/verify, shared by client-neutral libs and server/
src/lib/chat-shared.mjs       sanitize + limits, shared by browser and server/
src/lib/terminal-theme.ts     Mellow theme, font family and size (no framework imports)
scripts/client-build.mjs      static HTML generation, esbuild bundles, TUI registry, precompression
scripts/tui-build.mjs         compile WAT sources in tuis/ with wabt
scripts/guide-pages.mjs       renders guides/*.mdx to static pages at /guides/<name> (marked + shiki)
scripts/patch-ghostty-web.mjs postinstall: serve the wasm engine as a file
tuis/                         contributed WASM TUIs, one directory per command (see tuis/README.md)
guides/                       guides as .mdx with frontmatter (title, description) and images/; `hc guide <name>` opens the page
public/ascii/ascii-art.txt    the background art
public/fonts/                 self-hosted JetBrains Mono woff2
public/prizes/                prize images
public/ghostty-vt.wasm        generated on install, not committed
dist/                         generated on build, not committed
```

## How the terminal works

- `src/client/main.ts` creates the terminal, makes its canvas background transparent (so the ASCII art shows through), and feeds `term.onData` into `Shell.handleInput`.
- `Shell` owns the prompt, line editing, history and tab completion of command names. Commands write ANSI text through `shell.println` / `shell.write`. Long-running commands receive an `AbortSignal` that Ctrl+C triggers. `shell.readLine(prompt)` asks for input. `shell.enterMode(mode)` hands the prompt to something like the chat room until `exitMode`.
- Keys typed while a command runs are queued and replayed afterwards.
- The terminal has no shell or OS behind it. Everything is our JavaScript printing escape sequences.

### Adding a command

1. Create `src/lib/features/<name>.ts` exporting a `Command` (`name`, `help` rows, `run(args, ctx)`).
2. Register it in `src/client/main.ts` with `shell.register(...)`. Add `shell.alias(...)` for shortcuts.
3. Commands are reachable both as `<name>` and `hc <name>`.

Rarely used commands can be registered with `lazyCommand` from `src/lib/lazy-command.ts` instead of a static import. It keeps the name and help text in the registration and imports the implementation on first run, so the initial bundle stays small.

Anything that needs the server goes through a route handler in `server.mjs` and is called with `fetch` from the command.

### Running TUIs

- Contributed TUIs live in `tuis/<name>/` and run in a Web Worker with a fixed WASI-style ABI. The server only serves their `.wasm` files as static assets. See `tuis/README.md` for the manifest format, ABI and limits.
- `Shell.enterPassthrough` hands raw keys and resize events to a fullscreen TUI and suppresses the prompt; `exitPassthrough` restores it. WASM TUIs use this. A mode can set `minCols`; on narrow screens the shell temporarily shrinks the terminal font so the TUI gets enough columns, then restores it on exit.
- On touch screens, a double-tap or two-finger tap exits any fullscreen TUI (it sends ctrl-c). The wrapper uses `touch-action: manipulation` so the gesture does not trigger browser zoom.

## Auth and identity

- Login is `hc auth login`: it opens a Hack Club Auth popup (`/api/auth/login`) directly and polls `/api/auth/me` until the callback sets the session.
- Scopes are `openid profile slack_id`. Accounts without a linked Slack ID are refused, because identity is tied to Slack to prevent abuse.
- The display name comes from cachet (`cachet.dunkirk.sh`) using the Slack ID, falling back to the profile name.
- Sessions are an HMAC-signed cookie (`tty_session`, 30 days, httpOnly). Signing lives in `session-token.mjs` so `server/chat.mjs` can verify cookies on WebSocket upgrade.
- Display names are not unique and can be changed in Slack. Do not treat a name as identity; use `slackId`. Chat events carry `{ id, nick }`; the client colors names by `id` and appends `#` plus the last four characters of the id when two people online share a name.

## Chat

- `hc chat` opens a WebSocket to `/api/chat`, handled by `server/chat.mjs` directly in the Node server.
- Nothing is stored. Messages only reach people connected at that moment.
- Upgrades require a valid session cookie and a same-origin `Origin` header. Limits: 500 connections, 5 tabs per user, 8 messages per 10 s, 300 characters, 4 KB frames.
- All text is passed through `sanitize` (strips control and bidi characters) on the server and again on the client.
- State is in memory, so the app must run as exactly one instance.

## Data

- RSVPs live in Postgres in the `rsvps` table (`slack_id` primary key, `name`, `sub`, `at`). The table is created on first use. RSVPing twice is a no-op that retries the Slack invite.

## Environment

| Variable | Purpose |
| --- | --- |
| `HCA_CLIENT_ID`, `HCA_CLIENT_SECRET` | Hack Club Auth app |
| `SESSION_SECRET` | session signing key, at least 32 characters |
| `APP_URL` | public origin; required behind a proxy so the OAuth redirect URI is correct |
| `DATABASE_URL` | Postgres for RSVPs |
| `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` | bot that invites people to #tty |
| `SLACK_SYNC`, `SLACK_APP_TOKEN` | Slack bridge, off unless `SLACK_SYNC=on` |

Local values go in `.env.local` (never committed). `.env.example` documents them.

## Deployment

- Production runs on Orchard (Hack Club's Kubernetes platform), project `tty`, deployment `tty`, at https://tty.hackclub.com (also https://tty.dino.icu).
- Every push to `main` on github.com/cloudglides/tty builds and deploys automatically. Do not push unless the user asks.
- Postgres is the Orchard database `tty`. Env vars are set on the Orchard deployment, secrets as secret vars.
- The deployment runs one replica with the `recreate` strategy, because chat state is in memory.

## Conventions

- No code comments anywhere. Code should explain itself through naming and structure.
- Terminal output must read like a real CLI (git, gh, npm), not a decorated chatbot:
  - ASCII only. No `•`, `·`, `✓`, `✗`, `→`, `…`, emoji or braille spinners. Use `...`, commas, `-->` / `<--`, and `|/-\` for spinners. The only exception is the `▀▄` half-blocks that draw images.
  - Lowercase, short and factual. Errors go through `error()` (`error: ...`), warnings through `warning()`.
  - No exclamation marks, no cheerleading.
- Write "Hack Club" with exactly that capitalization.
- Keep the page free of UI chrome. New features belong inside the terminal as commands.
- Prefer editing existing files. Keep features in `src/lib/features/`, one file per command.
- Server-side code shared with `server/` must be plain `.mjs` (with a `.d.mts` declaration where TypeScript imports it), since `server.mjs` runs on Node without a build step.
