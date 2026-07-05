import { useState } from "react";

type LoginProps = {
  onLogin: (nickname: string) => void;
  error?: string | null;
};

export function Login({ onLogin, error }: LoginProps) {
  const [nickname, setNickname] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handle() {
    if (!nickname.trim()) { setLocalError("Digite um apelido."); return; }
    setLocalError(null);
    onLogin(nickname.trim());
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>⚔️ VTT</h1>
        <p style={styles.subtitle}>Digite seu apelido para entrar</p>

        <div style={styles.field}>
          <input
            style={styles.input}
            placeholder="Seu apelido"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            autoFocus
          />
        </div>

        {(localError || error) && (
          <p style={styles.error}>{localError || error}</p>
        )}

        <button style={styles.btn} onClick={handle}>
          Entrar
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#16171d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1f2028",
    border: "1px solid #2e303a",
    borderRadius: "12px",
    padding: "40px",
    width: "100%",
    maxWidth: "360px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  title: {
    margin: 0,
    color: "#f3f4f6",
    fontSize: "28px",
    fontWeight: 600,
    textAlign: "center",
  },
  subtitle: {
    margin: 0,
    color: "#9ca3af",
    fontSize: "14px",
    textAlign: "center",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
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