import { bold, dim, error, link, warning, yellow } from "../ansi";
import type { Command } from "../shell";
import { currentUser } from "./auth";

type RsvpResponse = {
  created: boolean;
  at: string;
  count: number;
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
      shell.println(error(`not logged in, run ${yellow("hc auth login")} first`));
      return;
    }

    shell.write(dim(`rsvping as ${me.name}...`));
    let res: Response;
    try {
      res = await fetch("/api/rsvp", { method: "POST", signal });
    } catch {
      shell.write("\r\x1b[2K");
      if (!signal.aborted) shell.println(error("could not reach the server, try again"));
      return;
    }
    shell.write("\r\x1b[2K");
    if (res.status === 401) return shell.println(error(`session expired, run ${yellow("hc auth login")}`));
    if (!res.ok) return shell.println(error(`rsvp failed (HTTP ${res.status}), try again`));

    const data = (await res.json()) as RsvpResponse;
    const when = new Date(data.at).toLocaleDateString([], { month: "short", day: "numeric" });
    if (data.created) shell.println(`rsvp confirmed for ${bold(me.name)}`);
    else shell.println(`already rsvped on ${when}`);
    shell.println(data.count === 1 ? "1 person has rsvped so far" : `${data.count} people have rsvped so far`);

    if (data.slack.ok) {
      const verb = data.slack.already ? "already in" : "added to";
      shell.println(`${verb} ${channel(data.channelUrl)} on the Hack Club Slack`);
    } else {
      shell.println(warning(`could not add you to ${channel(data.channelUrl)}: ${data.slack.reason}`));
      shell.println(dim(`run ${yellow("hc rsvp")}${dim(" again later, or join the channel yourself")}`));
    }
  },
};
