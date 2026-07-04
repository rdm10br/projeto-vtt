// Tipos de mensagens trocadas entre client e server.
// Importado pelos dois lados — qualquer mudança aqui gera erro de compilação
// em ambos simultaneamente.

// --- Entidades ---

export type Role = "gm" | "player";

export type Token = {
  id: string;
  x: number;
  y: number;
};

export type Scene = {
  id: string;
  name: string;
  is_visible: boolean;
};

export type InviteCodes = {
  player: string;
  gm: string;
};

export type Member = {
  id: string;
  nickname: string;
  role: Role;
};

export type SessionJoinedPayload = {
  session_id: string;
  session_name: string;
  member: Member;
  invite_codes: InviteCodes;  // só populado para GMs
  scenes: Scene[];
  active_scene_id: string;
};

export type SessionState = {
  session_id: string;
  scenes: Scene[];
  active_scene_id: string;
};

export type SceneState = {
  scene_id: string;
  tokens: Token[];
};

// --- Payloads Client → Server ---

export type SessionCreatePayload = {
  name: string;       // nome da sessão
  nickname: string;   // apelido do GM criador
};

export type SessionEnterPayload = {
  code: string;       // código de convite
  nickname: string;   // apelido do jogador
};

export type CreateScenePayload = {
  name: string;
};

export type SwitchScenePayload = {
  scene_id: string;
};

export type PushScenePayload = {
  scene_id: string;
};

export type SetSceneVisibilityPayload = {
  scene_id: string;
  visible: boolean;
};

export type TokenCreateRequestPayload = {
  scene_id: string;
  x: number;
  y: number;
};

export type TokenMovePayload = {
  id: string;
  x: number;
  y: number;
};

export type TokenCreatePayload = {
  id: string;
  scene_id: string;
  x: number;
  y: number;
};

// --- Mensagens Client → Server ---

export type ClientMessage =
  | { type: "PING"; payload: string }
  | { type: "SESSION_CREATE"; payload: SessionCreatePayload }
  | { type: "SESSION_ENTER"; payload: SessionEnterPayload }
  | { type: "SCENE_CREATE"; payload: CreateScenePayload }
  | { type: "SCENE_SWITCH"; payload: SwitchScenePayload }
  | { type: "SCENE_PUSH"; payload: PushScenePayload }
  | { type: "SCENE_SET_VISIBLE"; payload: SetSceneVisibilityPayload }
  | { type: "TOKEN_CREATE_REQUEST"; payload: TokenCreateRequestPayload }
  | { type: "TOKEN_MOVE"; payload: TokenMovePayload };

// --- Mensagens Server → Client ---

export type ServerMessage =
  | { type: "CONNECTED" }
  | { type: "SESSION_JOINED"; payload: SessionJoinedPayload }
  | { type: "SESSION_ERROR"; payload: { message: string } }
  | { type: "SCENE_STATE"; payload: SceneState }
  | { type: "SCENE_CREATED"; payload: Scene }
  | { type: "SCENE_PUSHED"; payload: PushScenePayload }
  | { type: "SCENE_VISIBILITY_CHANGED"; payload: SetSceneVisibilityPayload }
  | { type: "TOKEN_CREATE"; payload: TokenCreatePayload }
  | { type: "TOKEN_MOVE"; payload: TokenMovePayload };

// Union dos dois lados — útil para parsing genérico
export type Message = ClientMessage | ServerMessage;