import { createServer } from "node:http";
import next from "next";
import { createChat } from "./server/chat.mjs";

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, port });
const handle = app.getRequestHandler();

await app.prepare();
const upgradeNext = app.getUpgradeHandler();
const chat = createChat();

const server = createServer((req, res) => handle(req, res));
server.on("upgrade", (req, socket, head) => {
  socket.on("error", () => socket.destroy());
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === chat.path) return chat.handleUpgrade(req, socket, head);
    upgradeNext(req, socket, head);
  } catch (err) {
    console.error("upgrade failed:", err);
    socket.destroy();
  }
});
server.listen(port, () => console.log(`> ready on http://localhost:${port} (${dev ? "dev" : "production"})`));
