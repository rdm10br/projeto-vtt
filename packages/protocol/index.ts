export type Message =
  | { type: "PING"; payload: string }
  | { type: "CONNECTED" }
  | { type: "ECHO"; payload: any }
  | { type: "TOKEN_CREATE"; payload: { id: string; x: number; y: number } }
  | { type: "TOKEN_MOVE"; payload: { id: string; x: number; y: number } }
  | { type: string; payload: any };