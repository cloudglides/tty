import { dim, error, link } from "../ansi";
import { sanitize } from "../chat-types";
import type { Command, Shell } from "../shell";
import { GUIDES } from "../../client/guide-registry.generated";

const absolute = (path: string) => new URL(path, location.origin).href;

function open(shell: Shell, path: string) {
  const url = absolute(path);
  if (window.open(url, "_blank")) shell.println(`${dim("opened in a new tab -->")} ${link(url)}`);
  else shell.println(`open ${link(url)}`);
}

export const guideCommand: Command = {
  name: "guide",
  help: [["hc guide [name]", "open the guides in your browser"]],
  async run(args, { shell }) {
    if (!args[0]) return open(shell, "/guides/");
    const guide = GUIDES.find((g) => g.name === args[0].toLowerCase());
    if (!guide) {
      shell.println(error(`no guide named ${sanitize(args[0])}`));
      return shell.println(`see all guides at ${link(absolute("/guides/"))}`);
    }
    open(shell, guide.url);
  },
};
