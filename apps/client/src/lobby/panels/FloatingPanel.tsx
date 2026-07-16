import { useState } from "react";

type FloatingPanelProps = {
  title: string | null;
  onClose: () => void;
  children: React.ReactNode;
};

export function FloatingPanel({ title, onClose, children }: FloatingPanelProps) {
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