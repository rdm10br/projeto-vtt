import type { WebSocket } from "ws";
import type { ClientMessage } from "../../../../packages/protocol";
import type { ClientState } from "../clientRegistry.js";
import type { MessageHandler } from "../handlers/types.js";
import { userHandlers } from "../handlers/userHandlers.js";
import { sessionHandlers } from "../handlers/sessionHandlers.js";
import { inviteHandlers } from "../handlers/inviteHandlers.js";
import { chatHandlers } from "../handlers/chatHandlers.js";
import { sceneHandlers } from "../handlers/sceneHandlers.js";
import { tokenHandlers } from "../handlers/tokenHandlers.js";

const handlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  ...userHandlers,
  ...sessionHandlers,
  ...inviteHandlers,
  ...chatHandlers,
  ...sceneHandlers,
  ...tokenHandlers,
};

// Tipos que exigem login e/ou sessão ativa
const REQUIRES_LOGIN = new Set<ClientMessage["type"]>([
  "SESSION_CREATE", "SESSION_JOIN", "SESSION_ENTER",
  "INVITE_CREATE", "INVITE_DELETE", "CHAT_SEND",
  "SCENE_CREATE", "SCENE_SWITCH", "SCENE_PUSH", "SCENE_SET_VISIBLE",
  "TOKEN_CREATE_REQUEST", "TOKEN_MOVE",
]);

const REQUIRES_SESSION = new Set<ClientMessage["type"]>([
  "INVITE_CREATE", "INVITE_DELETE", "CHAT_SEND",
  "SCENE_CREATE", "SCENE_SWITCH", "SCENE_PUSH", "SCENE_SET_VISIBLE",
  "TOKEN_CREATE_REQUEST", "TOKEN_MOVE",
]);

export function dispatch(data: ClientMessage, state: ClientState, ws: WebSocket) {
  console.log("Mensagem recebida:", data.type);

  if (REQUIRES_LOGIN.has(data.type) && !state.user_id) {
    console.warn("Mensagem sem login, ignorando.");
    return;
  }

  if (REQUIRES_SESSION.has(data.type) && !state.session_id) {
    console.warn("Mensagem sem sessão ativa, ignorando.");
    return;
  }

  const handler = handlers[data.type];
  if (!handler) {
    console.warn("Tipo de mensagem sem handler registrado:", data.type);
    return;
  }

  handler((data as any).payload, { state, ws });
}