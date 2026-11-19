# Contributed TUIs

Every directory in `tuis/` with a `manifest.json` becomes a command in the terminal. The WASM file runs in a Web Worker in the visitor's browser. The server never executes contributed code.

## Add a TUI

```
tuis/my-app/
  manifest.json
  my-app.wasm
  my-app.wat          optional source, compiled by npm run tui:build
```

`manifest.json`:

```json
{
  "name": "my-app",
  "summary": "a short description shown in help",
  "wasm": "my-app.wasm"
}
```

- `name` must match the directory, be lowercase, and use only `a-z`, `0-9` and `-` (max 32 characters).
- `summary` must be 1-80 printable ASCII characters.
- `wasm` must be a `.wasm` file in the same directory, at most 2 MB.
- Reserved names: `help`, `about`, `clear`, `auth`, `chat`, `prizes`, `rsvp`, `btop`, `login`, `logout`, `whoami`.

The command is available as both `my-app` and `hc my-app`. Adding or changing a TUI triggers a rebuild in dev.

## Compile

The worker implements a subset of WASI preview1. Build a `wasm32-wasi` / `wasm32-wasip1` binary exporting `_start` (the default for wasi-sdk, Zig and Rust WASI targets):

Link with `--import-memory` so the worker supplies the capped 16 MB memory instead of the module defining its own:

```sh
clang --target=wasm32-wasi -Wl,--import-memory -Os -o my-app.wasm my-app.c
zig build-exe my-app.zig -target wasm32-wasi -OReleaseSmall -Wl,--import-memory -femit-bin=my-app.wasm
RUSTFLAGS="-C link-arg=--import-memory" cargo build --target wasm32-wasip1 --release
```

For WAT sources, name the file `<name>.wat` next to the manifest and run `npm run tui:build`. `npm run build` compiles it automatically too.

## Host ABI

Imports are limited to these functions. Anything else fails instantiation.

| Module | Function | Behaviour |
| --- | --- | --- |
| `wasi_snapshot_preview1` | `fd_write(fd, iovs, len, written)` | stdout (1) and stderr (2) render in the terminal. Other fds return `EBADF`. |
| `wasi_snapshot_preview1` | `fd_read(fd, iovs, len, read)` | stdin (0) only. Non-blocking: returns 0 bytes if no key is queued. Poll in a loop. Other fds return `EBADF`. |
| `wasi_snapshot_preview1` | `proc_exit(code)` | Ends the TUI. The prompt returns. |
| `wasi_snapshot_preview1` | `clock_time_get(clock, precision, ptr)` | Nanoseconds since epoch (`clock=0`) or monotonic time (`clock=1`). |
| `wasi_snapshot_preview1` | `random_get(ptr, len)` | Fills memory with cryptographic random bytes. |
| `env` | `tui_size(ptr)` | Writes `u32` columns at `ptr` and `u32` rows at `ptr + 4`. Call again after a resize. |
| `wasi_snapshot_preview1` | `environ_sizes_get`, `environ_get`, `args_sizes_get`, `args_get`, `fd_close`, `fd_seek`, `fd_fdstat_get`, `poll_oneoff`, `sched_yield` | Stubs. No environment variables, arguments or files are available. |

The module must import `env.memory` (256 pages / 16 MB); modules that define their own memory are rejected. Output is capped at 1 MB per second. The TUI is terminated when it exits, when Ctrl+C is pressed, or if it fails to start within 10 seconds. There is no DOM, `fetch`, filesystem, network or persistent storage.

Terminal output uses the same conventions as the shell: ASCII, lowercase, no decoration. ANSI colour and cursor escapes are fine.
