import type { InviteCodes, Role } from "../../../../packages/protocol/index.ts";
import { useState } from "react";

type SessionInfoProps = {
  sessionName: string;
  nickname: string;
  role: Role;
  invite_codes: InviteCodes;
};

export function SessionInfo({ sessionName, nickname, role, invite_codes }: SessionInfoProps) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const origin = window.location.origin;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.sessionName}>{sessionName}</span>
        <span style={styles.badge}>{role === "gm" ? "GM" : "Player"}</span>
      </div>
      <span style={styles.nickname}>{nickname}</span>

      {role === "gm" && (
        <div style={styles.codes}>
          <p style={styles.codesTitle}>Códigos de convite</p>

          <div style={styles.codeRow}>
            <span style={styles.codeLabel}>Player</span>
            <code style={styles.code}>{invite_codes.player}</code>
            <button style={styles.copyBtn} onClick={() => copy(invite_codes.player, "player-code")}>
              {copied === "player-code" ? "✓" : "Copiar"}
            </button>
            <button style={styles.copyBtn} onClick={() => copy(`${origin}/?join=${invite_codes.player}`, "player-link")}>
              {copied === "player-link" ? "✓" : "Link"}
            </button>
          </div>

          <div style={styles.codeRow}>
            <span style={styles.codeLabel}>GM</span>
            <code style={styles.code}>{invite_codes.gm}</code>
            <button style={styles.copyBtn} onClick={() => copy(invite_codes.gm, "gm-code")}>
              {copied === "gm-code" ? "✓" : "Copiar"}
            </button>
            <button style={styles.copyBtn} onClick={() => copy(`${origin}/?join=${invite_codes.gm}`, "gm-link")}>
              {copied === "gm-link" ? "✓" : "Link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: 100,
    background: "#1f2028",
    border: "1px solid #2e303a",
    borderRadius: "10px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontFamily: "system-ui, sans-serif",
    minWidth: "260px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sessionName: {
    color: "#f3f4f6",
    fontWeight: 600,
    fontSize: "15px",
  },
  badge: {
    background: "rgba(170,59,255,0.15)",
    border: "1px solid rgba(170,59,255,0.4)",
    color: "#c084fc",
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "12px",
    fontWeight: 600,
  },
  nickname: {
    color: "#9ca3af",
    fontSize: "13px",
  },
  codes: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "4px",
    borderTop: "1px solid #2e303a",
    paddingTop: "12px",
  },
  codesTitle: {
    margin: 0,
    color: "#9ca3af",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  codeRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  codeLabel: {
    color: "#9ca3af",
    fontSize: "12px",
    width: "40px",
  },
  code: {
    flex: 1,
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "4px",
    padding: "3px 8px",
    color: "#f3f4f6",
    fontSize: "14px",
    letterSpacing: "0.15em",
  },
  copyBtn: {
    background: "transparent",
    border: "1px solid #2e303a",
    borderRadius: "4px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "12px",
    padding: "3px 8px",
    whiteSpace: "nowrap",
  },
};