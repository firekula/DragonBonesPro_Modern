import * as PIXI from "pixi.js";

export class GridRenderer {
    static createGridAndAxes(container: PIXI.Container) {
        // Dynamic grid that moves/scales with content
        const gridGraphics = new PIXI.Graphics();
        const gridSize = 20;
        const gridExtent = 5000;
        for (let i = -gridExtent; i <= gridExtent; i += gridSize) {
            gridGraphics.moveTo(i, -gridExtent).lineTo(i, gridExtent);
            gridGraphics.moveTo(-gridExtent, i).lineTo(gridExtent, i);
        }
        gridGraphics.stroke({ width: 1, color: 0x333333, alpha: 0.5 });
        container.addChild(gridGraphics);

        // Reference axes
        const axes = new PIXI.Graphics();
        axes.moveTo(-5000, 0).lineTo(5000, 0);
        axes.moveTo(0, -5000).lineTo(0, 5000);
        axes.stroke({ width: 1, color: 0x555555, alpha: 0.8 });
        container.addChild(axes);
    }
}
