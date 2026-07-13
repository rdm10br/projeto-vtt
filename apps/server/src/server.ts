import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage } from "../../../packages/protocol";
import { getSessionBackup, importSessionBackup, type SessionBackup } from "./db";
import { clientRegistry, type ClientState } from "./clientRegistry.js";
import { dispatch } from "./ws/dispatch.js";
import { send } from "./ws/broadcast.js";

const app = Fastify();

function resolveClientDist(): string | null {
  const candidates = [
    path.join(__dirname, "../../../../client/dist"),
    path.join(__dirname, "../../../client/dist"),
    path.join(process.cwd(), "../client/dist"),
    path.join(process.cwd(), "apps/client/dist"),
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, "index.html"))) ?? null;
}

const clientDist = resolveClientDist();
if (clientDist) {
  app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/backup")) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const indexPath = path.join(clientDist!, "index.html");
    const html = fs.readFileSync(indexPath, "utf-8");
    reply.type("text/html").send(html);
  });
  console.log(`Servindo client estático de: ${clientDist}`);
} else {
  console.warn("Build do client não encontrado — rode `npm run build` em apps/client.");
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

  await app.listen({ port: PORT, host: "0.0.0.0" });
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

      dispatch(data, state, ws);
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