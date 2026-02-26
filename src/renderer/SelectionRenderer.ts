import * as PIXI from "pixi.js";

export class SelectionRenderer {
    static drawSlotSelection(
        outlineLayer: PIXI.Container,
        alphaCtx: CanvasRenderingContext2D,
        displayMatrix: PIXI.Matrix,
        subTex: { x: number; y: number; width: number; height: number },
        zoom: number,
    ) {
        const frameW = Math.floor(subTex.width);
        const frameH = Math.floor(subTex.height);
        const frameX = Math.floor(subTex.x);
        const frameY = Math.floor(subTex.y);

        // 1. Dashed bounding box
        const dashedBox = new PIXI.Graphics();
        const sides = [
            [-frameW / 2, -frameH / 2, frameW / 2, -frameH / 2],
            [frameW / 2, -frameH / 2, frameW / 2, frameH / 2],
            [frameW / 2, frameH / 2, -frameW / 2, frameH / 2],
            [-frameW / 2, frameH / 2, -frameW / 2, -frameH / 2],
        ];

        for (const [x1, y1, x2, y2] of sides) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = dx / len;
            const ny = dy / len;
            let d = 0;
            let drawing = true;
            while (d < len) {
                const segLen = Math.min(drawing ? 6 : 4, len - d);
                if (drawing) {
                    dashedBox.moveTo(x1 + nx * d, y1 + ny * d);
                    dashedBox.lineTo(x1 + nx * (d + segLen), y1 + ny * (d + segLen));
                }
                d += segLen;
                drawing = !drawing;
            }
        }
        dashedBox.stroke({ width: 1 / zoom, color: 0xcccccc, alpha: 0.7 });
        dashedBox.setFromMatrix(displayMatrix);
        outlineLayer.addChild(dashedBox);

        // 2. White contour of non-transparent pixels
        const imgData = alphaCtx.getImageData(frameX, frameY, frameW, frameH);
        const src = imgData.data;

        // Build binary alpha mask
        const mask = new Uint8Array(frameW * frameH);
        for (let i = 0; i < frameW * frameH; i++) {
            mask[i] = src[i * 4 + 3] > 20 ? 1 : 0;
        }

        // Find edge pixels
        const contourCanvas = document.createElement("canvas");
        contourCanvas.width = frameW;
        contourCanvas.height = frameH;
        const ctx = contourCanvas.getContext("2d")!;
        const out = ctx.createImageData(frameW, frameH);

        for (let y = 0; y < frameH; y++) {
            for (let x = 0; x < frameW; x++) {
                const idx = y * frameW + x;
                if (mask[idx] === 0) continue;

                // Check neighbors
                let isEdge = false;
                for (let dy = -2; dy <= 2 && !isEdge; dy++) {
                    for (let dx = -2; dx <= 2 && !isEdge; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= frameW || ny >= frameH || mask[ny * frameW + nx] === 0) {
                            isEdge = true;
                        }
                    }
                }

                if (isEdge) {
                    const pi = idx * 4;
                    out.data[pi] = 255;
                    out.data[pi + 1] = 255;
                    out.data[pi + 2] = 255;
                    out.data[pi + 3] = 240;
                }
            }
        }

        ctx.putImageData(out, 0, 0);
        const contourSource = new PIXI.ImageSource({ resource: contourCanvas });
        const contourTexture = new PIXI.Texture({ source: contourSource });
        const contourSprite = new PIXI.Sprite(contourTexture);
        contourSprite.anchor.set(0.5, 0.5);
        contourSprite.setFromMatrix(displayMatrix);
        outlineLayer.addChild(contourSprite);
    }
}
