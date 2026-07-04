import { useEffect, useRef, useState } from "react";
import { Lobby } from "./lobby/Lobby";
import { SessionInfo } from "./lobby/SessionInfo";
import { SocketManager } from "./network/socket";
import type { InviteCodes, Role, ServerMessage } from "../../../packages/protocol/index.ts";

type SessionData = {
  session_id: string;
  session_name: string;
  nickname: string;
  role: Role;
  invite_codes: InviteCodes;
  used_code: string;  // código usado para entrar — permite reentrada
};

const SESSION_KEY = "vtt_session";

function loadSavedSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch {
    return null;
  }
}

function saveSession(data: SessionData) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

type AppProps = {
  socket: SocketManager;
  onSessionJoined: (session_id: string, nickname: string, role: Role) => void;
};

export function App({ socket, onSessionJoined }: AppProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const pendingCode = useRef<string>("");
  const joinCodeFromUrl = new URLSearchParams(window.location.search).get("join");

  useEffect(() => {
    socket.connect((data: ServerMessage) => {
      if (data.type === "CONNECTED") {
        // Tenta reentrar na sessão salva automaticamente
        const saved = loadSavedSession();
        if (saved) {
          socket.send({
            type: "SESSION_ENTER",
            payload: { code: saved.used_code, nickname: saved.nickname },
          });
        }
        return;
      }
      
      if (data.type === "SESSION_JOINED") {
        const { session_id, session_name, member, invite_codes, scenes, active_scene_id } = data.payload;

        const usedCode =
        member.role === "gm"
          ? invite_codes.gm        // GM usa o próprio código GM para reentrar
          : pendingCode.current;

        const sessionData: SessionData = {
          session_id,
          session_name,
          nickname: member.nickname,
          role: member.role,
          invite_codes,
          used_code: usedCode,
        };

        saveSession(sessionData);
        setSession(sessionData);
        onSessionJoined(session_id, member.nickname, member.role);

        if (scenes.length === 0 && member.role === "gm") {
          socket.send({ type: "SCENE_CREATE", payload: { name: "Cena 1" } });
        } else {
          const targetId = active_scene_id || scenes[0]?.id;
          if (targetId) {
            socket.send({ type: "SCENE_SWITCH", payload: { scene_id: targetId } });
          }
        }
        return;
      }

      if (data.type === "SESSION_ERROR") {
        // Se falhou ao reentrar automaticamente, limpa o save e mostra o lobby
        clearSession();
        setServerError(data.payload.message);
        return;
      }

      socket.forwardToGame(data);
    });
  }, []);

  if (!session) {
    return (
      <Lobby
        initialCode={joinCodeFromUrl ?? ""}
        serverError={serverError}
        onSessionCreated={(name, nickname) => {
          setServerError(null);
          socket.send({ type: "SESSION_CREATE", payload: { name, nickname } });
        }}
        onSessionEntered={(code, nickname) => {
          pendingCode.current = code;
          setServerError(null);
          socket.send({ type: "SESSION_ENTER", payload: { code, nickname } });
        }}
      />
    );
  }

  return (
    <SessionInfo
      sessionName={session.session_name}
      nickname={session.nickname}
      role={session.role}
      invite_codes={session.invite_codes}
    />
  );
}