import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage, InviteCodeSummary } from "../../../packages/protocol";
import {
  getUserById,
  getUserByNickname,
  createUser,
  getSession,
  getSessionByName,
  createSession,
  getSessionsForUser,
  getMembership,
  createMembership,
  getScenesForSession,
  getVisibleScenes,
  createScene,
  getScene,
  setSceneVisibility,
  createToken,
  getTokensForScene,
  moveToken,
  createInviteCode,
  getInviteCode,
  getInviteCodesForSession,
  useInviteCode,
  deleteInviteCode,
  type Role,
} from "./db.js";

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

        const session = createSession(name.trim(), state.user_id);
        const membership = createMembership(state.user_id, session.id, "gm");

        state.session_id = session.id;
        state.role = "gm";

        send(ws, {
          type: "SESSION_JOINED",
          payload: {
            session_id: session.id,
            session_name: session.name,
            member: { id: membership.id, nickname: state.nickname, role: "gm" },
            invite_codes: [],
            scenes: [],
            active_scene_id: "",
          },
        });
        return;
      }

      // --- SESSION_JOIN (via código de convite) ---
      if (data.type === "SESSION_JOIN") {
        const { code } = data.payload;

        const invite = getInviteCode(code.toUpperCase());
        if (!invite) {
          send(ws, { type: "SESSION_ERROR", payload: { message: "Código de convite inválido." } });
          return;
        }

        // Valida expiração e usos
        const now = Math.floor(Date.now() / 1000);
        if (invite.expires_at && invite.expires_at < now) {
          send(ws, { type: "SESSION_ERROR", payload: { message: "Código de convite expirado." } });
          return;
        }
        if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
          send(ws, { type: "SESSION_ERROR", payload: { message: "Código de convite esgotado." } });
          return;
        }

        const session = getSession(invite.session_id);
        if (!session) {
          send(ws, { type: "SESSION_ERROR", payload: { message: "Sessão não encontrada." } });
          return;
        }

        // Se já é membro, apenas entra sem criar membership nova
        const existing = getMembership(state.user_id, session.id);
        const membership = existing ?? createMembership(state.user_id, session.id, invite.role);

        if (!existing) useInviteCode(code.toUpperCase());

        state.session_id = session.id;
        state.role = membership.role;

        const scenes = membership.role === "gm"
          ? getScenesForSession(session.id)
          : getVisibleScenes(session.id);

        const rawInvites = membership.role === "gm"
          ? getInviteCodesForSession(session.id)
          : [];

        const invite_codes = rawInvites
          .map(toInviteSummary)
          .filter((i): i is InviteCodeSummary => i !== null);

        send(ws, {
          type: "SESSION_JOINED",
          payload: {
            session_id: session.id,
            session_name: session.name,
            member: { id: membership.id, nickname: state.nickname, role: membership.role },
            invite_codes,
            scenes: scenes.map((s) => ({ ...s, is_visible: s.is_visible === 1 })),
            active_scene_id: activeScenesPerSession.get(session.id) ?? "",
          },
        });
        return;
      }

      // --- SESSION_ENTER (sessão que já é membro) ---
      if (data.type === "SESSION_ENTER") {
        const { session_id } = data.payload;

        const membership = getMembership(state.user_id, session_id);
        if (!membership) {
          send(ws, { type: "SESSION_ERROR", payload: { message: "Você não é membro dessa sessão." } });
          return;
        }

        const session = getSession(session_id);
        if (!session) {
          send(ws, { type: "SESSION_ERROR", payload: { message: "Sessão não encontrada." } });
          return;
        }

        state.session_id = session.id;
        state.role = membership.role;

        const scenes = membership.role === "gm"
          ? getScenesForSession(session.id)
          : getVisibleScenes(session.id);

        const rawInvites = membership.role === "gm"
          ? getInviteCodesForSession(session.id)
          : [];

        const invite_codes = rawInvites
          .map(toInviteSummary)
          .filter((i): i is InviteCodeSummary => i !== null);

        send(ws, {
          type: "SESSION_JOINED",
          payload: {
            session_id: session.id,
            session_name: session.name,
            member: { id: membership.id, nickname: state.nickname, role: membership.role },
            invite_codes,
            scenes: scenes.map((s) => ({ ...s, is_visible: s.is_visible === 1 })),
            active_scene_id: activeScenesPerSession.get(session.id) ?? "",
          },
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

      // --- SCENE_CREATE ---
      if (data.type === "SCENE_CREATE") {
        if (state.role !== "gm") return;
        const scene = createScene(session_id, data.payload.name);
        broadcastToSession(session_id, {
          type: "SCENE_CREATED",
          payload: { id: scene.id, name: scene.name, is_visible: false },
        });
        return;
      }

      // --- SCENE_SWITCH ---
      if (data.type === "SCENE_SWITCH") {
        const { scene_id } = data.payload;
        const scene = getScene(scene_id);
        if (!scene) return;
        if (state.role === "player" && !scene.is_visible) return;
        if (state.role === "viewer" && !scene.is_visible) return;
        state.scene_id = scene_id;
        const tokens = getTokensForScene(scene_id);
        send(ws, { type: "SCENE_STATE", payload: { scene_id, tokens } });
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
        setSceneVisibility(scene_id, visible);
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
        const scene = getScene(scene_id);
        if (!scene || scene.session_id !== session_id) return;
        const token = createToken(scene_id, x, y);
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
        moveToken(id, x, y);
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