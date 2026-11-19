import { parseCookies, serializeCookie } from "./http.mjs";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, signSession, verifySession } from "../src/lib/session-token.mjs";

const options = {
  httpOnly: true,
  sameSite: "Lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function getSession(req) {
  const token = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
  return token ? verifySession(token) : null;
}

export function setSession(headers, user) {
  const cookie = serializeCookie(SESSION_COOKIE, signSession(user), { ...options, maxAge: SESSION_MAX_AGE_S });
  const existing = headers["set-cookie"];
  headers["set-cookie"] = existing ? [...(Array.isArray(existing) ? existing : [existing]), cookie] : cookie;
}

export function clearSession(headers) {
  const cookie = serializeCookie(SESSION_COOKIE, "", { ...options, maxAge: 0 });
  const existing = headers["set-cookie"];
  headers["set-cookie"] = existing ? [...(Array.isArray(existing) ? existing : [existing]), cookie] : cookie;
}
