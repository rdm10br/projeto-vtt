import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { SocketManager } from "./network/socket.js";
import { App as PixiApp } from "./engine/app.js";
import { Grid } from "./engine/grid.js";
import { TokenManager } from "./engine/tokenManager.js";
import type { Role, ServerMessage } from "../../../packages/protocol/index.js";
import * as PIXI from "pixi.js";

// --- PixiJS setup ---
const pixiApp = new PixiApp();
await pixiApp.init();

const grid = new Grid(pixiApp.layers.grid);
const tokens = new TokenManager(pixiApp.layers.tokens);

grid.draw(window.innerWidth, window.innerHeight);

let currentSceneId: string | null = null;
const highlights = new Map<PIXI.Graphics, PIXI.Graphics>();
let selectedToken: PIXI.Graphics | null = null;
let isDragging = false;
const dragOffset = { x: 0, y: 0 };

// --- Token helpers ---
function createHighlight(token: PIXI.Graphics) {
  const highlight = new PIXI.Graphics();
  highlight.rect(0, 0, 50, 50).stroke({ width: 2, color: 0x000000 });
  highlight.visible = false;
  token.addChild(highlight);
  highlights.set(token, highlight);
}

function registerToken(token: PIXI.Graphics) {
  createHighlight(token);
  token.cursor = "pointer";
  token.eventMode = "static";

  token.on("pointerdown", (event) => {
    if (selectedToken) {
      const prev = highlights.get(selectedToken);
      if (prev) prev.visible = false;
    }
    selectedToken = token;
    isDragging = true;
    const highlight = highlights.get(token);
    if (highlight) highlight.visible = true;
    const parent = token.parent;
    if (!parent) return;
    const pos = event.getLocalPosition(parent);
    dragOffset.x = token.x - pos.x;
    dragOffset.y = token.y - pos.y;
  });

  const stopDrag = () => {
    if (!isDragging || !selectedToken) return;
    isDragging = false;
    const snapped = grid.snapPoint(selectedToken.x, selectedToken.y);
    selectedToken.x = snapped.x;
    selectedToken.y = snapped.y;
    socket.send({
      type: "TOKEN_MOVE",
      payload: {
        id: tokens.getId(selectedToken)!,
        x: selectedToken.x,
        y: selectedToken.y,
      },
    });
  };

  token.on("pointerup", stopDrag);
  token.on("pointerupoutside", stopDrag);
}

pixiApp.app.stage.on("pointermove", (event) => {
  if (!isDragging || !selectedToken) return;
  const parent = selectedToken.parent;
  if (!parent) return;
  const pos = event.getLocalPosition(parent);
  selectedToken.x = pos.x + dragOffset.x;
  selectedToken.y = pos.y + dragOffset.y;
});

// --- Botão criar token ---
const createBtn = document.createElement("button");
createBtn.textContent = "+ Token";
Object.assign(createBtn.style, {
  position: "fixed",
  top: "16px",
  left: "16px",
  zIndex: "100",
  padding: "8px 16px",
  background: "#aa3bff",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "14px",
  fontFamily: "system-ui, sans-serif",
});
createBtn.style.display = "none"; // esconde até entrar na sessão
createBtn.addEventListener("click", () => {
  if (!currentSceneId) return;
  const x = grid.snap(window.innerWidth / 2);
  const y = grid.snap(window.innerHeight / 2);
  socket.send({
    type: "TOKEN_CREATE_REQUEST",
    payload: { scene_id: currentSceneId, x, y },
  });
});
document.body.appendChild(createBtn);

// --- Handler de mensagens de jogo (PixiJS) ---
function handleGameMessage(data: ServerMessage) {
  if (data.type === "SCENE_CREATED") {
    currentSceneId = data.payload.id;
    socket.send({ type: "SCENE_SWITCH", payload: { scene_id: data.payload.id } });
    return;
  }

  if (data.type === "SCENE_STATE") {
    currentSceneId = data.payload.scene_id;
    tokens.clear();
    for (const t of data.payload.tokens) {
      const token = tokens.create(t.id, t.x, t.y);
      registerToken(token);
    }
    return;
  }

  if (data.type === "SCENE_PUSHED") {
    tokens.clear();
    currentSceneId = null;
    socket.send({ type: "SCENE_SWITCH", payload: { scene_id: data.payload.scene_id } });
    return;
  }

  if (data.type === "TOKEN_CREATE") {
    const token = tokens.create(data.payload.id, data.payload.x, data.payload.y);
    registerToken(token);
    return;
  }

  if (data.type === "TOKEN_MOVE") {
    tokens.move(data.payload.id, data.payload.x, data.payload.y);
    return;
  }
}

// --- Socket ---
const socket = new SocketManager("ws://localhost:3000");
socket.setGameHandler(handleGameMessage);

// --- React mount ---
const root = createRoot(document.getElementById("app")!);

root.render(
  <StrictMode>
    <App
      socket={socket}
      onSessionJoined={(_session_id, _role: Role) => {
        createBtn.style.display = "block";
      }}
    />
  </StrictMode>
);