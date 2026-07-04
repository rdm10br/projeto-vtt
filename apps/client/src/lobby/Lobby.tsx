import { useState } from "react";
// import type { InviteCodes } from "../../../../packages/protocol/index.ts";

type LobbyProps = {
  initialCode?: string;
  serverError?: string | null;
  onSessionCreated: (name: string, nickname: string) => void;
  onSessionEntered: (code: string, nickname: string) => void;
};

type Tab = "create" | "enter";

export function Lobby({ initialCode, serverError, onSessionCreated, onSessionEntered }: LobbyProps) {
  const [tab, setTab] = useState<Tab>("create");
  const [nickname, setNickname] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [code, setCode] = useState<string>(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (!nickname.trim()) { setError("Digite seu apelido."); return; }
    if (!sessionName.trim()) { setError("Digite o nome da sessão."); return; }
    setError(null);
    onSessionCreated(sessionName.trim(), nickname.trim());
  }

  function handleEnter() {
    if (!nickname.trim()) { setError("Digite seu apelido."); return; }
    if (!code.trim()) { setError("Digite o código de convite."); return; }
    setError(null);
    onSessionEntered(code.trim().toUpperCase(), nickname.trim());
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>⚔️ VTT</h1>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === "create" ? styles.tabActive : {}) }}
            onClick={() => { setTab("create"); setError(null); }}
          >
            Criar sessão
          </button>
          <button
            style={{ ...styles.tab, ...(tab === "enter" ? styles.tabActive : {}) }}
            onClick={() => { setTab("enter"); setError(null); }}
          >
            Entrar em sessão
          </button>
        </div>

        {/* Campos comuns */}
        <div style={styles.field}>
          <label style={styles.label}>Seu apelido</label>
          <input
            style={styles.input}
            placeholder="Como quer ser chamado?"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (tab === "create" ? handleCreate() : handleEnter())}
          />
        </div>

        {tab === "create" && (
          <div style={styles.field}>
            <label style={styles.label}>Nome da sessão</label>
            <input
              style={styles.input}
              placeholder="Ex: Campanha do Dragão"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        )}

        {tab === "enter" && (
          <div style={styles.field}>
            <label style={styles.label}>Código de convite</label>
            <input
              style={{ ...styles.input, textTransform: "uppercase", letterSpacing: "0.2em" }}
              placeholder="Ex: XKCD42"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleEnter()}
            />
          </div>
        )}

        {(error || serverError) && (
          <p style={styles.error}>{error || serverError}</p>
        )}

        <button
          style={styles.btn}
          onClick={tab === "create" ? handleCreate : handleEnter}
        >
          {tab === "create" ? "Criar e entrar" : "Entrar"}
        </button>
      </div>
    </div>
  );
}

// --- Estilos inline para não depender de CSS externo ainda ---
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#16171d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1f2028",
    border: "1px solid #2e303a",
    borderRadius: "12px",
    padding: "40px",
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  title: {
    margin: 0,
    color: "#f3f4f6",
    fontSize: "28px",
    fontWeight: 600,
    textAlign: "center",
  },
  tabs: {
    display: "flex",
    gap: "8px",
  },
  tab: {
    flex: 1,
    padding: "8px",
    background: "transparent",
    border: "1px solid #2e303a",
    borderRadius: "6px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "14px",
    transition: "all 0.15s",
  },
  tabActive: {
    background: "rgba(170, 59, 255, 0.15)",
    borderColor: "rgba(170, 59, 255, 0.5)",
    color: "#c084fc",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    color: "#9ca3af",
    fontSize: "13px",
  },
  input: {
    padding: "10px 12px",
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "6px",
    color: "#f3f4f6",
    fontSize: "15px",
    outline: "none",
  },
  error: {
    margin: 0,
    color: "#f87171",
    fontSize: "13px",
  },
  btn: {
    padding: "12px",
    background: "#aa3bff",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
  },
};