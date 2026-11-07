import { bold, cyan, dim, green, link, red, yellow } from "../ansi";
import type { Command } from "../shell";
import { currentUser } from "./auth";

type RsvpResponse = {
  created: boolean;
  at: string;
  slack: { ok: true; already: boolean } | { ok: false; reason: string };
  channelUrl: string | null;
};

const channel = (url: string | null) => (url ? link(url, "#tty") : bold("#tty"));

export const rsvpCommand: Command = {
  name: "rsvp",
  help: [["hc rsvp", "RSVP and join #tty on Slack (needs login)"]],
  async run(_args, { shell, signal }) {
    const me = await currentUser();
    if (!me) {
      shell.println(`${red("✗")} you need to log in to RSVP · run ${yellow("hc auth login")} first`);
      return;
    }

    shell.write(`${cyan("⠋")} RSVPing as ${bold(me.name)}…`);
    let res: Response;
    try {
      res = await fetch("/api/rsvp", { method: "POST", signal });
    } catch {
      shell.write("\r\x1b[2K");
      if (!signal.aborted) shell.println(red("✗ couldn't reach the server, try again"));
      return;
    }
    shell.write("\r\x1b[2K");
    if (res.status === 401) return shell.println(`${red("✗")} your login expired · run ${yellow("hc auth login")}`);
    if (!res.ok) return shell.println(red(`✗ RSVP failed (HTTP ${res.status}), try again`));

    const data = (await res.json()) as RsvpResponse;
    const when = new Date(data.at).toLocaleDateString([], { month: "short", day: "numeric" });
    if (data.created) shell.println(`${green("✓")} you're RSVPed, ${bold(me.name)}!`);
    else shell.println(`${green("✓")} you already RSVPed ${dim(`on ${when}`)}`);

    if (data.slack.ok) {
      const verb = data.slack.already ? "you're already in" : "added you to";
      shell.println(`${green("✓")} ${verb} ${channel(data.channelUrl)} on the Hack Club Slack`);
    } else {
      shell.println(`${yellow("!")} couldn't add you to ${channel(data.channelUrl)}: ${data.slack.reason}`);
      shell.println(dim(`  run ${yellow("hc rsvp")}${dim(" again later, or join the channel yourself")}`));
    }
  },
};
