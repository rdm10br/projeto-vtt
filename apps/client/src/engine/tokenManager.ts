import * as PIXI from "pixi.js";

export class TokenManager {
  private tokens = new Map<string, PIXI.Graphics>();
  private layer: PIXI.Container;

  constructor(layer: PIXI.Container) {
    this.layer = layer;
  }

  create(id: string, x: number, y: number) {
    const token = new PIXI.Graphics();

    token.beginFill(0xffffff);
    token.drawRect(0, 0, 50, 50);
    token.endFill();

    token.x = x;
    token.y = y;

    this.layer.addChild(token);
    this.tokens.set(id, token);

    return token;
  }

  move(id: string, x: number, y: number) {
    const token = this.tokens.get(id);
    if (!token) return;

    token.x = x;
    token.y = y;
  }

  get(id: string) {
    return this.tokens.get(id);
  }
}