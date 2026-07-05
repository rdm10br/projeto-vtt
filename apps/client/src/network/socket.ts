import type { ClientMessage, ServerMessage } from "../../../../packages/protocol/index.ts";

export class SocketManager {
  private socket: WebSocket;
  private gameHandler: ((data: ServerMessage) => void) | null = null;

  constructor(url: string) {
    this.socket = new WebSocket(url);
  }

  connect(onMessage: (data: ServerMessage) => void) {
    this.socket.onopen = () => console.log("Conectado ao servidor");
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage;
      console.debug("WS recv:", data.type, (data as any).payload ?? "");
      onMessage(data);
    };
  }

  // Registra o handler do PixiJS separadamente
  setGameHandler(handler: (data: ServerMessage) => void) {
    this.gameHandler = handler;
  }

  // App.tsx chama isso para repassar mensagens de jogo ao PixiJS
  forwardToGame(data: ServerMessage) {
    this.gameHandler?.(data);
  }

  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }
}