export { CHAT_PATH, MAX_MESSAGE_LENGTH, sanitize } from "./chat-shared.mjs";

export type ChatUser = { id: string; nick: string };

export type ChatMessage = ChatUser & { text: string; ts: number; source?: "slack" };

export type ChatEvent =
  | ({ type: "welcome"; online: ChatUser[] } & ChatUser)
  | ({ type: "msg" } & ChatMessage)
  | ({ type: "join" } & ChatUser)
  | ({ type: "leave" } & ChatUser)
  | { type: "error"; error: string };

export const CLOSE_UNAUTHORIZED = 4001;
export const CLOSE_REFUSED = 4003;
