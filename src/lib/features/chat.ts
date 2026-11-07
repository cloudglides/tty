import { dim, magenta, nickColor, paint, red, yellow } from "../ansi";
import { ChatClient } from "../chat-client";
import { type ChatEvent, type ChatMessage, sanitize } from "../chat-types";
import type { Command, Ctx, Mode, Shell } from "../shell";
import { type User, currentUser } from "./auth";

const HELP = [
  "chat commands:",
  `  ${yellow("/who")}      who's here`,
  `  ${yellow("/clear")}    clear the screen`,
  `  ${yellow("/exit")}     leave the chat (or ctrl+d)`,
  "anything else is sent as a message.",
].join("\n");

const nick = (name: string) => paint(nickColor(name), sanitize(name));

class ChatMode implements Mode {
  private online = new Set<string>();
  private client: ChatClient;

  constructor(
    private shell: Shell,
    private me: User,
  ) {
    shell.println(dim(`joining #lobby as ${me.name}… type /help for commands, /exit to leave`));
    this.client = new ChatClient({
      onEvent: (event, reconnected) => this.onEvent(event, reconnected),
      onStatus: (message) => shell.printAbove(dim(`* ${message}`)),
      onFatal: (message) => shell.exitMode(red(`✗ ${message}`)),
    });
  }

  prompt() {
    return `${magenta("#lobby")} ${nick(this.me.name)}> `;
  }

  // the server echoes messages back, so don't keep the typed copy
  echo(line: string) {
    return !line || line.startsWith("/");
  }

  async onLine(line: string, { shell }: Ctx) {
    if (!line) return;
    if (!line.startsWith("/")) {
      const { error } = await this.client.send(line);
      if (error) shell.println(red(`* ${error}`));
      return;
    }

    const [cmd] = line.slice(1).split(/\s+/);
    switch (cmd) {
      case "help":
        return shell.println(HELP);
      case "who":
        return shell.println(`${this.online.size} here: ${[...this.online].map(nick).join(", ")}`);
      case "clear":
        return shell.clear();
      case "exit":
      case "quit":
      case "leave":
        return shell.exitMode(dim("left #lobby"));
      default:
        return shell.println(red(`unknown command /${sanitize(cmd)} (try /help)`));
    }
  }

  exit() {
    this.client.close();
  }

  private format(m: ChatMessage) {
    const time = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${dim(time)} ${nick(m.nick)}: ${sanitize(m.text)}`;
  }

  private onEvent(event: ChatEvent, reconnected: boolean) {
    switch (event.type) {
      case "welcome": {
        this.online = new Set(event.online);
        if (reconnected) return this.shell.printAbove(dim("* reconnected"));
        const lines = event.history.slice(-20).map((m) => this.format(m));
        const others = event.online.filter((n) => n !== event.nick);
        lines.push(dim(`* ${others.length ? `here: ${others.join(", ")}` : "nobody else is here yet"}`));
        return this.shell.printAbove(lines.join("\n"));
      }
      case "msg":
        return this.shell.printAbove(this.format(event));
      case "join":
        this.online.add(event.nick);
        return this.shell.printAbove(dim(`→ ${sanitize(event.nick)} joined`));
      case "leave":
        this.online.delete(event.nick);
        return this.shell.printAbove(dim(`← ${sanitize(event.nick)} left`));
    }
  }
}

export const chatCommand: Command = {
  name: "chat",
  help: [["hc chat", "talk with everyone here (needs login)"]],
  async run(_args, { shell }) {
    const me = await currentUser();
    if (!me) {
      shell.println(`${red("✗")} chat is only for Hack Club members · run ${yellow("hc auth login")} first`);
      return;
    }
    shell.enterMode(new ChatMode(shell, me));
  },
};
