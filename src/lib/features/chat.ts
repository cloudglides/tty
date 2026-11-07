import { dim, error, magenta, nickColor, paint, red, yellow } from "../ansi";
import { ChatClient } from "../chat-client";
import { type ChatEvent, type ChatMessage, type ChatUser, sanitize } from "../chat-types";
import type { Command, Ctx, Mode, Shell } from "../shell";
import { type User, currentUser } from "./auth";

const HELP = [
  "chat commands:",
  `  ${yellow("/who")}      who's here`,
  `  ${yellow("/clear")}    clear the screen`,
  `  ${yellow("/exit")}     leave the chat (or ctrl+d)`,
  "anything else is sent as a message.",
  "names come from slack and can repeat, so colors and the #tag follow the account, not the name.",
].join("\n");

class ChatMode implements Mode {
  private online = new Map<string, string>();
  private client: ChatClient;
  private me: ChatUser;

  constructor(
    private shell: Shell,
    user: User,
  ) {
    this.me = { id: user.slackId, nick: user.name };
    shell.println(dim(`joining #lobby as ${user.name}, type /help for commands or /exit to leave`));
    this.client = new ChatClient({
      onEvent: (event, reconnected) => this.onEvent(event, reconnected),
      onStatus: (message) => shell.printAbove(dim(`* ${message}`)),
      onFatal: (message) => shell.exitMode(error(message)),
    });
  }

  prompt() {
    return `${magenta("#lobby")} ${this.name(this.me)}> `;
  }

  private name(user: ChatUser) {
    const shared = [...this.online].some(([id, nick]) => id !== user.id && nick === user.nick);
    const tag = shared ? dim(`#${user.id.slice(-4)}`) : "";
    return paint(nickColor(user.id), sanitize(user.nick)) + tag;
  }

  private users() {
    return [...this.online].map(([id, nick]) => ({ id, nick }));
  }

  echo(line: string) {
    return !line || line.startsWith("/");
  }

  async onLine(line: string, { shell }: Ctx) {
    if (!line) return;
    if (!line.startsWith("/")) {
      const error = this.client.send(line);
      if (error) shell.println(red(`* ${error}`));
      return;
    }

    const [cmd] = line.slice(1).split(/\s+/);
    switch (cmd) {
      case "help":
        return shell.println(HELP);
      case "who":
        return shell.println(`${this.online.size} here: ${this.users().map((u) => this.name(u)).join(", ")}`);
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
    const tag = m.source === "slack" ? `${dim("slack")} ` : "";
    return `${dim(time)} ${tag}${this.name(m)}: ${sanitize(m.text)}`;
  }

  private onEvent(event: ChatEvent, reconnected: boolean) {
    switch (event.type) {
      case "welcome": {
        this.online = new Map(event.online.map((u) => [u.id, u.nick]));
        if (reconnected) return this.shell.printAbove(dim("* reconnected"));
        const others = event.online.filter((u) => u.id !== event.id).map((u) => this.name(u));
        return this.shell.printAbove(dim(`* ${others.length ? `here: ${others.join(dim(", "))}` : "nobody else is here yet"}`));
      }
      case "msg":
        return this.shell.printAbove(this.format(event));
      case "join":
        this.online.set(event.id, event.nick);
        return this.shell.printAbove(dim(`--> ${this.name(event)}${dim(" joined")}`));
      case "leave":
        this.online.delete(event.id);
        return this.shell.printAbove(dim(`<-- ${this.name(event)}${dim(" left")}`));
      case "error":
        return this.shell.printAbove(red(`* ${sanitize(event.error)}`));
    }
  }
}

export const chatCommand: Command = {
  name: "chat",
  help: [["hc chat", "talk with everyone here (needs login)"]],
  async run(_args, { shell }) {
    const me = await currentUser();
    if (!me) {
      shell.println(error(`chat needs a Hack Club login, run ${yellow("hc auth login")} first`));
      return;
    }
    shell.enterMode(new ChatMode(shell, me));
  },
};
