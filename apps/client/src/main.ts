import { App } from "./engine/app";
import { TokenManager } from "./engine/tokenManager";
import { SocketManager } from "./network/socket";
// import {  } from "@engine/";

const app = new App();

await app.init();

const tokens = new TokenManager(app.layers.tokens);
const socket = new SocketManager("ws://localhost:3000");

const token = tokens.create("t1", 100, 100);

// --- DRAG ---
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

token.eventMode = "static";
token.cursor = "pointer";

token.on("pointerdown", (event) => {
  isDragging = true;

  const parent = token.parent;
  if (!parent) return;

  const pos = event.getLocalPosition(parent);

  dragOffset.x = token.x - pos.x;
  dragOffset.y = token.y - pos.y;
});

app.app.stage.on("pointermove", (event) => {
  if (!isDragging) return;

  const parent = token.parent;
  if (!parent) return;

  const pos = event.getLocalPosition(parent);

  token.x = pos.x + dragOffset.x;
  token.y = pos.y + dragOffset.y;
});

const stopDrag = () => {
  if (!isDragging) return;

  isDragging = false;

  socket.send({
    type: "TOKEN_MOVE",
    payload: {
      id: "t1",
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