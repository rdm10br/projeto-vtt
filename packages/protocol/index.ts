// Tipos de mensagens trocadas entre client e server.
// Importado pelos dois lados — qualquer mudança aqui gera erro de compilação
// em ambos simultaneamente.

export type TokenMovePayload = {
  id: string;
  x: number;
  y: number;
};

export type TokenCreatePayload = {
  id: string;
  x: number;
  y: number;
};

export type Message =
  | { type: "PING"; payload: string }
  | { type: "CONNECTED" }
  | { type: "ECHO"; payload: unknown }
  | { type: "TOKEN_CREATE"; payload: TokenCreatePayload }
  | { type: "TOKEN_MOVE"; payload: TokenMovePayload };