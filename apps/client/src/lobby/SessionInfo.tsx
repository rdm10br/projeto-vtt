import { useState } from "react";
import type { InviteCodeSummary, Role } from "../../../../packages/protocol/index.ts";

type SessionInfoProps = {
  sessionName: string;
  nickname: string;
  role: Role;
  invite_codes: InviteCodeSummary[];
};

export function SessionInfo({ sessionName, nickname, role, invite_codes }: SessionInfoProps) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const origin = window.location.origin;

  function formatExpiry(expires_at: number | null): string {
    if (!expires_at) return "Permanente";
    const d = new Date(expires_at * 1000);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function roleLabel(r: Role) {
    return r === "gm" ? "GM" : r === "player" ? "Player" : "Viewer";
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.sessionName}>{sessionName}</span>
        <span style={{ ...styles.badge, ...(role === "gm" ? styles.badgeGm : styles.badgePlayer) }}>
          {roleLabel(role)}
        </span>
      </div>
      <span style={styles.nickname}>{nickname}</span>

      {role === "gm" && invite_codes.length > 0 && (
        <div style={styles.codes}>
          <p style={styles.codesTitle}>Convites ativos</p>
          {invite_codes.map((inv) => (
            <div key={inv.code} style={styles.codeRow}>
              <span style={styles.codeLabel}>{roleLabel(inv.role)}</span>
              <code style={styles.code}>{inv.code}</code>
              <span style={styles.expiry}>
                {inv.use_count}/{inv.max_uses ?? "∞"} · {formatExpiry(inv.expires_at)}
              </span>
              <button style={styles.copyBtn} onClick={() => copy(inv.code, `code-${inv.code}`)}>
                {copied === `code-${inv.code}` ? "✓" : "Código"}
              </button>
              <button style={styles.copyBtn} onClick={() => copy(`${origin}/?join=${inv.code}`, `link-${inv.code}`)}>
                {copied === `link-${inv.code}` ? "✓" : "Link"}
              </button>
            </div>
          ))}
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
    minWidth: "280px",
    maxWidth: "360px",
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
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "12px",
    fontWeight: 600,
  },
  badgeGm: {
    background: "rgba(170,59,255,0.15)",
    border: "1px solid rgba(170,59,255,0.4)",
    color: "#c084fc",
  },
  badgePlayer: {
    background: "rgba(59,130,246,0.15)",
    border: "1px solid rgba(59,130,246,0.4)",
    color: "#93c5fd",
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
    gap: "6px",
    flexWrap: "wrap",
  },
  codeLabel: {
    color: "#9ca3af",
    fontSize: "11px",
    width: "44px",
    flexShrink: 0,
  },
  code: {
    background: "#16171d",
    border: "1px solid #2e303a",
    borderRadius: "4px",
    padding: "2px 8px",
    color: "#f3f4f6",
    fontSize: "13px",
    letterSpacing: "0.12em",
    flexShrink: 0,
  },
  expiry: {
    color: "#6b7280",
    fontSize: "11px",
    flex: 1,
  },
  copyBtn: {
    background: "transparent",
    border: "1px solid #2e303a",
    borderRadius: "4px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "11px",
    padding: "2px 8px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
};