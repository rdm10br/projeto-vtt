import type { ClientMessage } from "../../../../packages/protocol";
import type { HandlerContext, MessageHandler } from "./types.js";
import { handleChatCommand } from "../services/chatService.js";
import { send, broadcastToSession, sendToSessionMembers, broadcastToGMs } from "../ws/broadcast.js";

function handleChatSend(payload: { text: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const session_id = state.session_id!;
  const rawText = payload.text.trim();
  handleChatCommand(
    rawText,
    session_id,
    { nickname: state.nickname, role: state.role },
    ws,
    (m) => send(ws, m),
    (sid, msg) => broadcastToSession(sid, msg),
    (sid, names, msg) => sendToSessionMembers(sid, names, msg),
    (sid, msg) => broadcastToGMs(sid, msg)
  );
}

export const chatHandlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  CHAT_SEND: handleChatSend,
};