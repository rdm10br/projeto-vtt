const Fastify = require("fastify");
const WebSocket = require("ws");

const app = Fastify();

// HTTP server (necessário para acoplar o WS)
app.get("/", async () => {
  return { status: "ok" };
});

const start = async () => {
  await app.listen({ port: 3000 });

  // Cria servidor WebSocket usando o mesmo servidor HTTP
  const wss = new WebSocket.Server({ server: app.server });

  wss.on("connection", (ws) => {
    console.log("Client conectado");

    // envia mensagem inicial
    ws.send(JSON.stringify({ type: "CONNECTED" }));

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString());
      console.log("Mensagem recebida:", data);

      // eco (responde de volta)
      // ws.send(JSON.stringify({
      //   type: "ECHO",
      //   payload: data
      // }));
      
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    });

    ws.on("close", () => {
      console.log("Client desconectado");
    });
  });
};

start();