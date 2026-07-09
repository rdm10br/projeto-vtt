import type { ClientMessage, ServerMessage } from "../../../../packages/protocol/index.ts";

export class SocketManager {
  private socket: WebSocket;
  private gameHandler: ((data: ServerMessage) => void) | null = null;
  private queue: ClientMessage[] = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    // Rede de segurança: garante o flush mesmo se algo chamar send()
    // antes de connect() ter sido chamado.
    this.socket.addEventListener("open", () => this.flushQueue());
  }

  connect(onMessage: (data: ServerMessage) => void) {
    this.socket.onopen = () => {
      console.log("Conectado ao servidor");
      this.flushQueue();
    };
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage;
      console.debug("WS recv:", data.type, (data as any).payload ?? "");
      onMessage(data);
    };
  }

  setGameHandler(handler: (data: ServerMessage) => void) {
    this.gameHandler = handler;
  }

  forwardToGame(data: ServerMessage) {
    this.gameHandler?.(data);
  }

  send(message: ClientMessage) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      // Ainda conectando (ou reconectando) — guarda e envia quando abrir.
      this.queue.push(message);
    }
  }

  private flushQueue() {
    while (this.queue.length > 0 && this.socket.readyState === WebSocket.OPEN) {
      const message = this.queue.shift()!;
      this.socket.send(JSON.stringify(message));
    }
  }
}