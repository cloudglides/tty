import type { Command } from "./shell";

type Loader = () => Promise<Command>;

export function lazyCommand(name: string, help: Command["help"], load: Loader): Command {
  return {
    name,
    help,
    async run(args, ctx) {
      const command = await load();
      return command.run(args, ctx);
    },
  };
}
