type StartMessage = { type: "start"; url: string; cols: number; rows: number };
type InputMessage = { type: "key"; data: string };
type ResizeMessage = { type: "resize"; cols: number; rows: number };
type StopMessage = { type: "stop" };
type WorkerMessage = StartMessage | InputMessage | ResizeMessage | StopMessage;

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
};

const MAX_OUTPUT_PER_SECOND = 1_000_000;
const EXIT = Symbol("exit");

let memory = new WebAssembly.Memory({ initial: 16, maximum: 256 });
let cols = 80;
let rows = 24;
let windowStart = Date.now();
let windowBytes = 0;
let exited = false;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const input: number[] = [];

function post(message: unknown) {
  ctx.postMessage(message);
}

function view() {
  return new DataView(memory.buffer);
}

function write(bytes: Uint8Array) {
  const now = Date.now();
  if (now - windowStart > 1000) {
    windowStart = now;
    windowBytes = 0;
  }
  windowBytes += bytes.length;
  if (windowBytes > MAX_OUTPUT_PER_SECOND) throw new Error("tui exceeded output limit");
  post({ type: "out", data: decoder.decode(bytes, { stream: true }) });
}

const wasi = {
  fd_write(fd: number, iovs: number, iovsLen: number, nwrittenPtr: number) {
    if (fd !== 1 && fd !== 2) return 8;
    const dv = view();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (let i = 0; i < iovsLen; i++) {
      const ptr = dv.getUint32(iovs + i * 8, true);
      const len = dv.getUint32(iovs + i * 8 + 4, true);
      parts.push(new Uint8Array(memory.buffer, ptr, len));
      total += len;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.length;
    }
    write(merged);
    dv.setUint32(nwrittenPtr, total, true);
    return 0;
  },
  fd_read(fd: number, iovs: number, iovsLen: number, nreadPtr: number) {
    if (fd !== 0) return 8;
    const dv = view();
    let read = 0;
    for (let i = 0; i < iovsLen && input.length; i++) {
      const ptr = dv.getUint32(iovs + i * 8, true);
      const len = dv.getUint32(iovs + i * 8 + 4, true);
      const count = Math.min(len, input.length);
      for (let j = 0; j < count; j++) dv.setUint8(ptr + j, input.shift()!);
      read += count;
    }
    dv.setUint32(nreadPtr, read, true);
    return 0;
  },
  proc_exit(code: number) {
    post({ type: "exit", code });
    exited = true;
    throw EXIT;
  },
  clock_time_get(clock: number, _precision: number, ptr: number) {
    const ns = clock === 1 ? BigInt(Math.floor(performance.now() * 1e6)) : BigInt(Date.now()) * 1_000_000n;
    view().setBigInt64(ptr, ns, true);
    return 0;
  },
  random_get(ptr: number, len: number) {
    if (ptr + len > memory.buffer.byteLength) return 28;
    crypto.getRandomValues(new Uint8Array(memory.buffer, ptr, len));
    return 0;
  },
  environ_sizes_get(countPtr: number, sizePtr: number) {
    view().setUint32(countPtr, 0, true);
    view().setUint32(sizePtr, 0, true);
    return 0;
  },
  environ_get() {
    return 0;
  },
  args_sizes_get(countPtr: number, sizePtr: number) {
    view().setUint32(countPtr, 0, true);
    view().setUint32(sizePtr, 0, true);
    return 0;
  },
  args_get() {
    return 0;
  },
  fd_close() {
    return 0;
  },
  fd_seek() {
    return 29;
  },
  fd_fdstat_get(ptr: number) {
    view().setUint8(ptr, 2);
    return 0;
  },
  poll_oneoff() {
    return 0;
  },
  sched_yield() {
    return 0;
  },
};

const env = {
  memory,
  tui_size(ptr: number) {
    view().setUint32(ptr, cols, true);
    view().setUint32(ptr + 4, rows, true);
  },
};

async function start(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`tui fetch failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const imports = { wasi_snapshot_preview1: wasi, env };
  const result = await WebAssembly.instantiate(bytes, imports);
  const instance = result.instance;
  const usesHostMemory = WebAssembly.Module.imports(result.module).some(
    (entry) => entry.module === "env" && entry.name === "memory" && entry.kind === "memory",
  );
  if (!usesHostMemory) throw new Error("tui must import env.memory");
  post({ type: "ready", cols, rows });
  const entry = instance.exports._start ?? instance.exports.main;
  if (typeof entry === "function") (entry as () => void)();
  if (!exited) post({ type: "exit", code: 0 });
}

ctx.onmessage = (event) => {
  const message = event.data;
  if (message.type === "start") {
    start(message.url).catch((err: unknown) => post({ type: "error", error: String(err) }));
  } else if (message.type === "key") {
    for (const byte of encoder.encode(message.data)) input.push(byte);
  } else if (message.type === "resize") {
    cols = message.cols;
    rows = message.rows;
  }
};
