import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "../../../packages/protocol";
import {
  createSession,
  getSession,
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
  createMember,
} from "./db.js";

const app = Fastify();

// --- Estado em memória por conexão ---
type ClientState = {
  ws: WebSocket;
  session_id: string | null;
  role: "gm" | "player";
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

      // --- SESSION_CREATE (GM cria uma sessão nova) ---
      if (data.type === "SESSION_CREATE") {
        const { name, nickname } = data.payload;

        const session = createSession(name);

        // Cria os dois códigos de convite
        const playerCode = createInviteCode(session.id, "player");
        const gmCode = createInviteCode(session.id, "gm");

        // Registra o GM criador como membro
        const member = createMember(session.id, nickname, "gm");

        state.session_id = session.id;
        state.role = "gm";

        send(ws, {
          type: "SESSION_JOINED",
          payload: {
            session_id: session.id,
            session_name: session.name,
            member: { id: member.id, nickname, role: "gm" },
            invite_codes: { player: playerCode, gm: gmCode },
            scenes: [],
            active_scene_id: "",
          },
        });
        return;
      }

      // --- SESSION_ENTER (jogador entra com código de convite) ---
      if (data.type === "SESSION_ENTER") {
        const { code, nickname } = data.payload;

        const invite = getInviteCode(code.toUpperCase());
        if (!invite) {
          send(ws, {
            type: "SESSION_ERROR",
            payload: { message: "Código de convite inválido." },
          });
          return;
        }

        const session = getSession(invite.session_id);
        if (!session) {
          send(ws, {
            type: "SESSION_ERROR",
            payload: { message: "Sessão não encontrada." },
          });
          return;
        }

        const member = createMember(session.id, nickname, invite.role);

        state.session_id = session.id;
        state.role = invite.role;

        const scenes =
          invite.role === "gm"
            ? getScenesForSession(session.id)
            : getVisibleScenes(session.id);

        const active_scene_id = activeScenesPerSession.get(session.id) ?? "";

        // Códigos de convite só são enviados para GMs
        const invite_codes =
          invite.role === "gm"
            ? getInviteCodesForSession(session.id)
            : { player: "", gm: "" };

        send(ws, {
          type: "SESSION_JOINED",
          payload: {
            session_id: session.id,
            session_name: session.name,
            member: { id: member.id, nickname, role: invite.role },
            invite_codes,
            scenes: scenes.map((s) => ({ ...s, is_visible: s.is_visible === 1 })),
            active_scene_id,
          },
        });
        return;
      }

      // As mensagens abaixo exigem sessão ativa
      if (!state.session_id) {
        console.warn("Mensagem recebida sem sessão ativa, ignorando.");
        return;
      }

      const session_id = state.session_id;

      // --- SCENE_CREATE (GM only) ---
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

        // Player só pode entrar em cenas visíveis
        if (state.role === "player" && !scene.is_visible) return;

        state.scene_id = scene_id;

        const tokens = getTokensForScene(scene_id);
        send(ws, {
          type: "SCENE_STATE",
          payload: { scene_id, tokens },
        });
        return;
      }

      // --- SCENE_PUSH (GM empurra cena para todos) ---
      if (data.type === "SCENE_PUSH") {
        if (state.role !== "gm") return;

        const { scene_id } = data.payload;
        activeScenesPerSession.set(session_id, scene_id);

        broadcastToSession(session_id, {
          type: "SCENE_PUSHED",
          payload: { scene_id },
        });
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

      // --- TOKEN_CREATE_REQUEST ---
      if (data.type === "TOKEN_CREATE_REQUEST") {
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

      // --- TOKEN_MOVE ---
      if (data.type === "TOKEN_MOVE") {
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