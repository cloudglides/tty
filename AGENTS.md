<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# tty

The website for tty, a Hack Club YSWS for terminal apps. The whole site is one terminal: Ghostty's VT engine (libghostty-vt, via `ghostty-web`) compiled to WebAssembly and rendered to a canvas. There is no other UI. Everything a visitor does happens by typing commands at `hackclub@ysws ~/tty>`.

## Commands

```sh
npm run dev      # node server.mjs (Next.js dev + chat WebSocket)
npm run build    # next build
npm start        # NODE_ENV=production node server.mjs
npx tsc --noEmit # typecheck
npx eslint .     # lint
```

There is no test suite. Before calling a change done, run typecheck, lint and build, then check it in a real browser. For terminal behaviour, drive the page with puppeteer-core and a local Chromium, take screenshots, and read them. For mobile, emulate a touch viewport and send keyboard input the way phones do (keyCode 229 keydown followed by `Input.insertText` / IME composition over CDP).

Only one `next dev` can run per project directory. If one is already running, test against it or against a production build started with `PORT=<port> NODE_ENV=production node server.mjs`.

## Stack

- Next.js 16 (App Router, `cacheComponents`), React 19, Tailwind 4, TypeScript
- `ghostty-web` 0.4 for the terminal (xterm.js compatible API). `scripts/patch-ghostty-web.mjs` runs on `postinstall`: it copies the engine to `public/ghostty-vt.wasm` (gitignored) and patches `ghostty-web/dist` to load it from there instead of a 560 KB base64 string inside the JS bundle. `layout.tsx` preloads that file. If the script fails after a `ghostty-web` upgrade, update its pattern.
- A custom Node server (`server.mjs`) so the chat can use WebSockets (`ws`)
- Postgres (`pg`) for RSVPs
- Hack Club Auth (OIDC) for login, Slack Web API for channel invites

## Layout

```
server.mjs                    http server: Next.js handler + WebSocket upgrade routing
server/chat.mjs               chat WebSocket server (auth, rate limits, broadcast)
server/slack.mjs              Slack <-> chat bridge (draft, off unless SLACK_SYNC=on)
src/app/page.tsx              the page: background ASCII art + the terminal
src/app/layout.tsx            metadata and viewport
src/app/api/auth/*            Hack Club Auth login, callback, me, logout
src/app/api/rsvp/route.ts     RSVP: record in Postgres, invite to #tty
src/components/GhosttyTerminal.tsx   boots ghostty-web, wires input to the shell
src/lib/shell.ts              the shell: line editor, history, command dispatch, modes
src/lib/features/*.ts         one file per command (auth, chat, prizes, rsvp)
src/lib/soft-keyboard.ts      mobile keyboard input that ghostty-web drops
src/lib/ansi.ts               SGR colours, OSC 8 links, error/warning helpers
src/lib/ansi-image.ts         renders PNGs as truecolor half-block characters
src/lib/session.ts            session cookie helpers for route handlers
src/lib/session-token.mjs     HMAC session sign/verify, shared by Next and server/
src/lib/chat-shared.mjs       sanitize + limits, shared by Next and server/
src/lib/rsvp-store.ts         Postgres access for RSVPs
src/lib/hca.ts, slack.ts      Hack Club Auth and Slack API clients
src/lib/terminal-theme.ts     Mellow theme, font family and size
scripts/patch-ghostty-web.mjs postinstall: serve the wasm engine as a file
public/ascii/ascii-art.txt    the background art
public/prizes/                prize images
public/ghostty-vt.wasm        generated on install, not committed
```

## How the terminal works

- `GhosttyTerminal` creates the terminal, makes its canvas background transparent (so the ASCII art shows through), and feeds `term.onData` into `Shell.handleInput`.
- `Shell` owns the prompt, line editing, history and tab completion of command names. Commands write ANSI text through `shell.println` / `shell.write`. Long-running commands receive an `AbortSignal` that Ctrl+C triggers. `shell.readLine(prompt)` asks for input. `shell.enterMode(mode)` hands the prompt to something like the chat room until `exitMode`.
- Keys typed while a command runs are queued and replayed afterwards.
- The terminal has no shell or OS behind it. Everything is our JavaScript printing escape sequences.

### Adding a command

1. Create `src/lib/features/<name>.ts` exporting a `Command` (`name`, `help` rows, `run(args, ctx)`).
2. Register it in `GhosttyTerminal.tsx` with `shell.register(...)`. Add `shell.alias(...)` for shortcuts.
3. Commands are reachable both as `<name>` and `hc <name>`.

Anything that needs the server goes through a route handler in `src/app/api/` and is called with `fetch` from the command.

## Auth and identity

- Login is `hc auth login`: it asks for an email, opens a Hack Club Auth popup (`/api/auth/login`), and polls `/api/auth/me` until the callback sets the session.
- Scopes are `openid profile slack_id`. Accounts without a linked Slack ID are refused, because identity is tied to Slack to prevent abuse.
- The display name comes from cachet (`cachet.dunkirk.sh`) using the Slack ID, falling back to the profile name.
- Sessions are an HMAC-signed cookie (`tty_session`, 30 days, httpOnly). Signing lives in `session-token.mjs` so `server/chat.mjs` can verify cookies on WebSocket upgrade.
- Display names are not unique and can be changed in Slack. Do not treat a name as identity; use `slackId`. Chat events carry `{ id, nick }`; the client colors names by `id` and appends `#` plus the last four characters of the id when two people online share a name.

## Chat

- `hc chat` opens a WebSocket to `/api/chat`, handled by `server/chat.mjs`, not by Next.js (route handlers cannot hold WebSockets).
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

Local values go in `.env.local` (never committed). `.env.example` documents them. Do not import `terminal-theme.ts` from route handlers; it loads `next/font`.

## Deployment

- Production runs on Orchard (Hack Club's Kubernetes platform), project `whoami`, deployment `tty`, at https://tty-whoami-32a9a1.k.hackclub.dev.
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
- Server-side code shared with `server/` must be plain `.mjs` with a `.d.mts` declaration, since `server.mjs` runs on Node without a build step.
