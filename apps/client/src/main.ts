import { App } from "./engine/app";
import { SocketManager } from "./network/socket";
import { Grid } from "./engine/grid";
import { TokenManager } from "./engine/tokenManager";
import * as PIXI from "pixi.js";

const app = new App();
await app.init();

const grid = new Grid(app.layers.grid);
const tokens = new TokenManager(app.layers.tokens);
const socket = new SocketManager("ws://localhost:3000");

const highlights = new Map<PIXI.Graphics, PIXI.Graphics>();
let selectedToken: PIXI.Graphics | null = null;
let isDragging = false;
const dragOffset = { x: 0, y: 0 };

grid.draw(window.innerWidth, window.innerHeight);

// --- Setup tokens ---
const t1 = tokens.create("t1", 100, 100);
const t2 = tokens.create("t2", 200, 100);
const t3 = tokens.create("t3", 300, 100);

// --- Highlight helper ---
function createHighlight(token: PIXI.Graphics) {
  const highlight = new PIXI.Graphics();
  highlight.rect(0, 0, 50, 50).stroke({ width: 2, color: 0x000000 });
  highlight.visible = false;
  token.addChild(highlight);
  highlights.set(token, highlight);
}

// --- Global move listener (apenas 1) ---
app.app.stage.on("pointermove", (event) => {
  if (!isDragging || !selectedToken) return;

  const parent = selectedToken.parent;
  if (!parent) return;

  const pos = event.getLocalPosition(parent);
  selectedToken.x = pos.x + dragOffset.x;
  selectedToken.y = pos.y + dragOffset.y;
});

// --- Registra cada token ---
[t1, t2, t3].forEach((token) => {
  createHighlight(token);
  token.cursor = "pointer";
  token.eventMode = "static";

  token.on("pointerdown", (event) => {
    // Remove highlight anterior
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
});

// --- Rede ---
socket.connect((data) => {
  if (data.type === "TOKEN_MOVE") {
    tokens.move(data.payload.id, data.payload.x, data.payload.y);
  }
});