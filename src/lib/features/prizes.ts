import { bold, dim, green, red, yellow } from "../ansi";
import { imageToAnsi } from "../ansi-image";
import { sanitize } from "../chat-types";
import { PRIZES, type Prize } from "../prizes";
import type { Command, Shell } from "../shell";

const HOURS_WIDTH = Math.max(...PRIZES.map((prize) => prize.hours.length));

function prizeLine(prize: Prize, n: number) {
  return `  ${yellow(`[${n}]`.padEnd(4))} ${green(prize.hours.padEnd(HOURS_WIDTH))}  ${bold(prize.name)}`;
}

async function showPrize(shell: Shell, prize: Prize, n: number, width: number) {
  shell.println(await imageToAnsi(prize.image, width, 2));
  shell.println(prizeLine(prize, n));
  shell.println(`      ${dim(prize.description)}`);
  shell.println();
}

export const prizesCommand: Command = {
  name: "prizes",
  help: [["hc prizes [n]", "browse the prizes and their cost in hours"]],
  async run(args, { shell, signal }) {
    if (args[0]) {
      const n = Number(args[0]);
      const prize = PRIZES[n - 1];
      if (!prize) return shell.println(red(`no prize #${sanitize(args[0])}, pick 1-${PRIZES.length}`));
      return showPrize(shell, prize, n, Math.min(64, shell.cols - 4));
    }
    for (const [i, prize] of PRIZES.entries()) {
      if (signal.aborted) return;
      shell.println(prizeLine(prize, i + 1));
    }
    shell.println(dim("1 hour = $5 of prize value"));
    shell.println(dim(`tip: ${yellow("hc prizes <n>")}${dim(" for a closer look")}`));
  },
};
