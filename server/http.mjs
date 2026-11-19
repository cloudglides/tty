export function parseCookies(header = "") {
  const jar = new Map();
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try {
      jar.set(name, decodeURIComponent(value));
    } catch {
      jar.set(name, value);
    }
  }
  return jar;
}

export function serializeCookie(name, value, { path = "/", maxAge, httpOnly, sameSite, secure } = {}) {
  let out = `${name}=${encodeURIComponent(value)}; Path=${path}`;
  if (typeof maxAge === "number") out += `; Max-Age=${maxAge}`;
  if (httpOnly) out += "; HttpOnly";
  if (sameSite) out += `; SameSite=${sameSite}`;
  if (secure) out += "; Secure";
  return out;
}

export function send(res, status, body, headers = {}) {
  const out = { status, headers: { ...headers } };
  if (out.headers["set-cookie"] && !Array.isArray(out.headers["set-cookie"])) {
    out.headers["set-cookie"] = [out.headers["set-cookie"]];
  }
  res.writeHead(status, out.headers);
  res.end(body);
}

export function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
}

export function html(res, status, body, headers = {}) {
  send(res, status, body, { "content-type": "text/html; charset=utf-8", ...headers });
}

export function sameOrigin(req) {
  const header = req.headers.origin;
  if (!header) return false;
  try {
    const { host } = new URL(header);
    const allowed = [req.headers.host, process.env.APP_URL && new URL(process.env.APP_URL).host];
    return allowed.includes(host);
  } catch {
    return false;
  }
}

export function origin(req) {
  const proto = req.headers["x-forwarded-proto"] ?? (req.socket.encrypted ? "https" : "http");
  return `${proto}://${req.headers.host}`;
}

export function baseUrl(req) {
  return new URL(req.url ?? "/", origin(req));
}
