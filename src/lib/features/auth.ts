import { bold, cyan, dim, green, link, red, yellow } from "../ansi";
import type { Command, Ctx } from "../shell";

export type User = { name: string; slackId: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POLL_MS = 1000;
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const CLOSED_GRACE_MS = 3000;
const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

export async function currentUser(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { user: User | null }).user;
  } catch {
    return null;
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

const loggedInAs = (u: User) => `${bold(u.name)} ${dim(`(slack ${u.slackId})`)}`;

async function login({ shell, signal }: Ctx) {
  const existing = await currentUser();
  if (existing) {
    shell.println(`already logged in as ${loggedInAs(existing)}`);
    shell.println(dim(`run ${yellow("hc auth logout")}${dim(" to switch accounts")}`));
    return;
  }

  shell.println(`${bold("Hack Club Auth")} ${dim("· chat is for Hack Club Slack members")}`);
  const email = await shell.readLine(`${cyan("?")} enter your email: `);
  if (email === null) return;
  if (!EMAIL_RE.test(email)) return shell.println(red("✗ that doesn't look like an email"));

  const url = new URL(`/api/auth/login?email=${encodeURIComponent(email)}`, location.origin).href;
  const popup = window.open(url, "hca-login", "popup,width=520,height=760");
  if (popup) shell.println(`${dim("opening your browser…")} ${dim("(didn't open? ")}${link(url, "click here")}${dim(")")}`);
  else shell.println(`open this link to log in: ${link(url)}`);

  const started = Date.now();
  let closedAt: number | null = null;
  for (let tick = 0; !signal.aborted; tick++) {
    shell.write(`\r\x1b[2K${cyan(SPINNER[tick % SPINNER.length])} waiting for you to log in in the browser ${dim("(ctrl+c to cancel)")}`);
    await sleep(POLL_MS, signal);
    if (signal.aborted) break;

    const user = await currentUser();
    if (user) {
      shell.write("\r\x1b[2K");
      shell.println(`${green("✓")} logged in as ${loggedInAs(user)}`);
      shell.println(dim(`try ${yellow("hc chat")}${dim(" to talk with everyone here")}`));
      return;
    }

    if (popup?.closed) closedAt ??= Date.now();
    if (closedAt && Date.now() - closedAt > CLOSED_GRACE_MS) {
      shell.write("\r\x1b[2K");
      return shell.println(red("✗ the login window was closed before finishing"));
    }
    if (Date.now() - started > LOGIN_TIMEOUT_MS) {
      shell.write("\r\x1b[2K");
      return shell.println(red("✗ login timed out, run hc auth login to try again"));
    }
  }
  shell.write("\r\x1b[2K");
  popup?.close();
}

async function logout({ shell }: Ctx) {
  const user = await currentUser();
  if (!user) return shell.println("you're not logged in");
  await fetch("/api/auth/logout", { method: "POST" });
  shell.println(`logged out ${dim(`(was ${user.name})`)}`);
}

async function status({ shell }: Ctx) {
  const user = await currentUser();
  if (user) shell.println(`logged in as ${loggedInAs(user)}`);
  else shell.println(`not logged in · run ${yellow("hc auth login")}`);
}

export const authCommand: Command = {
  name: "auth",
  help: [
    ["hc auth login", "log in with Hack Club Auth"],
    ["hc auth status", "who you're logged in as"],
    ["hc auth logout", "log out"],
  ],
  run(args, ctx) {
    switch (args[0]) {
      case "login":
        return login(ctx);
      case "logout":
        return logout(ctx);
      case "status":
      case undefined:
        return status(ctx);
      default:
        ctx.shell.println(`usage: hc auth ${yellow("login")}|${yellow("status")}|${yellow("logout")}`);
    }
  },
};
