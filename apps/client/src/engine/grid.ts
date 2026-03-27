import * as PIXI from "pixi.js";

export class Grid {
  private graphics: PIXI.Graphics;
  private size: number;

  constructor(layer: PIXI.Container, size = 50) {
    this.graphics = new PIXI.Graphics();
    this.size = size;

    layer.addChild(this.graphics);
  }

  draw(width: number, height: number) {
    this.graphics.clear();

    for (let x = 0; x <= width; x += this.size) {
        this.graphics.moveTo(x, 0);
        this.graphics.lineTo(x, height);
    }

    for (let y = 0; y <= height; y += this.size) {
        this.graphics.moveTo(0, y);
        this.graphics.lineTo(width, y);
    }

    this.graphics.stroke({
        width: 1,
        color: 0xffffff,
        alpha: 0.5
    });
  }



  snap(value: number) {
    return Math.round(value / this.size) * this.size;
  }

  snapPoint(x: number, y: number) {
    return {
      x: this.snap(x),
      y: this.snap(y)
    };
  }
}