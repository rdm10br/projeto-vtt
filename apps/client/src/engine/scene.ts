import * as PIXI from "pixi.js";
import { TokenManager } from "./tokenManager";
export class Scene {
  tokens: TokenManager;

  constructor(tokenLayer: PIXI.Container) {
    this.tokens = new TokenManager(tokenLayer);
  }
}