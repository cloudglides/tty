export type SessionPayload = { sub: string; slackId: string; name: string };
export const SESSION_COOKIE: string;
export const SESSION_MAX_AGE_S: number;
export function sessionSecret(): string;
export function signSession(user: SessionPayload): string;
export function verifySession(token: string): SessionPayload | null;
