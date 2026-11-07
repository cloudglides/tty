export const MAX_MESSAGE_LENGTH = 300;
export const CHAT_PATH = "/api/chat";

export function sanitize(text) {
  return text.replace(/[\p{Cc}\p{Bidi_Control}]/gu, "").trim();
}
