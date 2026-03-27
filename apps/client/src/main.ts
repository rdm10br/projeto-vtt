import { App } from "./engine/app";
import { SocketManager } from "./network/socket";
import { Grid } from "./engine/grid";
import { TokenManager } from "./engine/tokenManager";
import * as PIXI from "pixi.js";
// import {  } from "@engine/";

const app = new App();

await app.init();

const grid = new Grid(app.layers.grid);
const tokens = new TokenManager(app.layers.tokens);
const socket = new SocketManager("ws://localhost:3000");
const highlights = new Map<PIXI.Graphics, PIXI.Graphics>();

grid.draw(window.innerWidth, window.innerHeight);

// const token = tokens.create("t1", 100, 100);
let selectedToken: PIXI.Graphics | null = null;

const t1 = tokens.create("t1", 100, 100);
const t2 = tokens.create("t2", 200, 100);
const t3 = tokens.create("t3", 300, 100);

function createHighlight(token: PIXI.Graphics) {
  const highlight = new PIXI.Graphics();

  highlight.rect(0, 0, 50, 50);
  highlight.stroke({
    width: 2,
    color: 0x000000
  });

  highlight.visible = false;

  token.addChild(highlight);

  highlights.set(token, highlight);
}

[t1,t2,t3].forEach(token => {
  // let token = tokens.getId(selectedToken)!;
  createHighlight(token);
  // --- DRAG ---
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  token.eventMode = "static";
  token.cursor = "pointer";

  token.on("pointerdown", (event) => {
    isDragging = true;
    
    if (!selectedToken) return;
    // remove highlight anterior
    if (selectedToken) {
      const prevHighlight = highlights.get(selectedToken);
      if (prevHighlight) prevHighlight.visible = false;
    }
    selectedToken = token;

    // aplica highlight
    const highlight = highlights.get(token);
    if (highlight) highlight.visible = true;

    const parent = selectedToken.parent;
    if (!parent) return;

    const pos = event.getLocalPosition(parent);

    dragOffset.x = token.x - pos.x;
    dragOffset.y = token.y - pos.y;
  });

  app.app.stage.on("pointermove", (event) => {
    if (!isDragging) return;
    selectedToken = token;
    if (!selectedToken) return;
    const parent = selectedToken.parent;
    if (!parent) return;

    const pos = event.getLocalPosition(parent);

    token.x = pos.x + dragOffset.x;
    token.y = pos.y + dragOffset.y;
  });

  const stopDrag = () => {
    if (!isDragging) return;

    isDragging = false;

    isDragging = false;

    const snapped = grid.snapPoint(token.x, token.y);

    token.x = snapped.x;
    token.y = snapped.y;

    socket.send({
      type: "TOKEN_MOVE",
      payload: {
        id: tokens.getId(token)!,
        x: token.x,
        y: token.y
      }
    });
  };

  token.on("pointerup", stopDrag);
  token.on("pointerupoutside", stopDrag);

  // --- SOCKET ---
  socket.connect((data) => {
    if (data.type === "TOKEN_MOVE") {
      tokens.move(data.payload.id, data.payload.x, data.payload.y);
    }
  });
});