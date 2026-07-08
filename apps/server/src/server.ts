import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage, InviteCodeSummary, CreateInvitePayload } from "../../../packages/protocol";
import {
  getUserById,
  getUserByNickname,
  createUser,
  getSessionByName,
  getSessionsForUser,
  createInviteCode,
  getInviteCode,
  getInviteCodesForSession,
  deleteInviteCode,
  getSessionBackup,
  importSessionBackup,
  type Role,
  type SessionBackup,
} from "./db.js";
import {
  buildSessionJoinedPayload,
  createSessionForUser,
  enterSession,
  joinSessionByCode,
  resolveActiveSceneId,
} from "./services/sessionService.js";
import { handleChatCommand } from "./services/chatService.js";
import {
  canEnterScene,
  createSceneForSession,
  createTokenOnScene,
  getSceneState,
  moveTokenOnScene,
  setSceneVisibilityOnScene,
} from "./services/gameService.js";
import { clientRegistry, type ClientState } from "./clientRegistry.js";

const app = Fastify();

const activeScenesPerSession = new Map<string, string>();

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendSceneState(ws: WebSocket, scene_id: string) {
  const sceneState = getSceneState(scene_id);
  send(ws, { type: "SCENE_STATE", payload: sceneState });
}

// --- Broadcasts (agora O(tamanho da sala/cena), não O(clients do servidor)) ---

function broadcastToScene(scene_id: string, msg: ServerMessage, exclude?: WebSocket) {
  for (const client of clientRegistry.inScene(scene_id)) {
    if (client.ws !== exclude) send(client.ws, msg);
  }
}

function broadcastToSession(session_id: string, msg: ServerMessage, exclude?: WebSocket) {
  for (const client of clientRegistry.inSession(session_id)) {
    if (client.ws !== exclude) send(client.ws, msg);
  }
}

function sendToSessionMembers(session_id: string, nicknames: string[], msg: ServerMessage) {
  for (const client of clientRegistry.inSession(session_id)) {
    if (nicknames.includes(client.nickname)) send(client.ws, msg);
  }
}

function broadcastToGMs(session_id: string, msg: ServerMessage) {
  for (const client of clientRegistry.inSession(session_id)) {
    if (client.role === "gm") send(client.ws, msg);
  }
}

function toInviteSummary(inv: ReturnType<typeof getInviteCode>): InviteCodeSummary | null {
  if (!inv) return null;
  return {
    code: inv.code,
    role: inv.role,
    use_count: inv.use_count,
    max_uses: inv.max_uses,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
  };
}

// --- Dispatch table ---

type HandlerContext = { state: ClientState; ws: WebSocket };
type MessageHandler = (payload: any, ctx: HandlerContext) => void;

function handlePing(_payload: string, _ctx: HandlerContext) {
  // no-op — mantém paridade com o comportamento anterior (PING nunca foi tratado)
}

function handleUserLogin(payload: { nickname: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const { nickname } = payload;

  if (!nickname.trim()) {
    send(ws, { type: "USER_ERROR", payload: { message: "Apelido inválido." } });
    return;
  }

  let user = getUserByNickname(nickname.trim());
  if (!user) user = createUser(nickname.trim());

  state.user_id = user.id;
  state.nickname = user.nickname;

  const sessions = getSessionsForUser(user.id);
  send(ws, {
    type: "USER_STATE",
    payload: { user_id: user.id, nickname: user.nickname, sessions },
  });
}

function handleSessionCreate(payload: { name: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const { name } = payload;

  if (getSessionByName(name.trim())) {
    send(ws, { type: "SESSION_ERROR", payload: { message: "Já existe uma sessão com esse nome." } });
    return;
  }

  const { session, membership } = createSessionForUser(state.user_id!, state.nickname, name.trim());
  clientRegistry.setSession(state, session.id);
  state.role = "gm";

  send(ws, {
    type: "SESSION_JOINED",
    payload: buildSessionJoinedPayload(session, membership, state.nickname),
  });
}

function handleSessionJoin(payload: { code: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const result = joinSessionByCode(state.user_id!, payload.code, state.nickname);

  if ("error" in result) {
    send(ws, { type: "SESSION_ERROR", payload: { message: result.error } });
    return;
  }

  const { session, membership } = result.result;
  clientRegistry.setSession(state, session.id);
  state.role = membership.role;

  const activeSceneId = resolveActiveSceneId(session.id, membership.role, activeScenesPerSession.get(session.id));
  if (activeSceneId) {
    clientRegistry.setScene(state, activeSceneId);
  }

  send(ws, {
    type: "SESSION_JOINED",
    payload: buildSessionJoinedPayload(session, membership, state.nickname, activeScenesPerSession.get(session.id)),
  });

  if (activeSceneId) {
    sendSceneState(ws, activeSceneId);
  }
}

function handleSessionEnter(payload: { session_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const result = enterSession(state.user_id!, payload.session_id, state.nickname);

  if ("error" in result) {
    send(ws, { type: "SESSION_ERROR", payload: { message: result.error } });
    return;
  }

  const { session, membership } = result.result;
  clientRegistry.setSession(state, session.id);
  state.role = membership.role;

  const activeSceneId = resolveActiveSceneId(session.id, membership.role, activeScenesPerSession.get(session.id));
  if (activeSceneId) {
    clientRegistry.setScene(state, activeSceneId);
  }

  send(ws, {
    type: "SESSION_JOINED",
    payload: buildSessionJoinedPayload(session, membership, state.nickname, activeScenesPerSession.get(session.id)),
  });

  if (activeSceneId) {
    sendSceneState(ws, activeSceneId);
  }
}

function handleInviteCreate(payload: CreateInvitePayload, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;

  const { role, max_uses, expires_at } = payload;
  const code = createInviteCode({
    sessionId: state.session_id!,
    role,
    createdBy: state.user_id!,
    maxUses: max_uses,
    expiresAt: expires_at,
  });

  const summary = toInviteSummary(getInviteCode(code));
  if (!summary) return;

  broadcastToSession(state.session_id!, { type: "INVITE_CREATED", payload: summary });
}

function handleInviteDelete(payload: { code: string }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  deleteInviteCode(payload.code);
  broadcastToSession(state.session_id!, { type: "INVITE_DELETED", payload: { code: payload.code } });
}

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

function handleSceneCreate(payload: { name: string }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  const scene = createSceneForSession(state.session_id!, payload.name);
  broadcastToSession(state.session_id!, {
    type: "SCENE_CREATED",
    payload: { id: scene.id, name: scene.name, is_visible: true },
  });
}

function handleSceneSwitch(payload: { scene_id: string }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  const scene = canEnterScene(payload.scene_id, state.session_id!, state.role);
  if (!scene) return;
  clientRegistry.setScene(state, payload.scene_id);
  sendSceneState(ws, payload.scene_id);
}

function handleScenePush(payload: { scene_id: string }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  const session_id = state.session_id!;
  const { scene_id } = payload;
  activeScenesPerSession.set(session_id, scene_id);

  for (const client of clientRegistry.inSession(session_id)) {
    clientRegistry.setScene(client, scene_id);
  }

  broadcastToSession(session_id, { type: "SCENE_PUSHED", payload: { scene_id } });
  broadcastToSession(session_id, { type: "SCENE_STATE", payload: getSceneState(scene_id) });
}

function handleSceneSetVisible(payload: { scene_id: string; visible: boolean }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role !== "gm") return;
  setSceneVisibilityOnScene(payload.scene_id, payload.visible);
  broadcastToSession(state.session_id!, {
    type: "SCENE_VISIBILITY_CHANGED",
    payload: { scene_id: payload.scene_id, visible: payload.visible },
  });
}

function handleTokenCreateRequest(payload: { scene_id: string; x: number; y: number }, ctx: HandlerContext) {
  const { state } = ctx;
  if (state.role === "viewer") return;
  const token = createTokenOnScene(payload.scene_id, payload.x, payload.y);
  broadcastToScene(payload.scene_id, {
    type: "TOKEN_CREATE",
    payload: { id: token.id, scene_id: payload.scene_id, x: payload.x, y: payload.y },
  });
}

function handleTokenMove(payload: { id: string; x: number; y: number }, ctx: HandlerContext) {
  const { state, ws } = ctx;
  if (state.role === "viewer") return;
  const { id, x, y } = payload;
  moveTokenOnScene(id, x, y);
  if (state.scene_id) {
    broadcastToScene(state.scene_id, { type: "TOKEN_MOVE", payload: { id, x, y } }, ws);
  }
}

const handlers: Partial<Record<ClientMessage["type"], MessageHandler>> = {
  PING: handlePing,
  USER_LOGIN: handleUserLogin,
  SESSION_CREATE: handleSessionCreate,
  SESSION_JOIN: handleSessionJoin,
  SESSION_ENTER: handleSessionEnter,
  INVITE_CREATE: handleInviteCreate,
  INVITE_DELETE: handleInviteDelete,
  CHAT_SEND: handleChatSend,
  SCENE_CREATE: handleSceneCreate,
  SCENE_SWITCH: handleSceneSwitch,
  SCENE_PUSH: handleScenePush,
  SCENE_SET_VISIBLE: handleSceneSetVisible,
  TOKEN_CREATE_REQUEST: handleTokenCreateRequest,
  TOKEN_MOVE: handleTokenMove,
};

// Tipos que exigem login e/ou sessão ativa — mantém as mesmas checagens que existiam no if-chain original.
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

app.get("/", async () => ({ status: "ok" }));

const start = async () => {
  const PORT = 3000;

  app.get("/backup/session/:session_id", async (request, reply) => {
    const session_id = (request.params as { session_id: string }).session_id;
    const backup = getSessionBackup(session_id);
    if (!backup) {
      reply.code(404);
      return { error: "Sessão não encontrada." };
    }
    return backup;
  });

  app.post("/backup/session/import", async (request, reply) => {
    const body = request.body as SessionBackup & { target_name?: string };
    if (!body || !body.session_name || !body.owner_nickname) {
      reply.code(400);
      return { error: "Backup inválido." };
    }

    const result = importSessionBackup(body, body.target_name);
    return { session_id: result.session.id, session_name: result.session.name, invite_codes: result.invite_codes };
  });

  await app.listen({ port: PORT });
  console.log(`HTTP server rodando na porta ${PORT}`);

  const wss = new WebSocketServer({ server: app.server });

  wss.on("connection", (ws: WebSocket) => {
    console.log("Client conectado");

    const state: ClientState = {
      ws,
      user_id: null,
      nickname: "",
      session_id: null,
      role: "player",
      scene_id: null,
    };

    clientRegistry.add(state);
    send(ws, { type: "CONNECTED" });

    ws.on("message", (raw) => {
      const text = raw.toString();
      let data: ClientMessage;

      try {
        data = JSON.parse(text) as ClientMessage;
      } catch {
        console.warn("Mensagem inválida, ignorando.");
        return;
      }

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
    });

    ws.on("close", () => {
      clientRegistry.remove(state);
      console.log("Client desconectado");
    });

    ws.on("error", (err) => {
      console.error("Erro no WebSocket:", err);
    });
  });
};

start().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});