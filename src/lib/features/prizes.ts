import { bold, dim, red, yellow } from "../ansi";
import { imageToAnsi } from "../ansi-image";
import { sanitize } from "../chat-types";
import { PRIZES, type Prize } from "../prizes";
import type { Command, Shell } from "../shell";

async function showPrize(shell: Shell, prize: Prize, n: number, width: number) {
  shell.println(await imageToAnsi(prize.image, width, 2));
  shell.println(`  ${yellow(`[${n}]`)} ${bold(prize.name)}`);
  shell.println(`      ${dim(prize.description)}`);
  shell.println();
}

export const prizesCommand: Command = {
  name: "prizes",
  help: [["hc prizes [n]", "browse the prizes"]],
  async run(args, { shell, signal }) {
    if (args[0]) {
      const n = Number(args[0]);
      const prize = PRIZES[n - 1];
      if (!prize) return shell.println(red(`no prize #${sanitize(args[0])}, pick 1-${PRIZES.length}`));
      return showPrize(shell, prize, n, Math.min(64, shell.cols - 4));
    }
    for (const [i, prize] of PRIZES.entries()) {
      if (signal.aborted) return;
      await showPrize(shell, prize, i + 1, Math.min(36, shell.cols - 4));
    }
    shell.println(dim(`tip: ${yellow("hc prizes <n>")}${dim(" for a closer look")}`));
  },
};
