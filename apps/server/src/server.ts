import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import type { Message } from "@packages/protocol";
// import type { Message } from "../../../packages/protocol";

const app = Fastify();

// Estado do mundo: guarda a última posição conhecida de cada token.
// Novos clientes recebem isso ao conectar, ficando em sincronia.
const tokenState = new Map<string, { x: number; y: number }>();

app.get("/", async () => {
  return { status: "ok" };
});

const start = async () => {
  // const PORT = process.env.PORT || 3000;
  const PORT = 3000;
  await app.listen({ port: PORT });
  console.log(`HTTP server rodando na porta ${PORT}`);

  const wss = new WebSocketServer({ server: app.server });

  wss.on("connection", (ws: WebSocket) => {
    console.log("Client conectado");

    // Envia confirmação de conexão
    const connectedMsg: Message = { type: "CONNECTED" };
    ws.send(JSON.stringify(connectedMsg));

    // Envia o estado atual do mundo para o novo cliente se sincronizar
    if (tokenState.size > 0) {
      tokenState.forEach((pos, id) => {
        const syncMsg: Message = {
          type: "TOKEN_MOVE",
          payload: { id, x: pos.x, y: pos.y },
        };
        ws.send(JSON.stringify(syncMsg));
      });
    }

    ws.on("message", (raw) => {
      // Valida que o dado recebido é uma string antes de parsear
      const text = raw.toString();
      let data: Message;

      try {
        data = JSON.parse(text) as Message;
      } catch {
        console.warn("Mensagem inválida recebida, ignorando.");
        return;
      }

      console.log("Mensagem recebida:", data);

      // Atualiza estado interno do servidor
      if (data.type === "TOKEN_MOVE") {
        tokenState.set(data.payload.id, {
          x: data.payload.x,
          y: data.payload.y,
        });
      }

      // Broadcast para todos os outros clientes — exclui o remetente
      // para evitar que o token "pule" duas vezes localmente
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    });

    ws.on("close", () => {
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