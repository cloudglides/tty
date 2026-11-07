import { blue, bold, dim, green, magenta, red, visibleLength, yellow } from "./ansi";
import { sanitize } from "./chat-types";

export interface TermLike {
  write(data: string): void;
  clear(): void;
  readonly cols: number;
}

export type Ctx = { shell: Shell; signal: AbortSignal };

export type Command = {
  name: string;
  help: [usage: string, summary: string][];
  run(args: string[], ctx: Ctx): Promise<void> | void;
};

export interface Mode {
  prompt(): string;
  echo?(line: string): boolean;
  onLine(line: string, ctx: Ctx): Promise<void> | void;
  exit(): void;
}

const HOME_PROMPT = `${green("hackclub")}@${magenta("ysws")} ${blue("~/tty")}> `;

export class Shell {
  private line = "";
  private cursor = 0;
  private drawnPos = 0;
  private history: string[] = [];
  private historyIndex = 0;

  private busy = false;
  private abort: AbortController | null = null;
  private pendingRead: { prompt: string; resolve: (line: string | null) => void } | null = null;
  private typeahead: string[] = [];
  private mode: Mode | null = null;

  private commands = new Map<string, Command>();
  private aliases = new Map<string, string[]>();

  constructor(private term: TermLike) {
    this.register({
      name: "help",
      help: [["help", "show this message"]],
      run: () => this.printHelp(),
    });
    this.register({
      name: "about",
      help: [["about", "what is this?"]],
      run: () =>
        this.println(
          [
            `${bold("tty")}: a Hack Club YSWS (You Ship, We Ship).`,
            "This terminal is Ghostty's VT engine (libghostty-vt) compiled to WebAssembly.",
          ].join("\n"),
        ),
    });
    this.register({
      name: "clear",
      help: [["clear", "clear the screen"]],
      run: () => this.clear(),
    });
  }

  get cols() {
    return this.term.cols;
  }

  register(command: Command) {
    this.commands.set(command.name, command);
  }

  alias(name: string, expansion: string[]) {
    this.aliases.set(name, expansion);
  }

  start() {
    this.render();
  }

  dispose() {
    this.abort?.abort();
    this.mode?.exit();
  }

  write(data: string) {
    this.term.write(data);
  }

  println(s = "") {
    this.term.write(s.replace(/\r?\n/g, "\r\n") + "\r\n");
  }

  printAbove(s: string) {
    if (this.busy && !this.pendingRead) return this.println(s);
    this.eraseInput();
    this.println(s);
    this.render();
  }

  clear() {
    this.term.clear();
  }

  private get prompt() {
    return this.pendingRead?.prompt ?? this.mode?.prompt() ?? HOME_PROMPT;
  }

  private eraseInput() {
    const rows = Math.floor(this.drawnPos / this.term.cols);
    this.term.write((rows ? `\x1b[${rows}A` : "") + "\r\x1b[J");
    this.drawnPos = 0;
  }

  private render() {
    this.eraseInput();
    const before = this.line.slice(0, this.cursor);
    const after = this.line.slice(this.cursor);
    this.term.write(this.prompt + before + (after ? `\x1b7${after}\x1b8` : ""));
    this.drawnPos = visibleLength(this.prompt) + this.cursor;
  }

  readLine(prompt: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.pendingRead = { prompt, resolve };
      this.line = "";
      this.cursor = 0;
      this.render();
      this.replayTypeahead();
    });
  }

  private replayTypeahead() {
    while (this.typeahead.length && !(this.busy && !this.pendingRead)) {
      this.handleInput(this.typeahead.shift()!);
    }
  }

  enterMode(mode: Mode) {
    this.mode = mode;
  }

  exitMode(message?: string) {
    const mode = this.mode;
    if (!mode) return;
    this.mode = null;
    mode.exit();
    if (message) this.printAbove(message);
    else if (!this.busy) this.render();
  }

  handleInput(data: string) {
    if (this.busy && !this.pendingRead) {
      if (data === "\x03") {
        this.typeahead = [];
        this.term.write("^C");
        this.abort?.abort();
      } else {
        this.typeahead.push(data);
      }
      return;
    }

    switch (data) {
      case "\x1b[A":
        return this.historyStep(-1);
      case "\x1b[B":
        return this.historyStep(1);
      case "\x1b[C":
        this.cursor = Math.min(this.line.length, this.cursor + 1);
        return this.render();
      case "\x1b[D":
        this.cursor = Math.max(0, this.cursor - 1);
        return this.render();
      case "\x1b[H":
      case "\x1bOH":
      case "\x01":
        this.cursor = 0;
        return this.render();
      case "\x1b[F":
      case "\x1bOF":
      case "\x05":
        this.cursor = this.line.length;
        return this.render();
      case "\x1b[3~":
        this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1);
        return this.render();
      case "\x03":
        this.term.write("^C\r\n");
        this.drawnPos = 0;
        this.line = "";
        this.cursor = 0;
        if (this.pendingRead) return this.finishRead(null);
        return this.render();
      case "\x04":
        if (this.mode && !this.line && !this.pendingRead) {
          this.term.write("\r\n");
          this.drawnPos = 0;
          this.exitMode();
        }
        return;
      case "\x15":
        this.line = this.line.slice(this.cursor);
        this.cursor = 0;
        return this.render();
      case "\x0c":
        this.term.write("\x1b[2J\x1b[3J\x1b[H");
        this.drawnPos = 0;
        return this.render();
    }
    if (data.startsWith("\x1b")) return;

    let changed = false;
    for (const ch of data) {
      if (ch === "\r") {
        void this.submit();
        return;
      } else if (ch === "\x7f" || ch === "\b") {
        if (this.cursor > 0) {
          this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
          this.cursor--;
          changed = true;
        }
      } else if (ch >= " ") {
        this.line = this.line.slice(0, this.cursor) + ch + this.line.slice(this.cursor);
        this.cursor++;
        changed = true;
      }
    }
    if (changed) this.render();
  }

  private historyStep(delta: number) {
    if (this.pendingRead) return;
    const i = this.historyIndex + delta;
    if (i < 0 || i > this.history.length) return;
    this.historyIndex = i;
    this.line = this.history[i] ?? "";
    this.cursor = this.line.length;
    this.render();
  }

  private finishRead(value: string | null) {
    const read = this.pendingRead!;
    this.pendingRead = null;
    read.resolve(value);
  }

  private commitLine() {
    this.cursor = this.line.length;
    this.render();
    this.term.write("\r\n");
    this.drawnPos = 0;
  }

  private async submit() {
    const input = this.line.trim();

    if (this.pendingRead) {
      this.commitLine();
      this.line = "";
      this.cursor = 0;
      return this.finishRead(input);
    }

    if (input && this.history.at(-1) !== input) this.history.push(input);
    this.historyIndex = this.history.length;

    const mode = this.mode;
    if (mode && mode.echo && !mode.echo(input)) this.eraseInput();
    else this.commitLine();
    this.line = "";
    this.cursor = 0;

    this.busy = true;
    this.abort = new AbortController();
    const ctx: Ctx = { shell: this, signal: this.abort.signal };
    try {
      if (mode) await mode.onLine(input, ctx);
      else await this.run(input, ctx);
    } catch (err) {
      if (!ctx.signal.aborted) {
        this.println(red(`error: ${err instanceof Error ? err.message : String(err)}`));
      }
    } finally {
      if (ctx.signal.aborted) this.term.write("\r\n");
      this.busy = false;
      this.abort = null;
      this.drawnPos = 0;
      this.render();
      this.replayTypeahead();
    }
  }

  private async run(input: string, ctx: Ctx) {
    let [name, ...args] = input.split(/\s+/);
    if (!name) return;

    if (name === "hc") {
      if (!args.length) return this.printHelp();
      [name, ...args] = args;
    }
    const expansion = this.aliases.get(name);
    if (expansion) [name, ...args] = [...expansion, ...args];

    const command = this.commands.get(name);
    if (!command) return this.println(`command not found: ${sanitize(name)}\n${dim("type")} ${yellow("help")} ${dim("to see what you can do")}`);
    await command.run(args, ctx);
  }

  private printHelp() {
    const rows = [...this.commands.values()].flatMap((c) => c.help);
    const width = Math.max(...rows.map(([usage]) => usage.length)) + 3;
    const lines = rows.map(([usage, summary]) => `  ${yellow(usage.padEnd(width))}${summary}`);
    const aliases = [...this.aliases.keys()].join(", ");
    this.println(
      [
        "usage: hc <command>",
        "",
        ...lines,
        "",
        dim(`shortcuts: ${aliases}`),
        dim("keys: ↑/↓ history · ←/→ move · ctrl+a/e start/end · ctrl+u clear line · ctrl+l clear · ctrl+c cancel"),
      ].join("\n"),
    );
  }
}
