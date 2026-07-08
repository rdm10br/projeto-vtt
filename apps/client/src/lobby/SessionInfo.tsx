import { useState, useEffect } from "react";
import type { ChatMessage, InviteCodeSummary, Role } from "../../../../packages/protocol/index.ts";
import { SocketManager } from "../network/socket";

type SessionInfoProps = {
  session_id: string;
  sessionName: string;
  nickname: string;
  role: Role;
  invite_codes: InviteCodeSummary[];
  socket: SocketManager;
  chat?: ChatMessage[];
};

export function SessionInfo({ session_id, sessionName, nickname, role, invite_codes, socket, chat }: SessionInfoProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<Role>("player");
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"session" | "tokens" | "chat">(() => (role === "gm" ? "session" : "tokens"));
  const [detachedTab, setDetachedTab] = useState<null | "session" | "tokens" | "chat">(null);
  const [chatInput, setChatInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState<number>(380);
  const resizing = { active: false, startX: 0, startWidth: 380 } as { active: boolean; startX: number; startWidth: number };

  // Ajusta aba ativa se a role mudar (ex: jogador entra como player)
  useEffect(() => {
    if (role === "gm") setActiveTab("session");
    else setActiveTab("tokens");
  }, [role]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const origin = window.location.origin;

  function createInvite() {
    const max_uses = maxUses.trim() === "" ? undefined : parseInt(maxUses, 10);
    const expires_at = expiresAt.trim() === "" ? undefined : Math.floor(new Date(expiresAt).getTime() / 1000);
    socket.send({ type: "INVITE_CREATE", payload: { session_id, role: inviteRole, max_uses, expires_at } });
    // reset inputs
    setMaxUses("");
    setExpiresAt("");
  }

  function deleteInvite(code: string) {
    socket.send({ type: "INVITE_DELETE", payload: { code } });
  }

  function formatExpiry(expires_at: number | null): string {
    if (!expires_at) return "Permanente";
    const d = new Date(expires_at * 1000);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function roleLabel(r: Role) {
    return r === "gm" ? "GM" : r === "player" ? "Player" : "Viewer";
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    socket.send({ type: "CHAT_SEND", payload: { text: chatInput.trim() } });
    setChatInput("");
  }

  // FloatingPanel component for detached tabs
  function FloatingPanel({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string | null }) {
    const [pos, setPos] = useState({ x: 100, y: 100 });
    const drag = { active: false, startX: 0, startY: 0, sx: 0, sy: 0 } as any;

    function onMouseDown(e: React.MouseEvent) {
      drag.active = true;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      drag.sx = pos.x;
      drag.sy = pos.y;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
      if (!drag.active) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      setPos({ x: drag.sx + dx, y: drag.sy + dy });
    }

    function onMouseUp() {
      drag.active = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    return (
      <div style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 1000, width: 360, background: "#0f1720", border: "1px solid #2e303a", borderRadius: 8, padding: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "move" }} onMouseDown={onMouseDown}>
          <strong style={{ color: "#f3f4f6" }}>{title}</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ background: "transparent", border: "1px solid transparent", color: "#9ca3af" }}>✕</button>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>{children}</div>
      </div>
    );
  }

  function startResize(e: any) {
    resizing.active = true;
    resizing.startX = e.clientX;
    resizing.startWidth = width;
    document.addEventListener("mousemove", doResize);
    document.addEventListener("mouseup", stopResize);
  }

  function doResize(e: MouseEvent) {
    if (!resizing.active) return;
    const dx = resizing.startX - e.clientX; // because sidebar is on right
    let newW = resizing.startWidth + dx;
    const minW = 160;
    const maxW = 700;
    if (newW < minW) newW = minW;
    if (newW > maxW) newW = maxW;
    setWidth(newW);
  }

  function stopResize() {
    resizing.active = false;
    document.removeEventListener("mousemove", doResize);
    document.removeEventListener("mouseup", stopResize);
  }

  return (
    <>
      <div style={{ ...styles.panel, width: collapsed ? "48px" : `${width}px` }}>
        <div style={styles.resizer} onMouseDown={startResize} />
        <div style={styles.header}>
          <div style={{ display: collapsed ? "none" : "flex", alignItems: "center", gap: "8px" }}>
            <span style={styles.sessionName}>{sessionName}</span>
            <span style={{ ...styles.badge, ...(role === "gm" ? styles.badgeGm : styles.badgePlayer) }}>
              {roleLabel(role)}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button style={styles.collapseBtn} onClick={() => setCollapsed((s) => !s)}>{collapsed ? "›" : "‹"}</button>
          </div>
        </div>
        <span style={{ ...styles.nickname, display: collapsed ? "none" : undefined }}>{nickname}</span>

        <div style={{ ...styles.tabBar, flexDirection: collapsed ? "column" : "row" }}>
          {role === "gm" && (
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center", marginRight: 8 }}>
              <button
                style={{ ...styles.tabBtn, ...(activeTab === "session" ? styles.tabActive : {}), ...(collapsed ? styles.tabCollapsed : {}) }}
                onClick={() => setActiveTab("session")}
              >
                🗂 Sessão
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = detachedTab === "session" ? null : "session";
                    setDetachedTab(next);
                    if (next === "session") setActiveTab("chat");
                  }}
                  style={{ marginLeft: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                  title="Destacar"
                >
                  ⤢
                </span>
              </button>
            </div>
          )}
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", marginRight: 8 }}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === "tokens" ? styles.tabActive : {}), ...(collapsed ? styles.tabCollapsed : {}) }}
              onClick={() => setActiveTab("tokens")}
            >
              🔷 Tokens
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  const next = detachedTab === "tokens" ? null : "tokens";
                  setDetachedTab(next);
                  if (next === "tokens") setActiveTab(role === "gm" ? "session" : "chat");
                }}
                style={{ marginLeft: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                title="Destacar"
              >
                ⤢
              </span>
            </button>
          </div>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === "chat" ? styles.tabActive : {}), ...(collapsed ? styles.tabCollapsed : {}) }}
              onClick={() => setActiveTab("chat")}
            >
              💬 Chat
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  const next = detachedTab === "chat" ? null : "chat";
                  setDetachedTab(next);
                  if (next === "chat") setActiveTab(role === "gm" ? "session" : "tokens");
                }}
                style={{ marginLeft: 8, color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                title="Destacar"
              >
                ⤢
              </span>
            </button>
          </div>
        </div>

        {activeTab === "session" && detachedTab !== "session" && (
          <div style={styles.codes}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
              <p style={styles.codesTitle}>Convites <span style={styles.activeCount}>({invite_codes.length} ativos)</span></p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "6px" }}>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={{ background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px", padding: "4px" }}>
                <option value="player">Player</option>
                <option value="gm">GM</option>
                <option value="viewer">Viewer</option>
              </select>
              <input
                type="number"
                min="1"
                placeholder="Usos (vazio = ∞)"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                style={{ width: "110px", padding: "4px", background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px" }}
              />
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={{ padding: "4px", background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px" }}
              />
              <button style={{ ...styles.copyBtn, background: "#0f172a", color: "#f3f4f6" }} onClick={createInvite}>
                Novo convite
              </button>
            </div>

            {invite_codes.length > 0 ? (
              invite_codes.map((inv) => (
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
                  <button style={styles.copyBtn} onClick={() => deleteInvite(inv.code)}>Excluir</button>
                </div>
              ))
            ) : (
              <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "8px" }}>Nenhum convite ativo</div>
            )}
          </div>
        )}

        {activeTab === "tokens" && detachedTab !== "tokens" && (
          <div style={{ marginTop: "8px" }}>
            <p style={styles.codesTitle}>Tokens</p>
            {role === "viewer" ? (
              <div style={{ color: "#6b7280", fontSize: "12px" }}>Visualizadores não podem criar tokens</div>
            ) : (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  style={{ ...styles.copyBtn, background: "#aa3bff", color: "#fff", border: "none" }}
                  onClick={() => window.dispatchEvent(new CustomEvent("vtt-create-token"))}
                >
                  ➕
                </button>
                <div style={{ color: "#9ca3af", fontSize: "12px" }}>Clique para criar um token centralizado</div>
              </div>
            )}
          </div>
        )}
        {activeTab === "chat" && detachedTab !== "chat" && (
          <div style={{ marginTop: "8px" }}>
            <p style={styles.codesTitle}>Chat</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ maxHeight: "200px", overflowY: "auto", background: "#0f1115", padding: "8px", borderRadius: "6px" }}>
                {(chat ?? []).map((m) => (
                  <div key={m.id} style={{ marginBottom: "6px", color: "#e5e7eb" }}>
                    <strong style={{ color: "#93c5fd" }}>{m.sender}</strong>: <span>{m.text}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="Digite mensagem" style={{ flex: 1, padding: "6px", borderRadius: "6px", border: "1px solid #2e303a", background: "#0f172a", color: "#f3f4f6" }} />
                <button onClick={sendChat} style={{ ...styles.copyBtn, background: "#3b82f6", color: "#fff", border: "none" }}>Enviar</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Detached floating panel */}
      {detachedTab && (
        <FloatingPanel onClose={() => setDetachedTab(null)} title={detachedTab}>
          {detachedTab === "session" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={{ background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px", padding: "4px" }}>
                  <option value="player">Player</option>
                  <option value="gm">GM</option>
                  <option value="viewer">Viewer</option>
                </select>
                <input type="number" min="1" placeholder="Usos (vazio = ∞)" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} style={{ width: "110px", padding: "4px", background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px" }} />
                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={{ padding: "4px", background: "#0f172a", color: "#f3f4f6", border: "1px solid #2e303a", borderRadius: "4px" }} />
                <button style={{ ...styles.copyBtn, background: "#0f172a", color: "#f3f4f6" }} onClick={createInvite}>Novo convite</button>
              </div>
              <div>
                {invite_codes.length > 0 ? invite_codes.map((inv) => (
                  <div key={inv.code} style={styles.codeRow}>
                    <span style={styles.codeLabel}>{roleLabel(inv.role)}</span>
                    <code style={styles.code}>{inv.code}</code>
                    <span style={styles.expiry}>{inv.use_count}/{inv.max_uses ?? "∞"} · {formatExpiry(inv.expires_at)}</span>
                    <button style={styles.copyBtn} onClick={() => copy(inv.code, `code-${inv.code}`)}>{copied === `code-${inv.code}` ? "✓" : "Código"}</button>
                    <button style={styles.copyBtn} onClick={() => copy(`${origin}/?join=${inv.code}`, `link-${inv.code}`)}>{copied === `link-${inv.code}` ? "✓" : "Link"}</button>
                    <button style={styles.copyBtn} onClick={() => deleteInvite(inv.code)}>Excluir</button>
                  </div>
                )) : <div style={{ color: "#6b7280", fontSize: "12px" }}>Nenhum convite ativo</div>}
              </div>
            </div>
          )}
          {detachedTab === "tokens" && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button style={{ ...styles.copyBtn, background: "#aa3bff", color: "#fff", border: "none" }} onClick={() => window.dispatchEvent(new CustomEvent("vtt-create-token"))}>➕</button>
              <div style={{ color: "#9ca3af", fontSize: "12px" }}>Clique para criar um token centralizado</div>
            </div>
          )}
          {detachedTab === "chat" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ maxHeight: "300px", overflowY: "auto", background: "#0f1115", padding: "8px", borderRadius: "6px" }}>
                {(chat ?? []).map((m) => (
                  <div key={m.id} style={{ marginBottom: "6px", color: "#e5e7eb" }}>
                    <strong style={{ color: "#93c5fd" }}>{m.sender}</strong>: <span>{m.text}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="Digite mensagem" style={{ flex: 1, padding: "6px", borderRadius: "6px", border: "1px solid #2e303a", background: "#0f172a", color: "#f3f4f6" }} />
                <button onClick={sendChat} style={{ ...styles.copyBtn, background: "#3b82f6", color: "#fff", border: "none" }}>Enviar</button>
              </div>
            </div>
          )}
        </FloatingPanel>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100vh",
    zIndex: 100,
    background: "#1f2028",
    borderLeft: "1px solid #2e303a",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontFamily: "system-ui, sans-serif",
    width: "380px",
    overflowY: "auto",
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
  tabBar: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  tabBtn: {
    background: "transparent",
    border: "1px solid transparent",
    color: "#9ca3af",
    padding: "8px 12px",
    borderRadius: "6px 6px 0 0",
    cursor: "pointer",
  },
  tabActive: {
    background: "#0b1220",
    color: "#f3f4f6",
    border: "1px solid #3b82f6",
    boxShadow: "inset 0 -1px 0 0 #0b1220",
  },
  tabCollapsed: {
    padding: "6px 8px",
    borderRadius: "4px",
    writingMode: "vertical-rl",
    transform: "rotate(180deg)",
  },
  resizer: {
    position: "absolute",
    left: "-6px",
    top: 0,
    bottom: 0,
    width: "12px",
    cursor: "col-resize",
    zIndex: 200,
  },
  collapseBtn: {
    background: "transparent",
    border: "1px solid #2e303a",
    color: "#9ca3af",
    borderRadius: "6px",
    padding: "4px 6px",
    cursor: "pointer",
  },
  codesTitle: {
    margin: 0,
    color: "#9ca3af",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  activeCount: {
    color: "#9ca3af",
    fontSize: "12px",
    marginLeft: "6px",
    textTransform: "none",
  },
  detachBtn: {
    background: "transparent",
    border: "1px solid transparent",
    color: "#9ca3af",
    padding: "4px",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
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