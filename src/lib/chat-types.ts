export type ChatMessage = { nick: string; text: string; ts: number };

export type ChatEvent =
  | { type: "welcome"; nick: string; online: string[]; history: ChatMessage[] }
  | ({ type: "msg" } & ChatMessage)
  | { type: "join"; nick: string }
  | { type: "leave"; nick: string };

export const MAX_MESSAGE_LENGTH = 300;

export function sanitize(text: string): string {
  return text.replace(/[\p{Cc}\p{Bidi_Control}]/gu, "").trim();
}
