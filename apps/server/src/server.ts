import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage, InviteCodeSummary } from "../../../packages/protocol";
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

const app = Fastify();

type ClientState = {
  ws: WebSocket;
  user_id: string | null;
  nickname: string;
  session_id: string | null;
  role: Role;
  scene_id: string | null;
};

const activeScenesPerSession = new Map<string, string>();
const clients = new Set<ClientState>();

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastToScene(
  session_id: string,
  scene_id: string,
  msg: ServerMessage,
  exclude?: WebSocket
) {
  for (const client of clients) {
    if (
      client.session_id === session_id &&
      client.scene_id === scene_id &&
      client.ws !== exclude
    ) {
      send(client.ws, msg);
    }
  }
}

function broadcastToSession(
  session_id: string,
  msg: ServerMessage,
  exclude?: WebSocket
) {
  for (const client of clients) {
    if (client.session_id === session_id && client.ws !== exclude) {
      send(client.ws, msg);
    }
  }
}

function sendToSessionMembers(
  session_id: string,
  nicknames: string[],
  msg: ServerMessage
) {
  for (const client of clients) {
    if (client.session_id === session_id && nicknames.includes(client.nickname)) {
      send(client.ws, msg);
    }
  }
}

function broadcastToGMs(session_id: string, msg: ServerMessage) {
  for (const client of clients) {
    if (client.session_id === session_id && client.role === "gm") {
      send(client.ws, msg);
    }
  }
}

function findSessionMember(session_id: string, nickname: string) {
  const normalized = nickname.trim().toLowerCase();
  for (const client of clients) {
    if (client.session_id === session_id && client.nickname.toLowerCase() === normalized) {
      return client;
    }
  }
  return undefined;
}

// Converte InviteCode do banco para o formato do protocol
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

    clients.add(state);
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

      // --- USER_LOGIN ---
      if (data.type === "USER_LOGIN") {
        const { nickname } = data.payload;

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
        return;
      }

      if (!state.user_id) {
        console.warn("Mensagem sem login, ignorando.");
        return;
      }

      // --- SESSION_CREATE ---
      if (data.type === "SESSION_CREATE") {
        const { name } = data.payload;

        if (getSessionByName(name.trim())) {
          send(ws, { type: "SESSION_ERROR", payload: { message: "Já existe uma sessão com esse nome." } });
          return;
        }

        const { session, membership } = createSessionForUser(state.user_id, state.nickname, name.trim());
        state.session_id = session.id;
        state.role = "gm";

        send(ws, {
          type: "SESSION_JOINED",
          payload: buildSessionJoinedPayload(session, membership, state.nickname),
        });
        return;
      }

      // --- SESSION_JOIN (via código de convite) ---
      if (data.type === "SESSION_JOIN") {
        const { code } = data.payload;
        const result = joinSessionByCode(state.user_id, code, state.nickname);

        if ("error" in result) {
          send(ws, { type: "SESSION_ERROR", payload: { message: result.error } });
          return;
        }

        const { session, membership } = result.result;
        state.session_id = session.id;
        state.role = membership.role;

        send(ws, {
          type: "SESSION_JOINED",
          payload: buildSessionJoinedPayload(session, membership, state.nickname, activeScenesPerSession.get(session.id)),
        });
        return;
      }

      // --- SESSION_ENTER (sessão que já é membro) ---
      if (data.type === "SESSION_ENTER") {
        const { session_id } = data.payload;
        const result = enterSession(state.user_id, session_id, state.nickname);

        if ("error" in result) {
          send(ws, { type: "SESSION_ERROR", payload: { message: result.error } });
          return;
        }

        const { session, membership } = result.result;
        state.session_id = session.id;
        state.role = membership.role;

        send(ws, {
          type: "SESSION_JOINED",
          payload: buildSessionJoinedPayload(session, membership, state.nickname, activeScenesPerSession.get(session.id)),
        });
        return;
      }

      if (!state.session_id) {
        console.warn("Mensagem sem sessão ativa, ignorando.");
        return;
      }

      const session_id = state.session_id;

      // --- INVITE_CREATE (GM only) ---
      if (data.type === "INVITE_CREATE") {
        if (state.role !== "gm") return;

        const { role, max_uses, expires_at } = data.payload;
        const code = createInviteCode({
          sessionId: session_id,
          role,
          createdBy: state.user_id,
          maxUses: max_uses,
          expiresAt: expires_at,
        });

        const invite = getInviteCode(code);
        const summary = toInviteSummary(invite);
        if (!summary) return;

        // Só envia para GMs da sessão
        broadcastToSession(session_id, { type: "INVITE_CREATED", payload: summary });
        return;
      }

      // --- INVITE_DELETE (GM only) ---
      if (data.type === "INVITE_DELETE") {
        if (state.role !== "gm") return;
        deleteInviteCode(data.payload.code);
        broadcastToSession(session_id, {
          type: "INVITE_DELETED",
          payload: { code: data.payload.code },
        });
        return;
      }

      // --- CHAT_SEND ---
      if (data.type === "CHAT_SEND") {
        if (!state.user_id) return;
        const rawText = data.payload.text.trim();
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
        return;
      }

      // --- SCENE_CREATE ---
      if (data.type === "SCENE_CREATE") {
        if (state.role !== "gm") return;
        const scene = createSceneForSession(session_id, data.payload.name);
        broadcastToSession(session_id, {
          type: "SCENE_CREATED",
          payload: { id: scene.id, name: scene.name, is_visible: true },
        });
        return;
      }

      // --- SCENE_SWITCH ---
      if (data.type === "SCENE_SWITCH") {
        const { scene_id } = data.payload;
        const scene = canEnterScene(scene_id, session_id, state.role);
        if (!scene) return;
        state.scene_id = scene_id;
        const sceneState = getSceneState(scene_id);
        send(ws, { type: "SCENE_STATE", payload: sceneState });
        return;
      }

      // --- SCENE_PUSH ---
      if (data.type === "SCENE_PUSH") {
        if (state.role !== "gm") return;
        const { scene_id } = data.payload;
        activeScenesPerSession.set(session_id, scene_id);
        broadcastToSession(session_id, { type: "SCENE_PUSHED", payload: { scene_id } });
        return;
      }

      // --- SCENE_SET_VISIBLE ---
        if (data.type === "SCENE_SET_VISIBLE") {
        if (state.role !== "gm") return;
        const { scene_id, visible } = data.payload;
        // use service wrapper
        setSceneVisibilityOnScene(scene_id, visible);
        broadcastToSession(session_id, {
          type: "SCENE_VISIBILITY_CHANGED",
          payload: { scene_id, visible },
        });
        return;
      }

      // --- TOKEN_CREATE_REQUEST (viewer não pode) ---
      if (data.type === "TOKEN_CREATE_REQUEST") {
        if (state.role === "viewer") return;
        const { scene_id, x, y } = data.payload;
        const token = createTokenOnScene(scene_id, x, y);
        broadcastToScene(session_id, scene_id, {
          type: "TOKEN_CREATE",
          payload: { id: token.id, scene_id, x, y },
        });
        return;
      }

      // --- TOKEN_MOVE (viewer não pode) ---
      if (data.type === "TOKEN_MOVE") {
        if (state.role === "viewer") return;
        const { id, x, y } = data.payload;
        moveTokenOnScene(id, x, y);
        if (state.scene_id) {
          broadcastToScene(session_id, state.scene_id, {
            type: "TOKEN_MOVE",
            payload: { id, x, y },
          }, ws);
        }
        return;
      }
    });

    ws.on("close", () => {
      clients.delete(state);
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