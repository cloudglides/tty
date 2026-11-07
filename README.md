# tty

The website for tty, a Hack Club YSWS for terminal apps. The whole site is a terminal: Ghostty's VT engine (libghostty-vt) compiled to WebAssembly, drawing to a canvas. There is no other UI.

Live at https://tty-whoami-32a9a1.k.hackclub.dev

## Running it

```sh
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 and type `help`.

## What you can do in it

```
help                 show the commands
about                what is this?
hc auth login        log in with Hack Club Auth (needs a Slack account)
hc chat              talk with everyone on the site right now
hc prizes [n]        browse the prizes
hc rsvp              rsvp and get added to #tty on the Hack Club Slack
```

## How it is put together

- Next.js 16 serves one page with the terminal; `server.mjs` wraps it so the chat can use WebSockets.
- `src/lib/shell.ts` is the shell: prompt, line editing, history, tab completion, commands.
- `src/lib/features/` has one file per command.
- Login is Hack Club Auth; identity is the Slack ID. RSVPs live in Postgres. Chat is in memory and never stored.

See `AGENTS.md` for the full map, conventions and deployment notes.
