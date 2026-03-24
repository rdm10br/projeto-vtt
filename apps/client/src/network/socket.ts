export type Message =
  | { type: "TOKEN_MOVE"; payload: { id: string; x: number; y: number } }
  | { type: "PING"; payload: string };

export class SocketManager {
  private socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
  }

  connect(onMessage: (data: Message) => void) {
    this.socket.onopen = () => {
      console.log("Conectado ao servidor");
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };
  }

  send(message: Message) {
    this.socket.send(JSON.stringify(message));
  }
}