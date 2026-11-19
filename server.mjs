import { createServer } from "node:http";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { createChat } from "./server/chat.mjs";
import { createBtop } from "./server/pty.mjs";
import { buildClient } from "./scripts/client-build.mjs";
import { authPage } from "./server/auth-page.mjs";
import { baseUrl, html, json, origin, parseCookies, send, serializeCookie } from "./server/http.mjs";
import { HCA, SCOPES, STATE_COOKIE, exchangeCode, hcaConfig, redirectUri, slackDisplayName, userInfo } from "./server/hca.mjs";
import { clearSession, getSession, setSession } from "./server/session.mjs";
import { inviteToChannel, slackConfig } from "./server/slack-invite.mjs";
import { rsvpStore } from "./server/rsvp-store.mjs";
import { sanitize } from "./src/lib/chat-shared.mjs";

const dist = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";
const secure = process.env.NODE_ENV === "production";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 32;

if (dev || !existsSync(path.join(dist, "index.html"))) await buildClient();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function page(res, title, detail, ok, status = ok ? 200 : 400) {
  return html(res, status, authPage(title, detail, ok), { "cache-control": "no-store" });
}

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, "bad request\n", { "content-type": "text/plain" });
  }
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel.includes("\0")) return send(res, 400, "bad request\n", { "content-type": "text/plain" });

  const filePath = path.resolve(dist, "." + rel);
  if (!filePath.startsWith(dist)) return send(res, 403, "forbidden\n", { "content-type": "text/plain" });

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return send(res, 404, "not found\n", { "content-type": "text/plain" });
  }
  if (!stat.isFile()) return send(res, 404, "not found\n", { "content-type": "text/plain" });

  let file = filePath;
  let encoding = "";
  const accept = req.headers["accept-encoding"] ?? "";
  if (/\bbr\b/.test(accept) && existsSync(filePath + ".br")) {
    file += ".br";
    encoding = "br";
  } else if (/\bgzip\b/.test(accept) && existsSync(filePath + ".gz")) {
    file += ".gz";
    encoding = "gzip";
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    "content-type": TYPES[ext] ?? "application/octet-stream",
    "content-length": encoding ? statSync(file).size : stat.size,
    "cache-control": dev ? "no-store" : file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    etag: `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`,
  };
  if (encoding) {
    headers["content-encoding"] = encoding;
    headers.vary = "Accept-Encoding";
  }
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

function login(req, res, url) {
  let clientId;
  try {
    clientId = hcaConfig().clientId;
  } catch (err) {
    return html(res, 500, authPage("login isn't set up on this server", err.message, false), {
      "cache-control": "no-store",
    });
  }

  const state = randomBytes(16).toString("base64url");
  const target = new URL(`${HCA}/oauth/authorize`);
  target.searchParams.set("client_id", clientId);
  target.searchParams.set("redirect_uri", redirectUri(origin(req)));
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", SCOPES);
  target.searchParams.set("state", state);

  const email = url.searchParams.get("email")?.trim();
  if (email && EMAIL_RE.test(email)) {
    target.searchParams.set("email", email);
    target.searchParams.set("login_hint", email);
  }

  send(res, 307, "", {
    location: target.toString(),
    "cache-control": "no-store",
    "set-cookie": serializeCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "Lax",
      secure,
      path: "/api/auth",
      maxAge: 600,
    }),
  });
}

async function callback(req, res, url) {
  const params = url.searchParams;
  if (params.get("error")) return page(res, "login cancelled", "you can close this window and try again.", false);

  const state = params.get("state") ?? "";
  const expected = parseCookies(req.headers.cookie).get(STATE_COOKIE) ?? "";
  if (
    !state ||
    state.length !== expected.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(expected))
  ) {
    return page(res, "login expired", "run `hc auth login` again from the terminal.", false);
  }

  const code = params.get("code");
  if (!code) return page(res, "login failed", "no authorization code was returned.", false);

  try {
    const info = await userInfo(await exchangeCode(code, redirectUri(origin(req))));
    if (!info.slack_id) {
      return page(
        res,
        "no Slack account linked",
        "chat is for Hack Club Slack members. Link Slack to your Hack Club Auth account, then try again.",
        false,
      );
    }

    const raw = (await slackDisplayName(info.slack_id)) ?? info.nickname ?? info.name ?? info.slack_id;
    const name = sanitize(raw).slice(0, MAX_NAME) || info.slack_id;
    const headers = { "cache-control": "no-store" };
    setSession(headers, { sub: info.sub, slackId: info.slack_id, name });
    const clear = serializeCookie(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    headers["set-cookie"] = [...(Array.isArray(headers["set-cookie"]) ? headers["set-cookie"] : [headers["set-cookie"]]), clear];
    return html(res, 200, authPage(`logged in as ${name}`, "you can close this window and go back to the terminal.", true), headers);
  } catch (err) {
    console.error("hca callback failed", err);
    return page(res, "login failed", "something went wrong talking to Hack Club Auth. try again.", false, 502);
  }
}

function me(req, res) {
  const user = getSession(req);
  return json(res, user ? 200 : 401, { user: user && { name: user.name, slackId: user.slackId } });
}

function logout(res) {
  const headers = {};
  clearSession(headers);
  return json(res, 200, { ok: true }, headers);
}

async function rsvp(req, res, method) {
  const user = getSession(req);
  if (!user) return json(res, 401, { error: "not logged in" });

  if (method === "GET") {
    const rsvp = await rsvpStore.get(user.slackId);
    return json(res, 200, { rsvp: rsvp && { at: rsvp.at }, count: await rsvpStore.count() });
  }

  const { rsvp: record, created } = await rsvpStore.add({ slackId: user.slackId, name: user.name, sub: user.sub });
  const [slack, count] = await Promise.all([inviteToChannel(user.slackId), rsvpStore.count()]);
  const channel = slackConfig()?.channel;
  return json(res, 200, {
    created,
    at: record.at,
    count,
    slack,
    channelUrl: channel ? `https://hackclub.slack.com/archives/${channel}` : null,
  });
}

const routes = {
  "/api/auth/login": (req, res, url) => (req.method === "GET" ? login(req, res, url) : json(res, 405, { error: "method not allowed" })),
  "/api/auth/callback": (req, res, url) =>
    req.method === "GET" ? callback(req, res, url) : json(res, 405, { error: "method not allowed" }),
  "/api/auth/me": (req, res) => (req.method === "GET" ? me(req, res) : json(res, 405, { error: "method not allowed" })),
  "/api/auth/logout": (req, res) => (req.method === "POST" ? logout(res) : json(res, 405, { error: "method not allowed" })),
  "/api/rsvp": (req, res) =>
    ["GET", "POST"].includes(req.method) ? rsvp(req, res, req.method) : json(res, 405, { error: "method not allowed" }),
};

const server = createServer((req, res) => {
  if (req.headers["next-action"] !== undefined) {
    send(res, 400, "bad request\n", { "content-type": "text/plain" });
    return;
  }
  try {
    const url = baseUrl(req);
    const route = routes[url.pathname];
    if (route) return void Promise.resolve(route(req, res, url)).catch((err) => {
      console.error("route failed:", err);
      if (!res.headersSent) json(res, 500, { error: "internal server error" });
      else res.destroy();
    });
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "not found" });
    return void Promise.resolve(serveStatic(req, res, url.pathname)).catch((err) => {
      console.error("static failed:", err);
      if (!res.headersSent) send(res, 500, "internal server error\n", { "content-type": "text/plain" });
      else res.destroy();
    });
  } catch (err) {
    console.error("request failed:", err);
    if (!res.headersSent) send(res, 500, "internal server error\n", { "content-type": "text/plain" });
    else res.destroy();
  }
});

const chat = createChat();
const btop = createBtop();
server.on("upgrade", (req, socket, head) => {
  socket.on("error", () => socket.destroy());
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === chat.path) return chat.handleUpgrade(req, socket, head);
    if (pathname === btop.path) return btop.handleUpgrade(req, socket, head);
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
  } catch (err) {
    console.error("upgrade failed:", err);
    socket.destroy();
  }
});

if (dev) {
  let timer;
  for (const dir of ["src", "public", "scripts", "tuis"]) {
    try {
      watch(new URL(`./${dir}/`, import.meta.url), { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          buildClient().then(() => console.log("client rebuilt")).catch((err) => console.error("client rebuild failed:", err));
        }, 80);
      });
    } catch {
      console.error(`dev watch unavailable for ${dir}`);
    }
  }
}

server.listen(port, () => console.log(`> ready on http://localhost:${port} (${dev ? "dev" : "production"})`));
