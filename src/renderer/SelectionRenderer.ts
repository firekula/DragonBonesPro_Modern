import * as PIXI from "pixi.js";

export class SelectionRenderer {
    private static textureCache = new Map<string, PIXI.Texture>();

    /**
     * Creates or retrieves a palette-swapped contour texture for a given sub-texture.
     */
    static getContourTexture(
        alphaCtx: CanvasRenderingContext2D,
        subTex: { name: string; x: number; y: number; width: number; height: number },
        color: number,
        alpha: number = 1.0,
    ): PIXI.Texture | null {
        const cacheKey = `${subTex.name}_${color.toString(16)}_${alpha}`;
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey)!;
        }

        const frameW = Math.floor(subTex.width);
        const frameH = Math.floor(subTex.height);
        const frameX = Math.floor(subTex.x);
        const frameY = Math.floor(subTex.y);

        if (frameW <= 0 || frameH <= 0) return null;

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

        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        const a = Math.floor(alpha * 255);

        for (let y = 0; y < frameH; y++) {
            for (let x = 0; x < frameW; x++) {
                const idx = y * frameW + x;
                if (mask[idx] === 0) continue;

                // Check neighbors for edges
                let isEdge = false;
                for (let dy = -1; dy <= 1 && !isEdge; dy++) {
                    for (let dx = -1; dx <= 1 && !isEdge; dx++) {
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
                    out.data[pi] = r;
                    out.data[pi + 1] = g;
                    out.data[pi + 2] = b;
                    out.data[pi + 3] = a;
                }
            }
        }

        ctx.putImageData(out, 0, 0);
        const texture = PIXI.Texture.from(contourCanvas);
        this.textureCache.set(cacheKey, texture);
        return texture;
    }

    static createContourSprite(
        alphaCtx: CanvasRenderingContext2D,
        subTex: { name: string; x: number; y: number; width: number; height: number },
        color: number,
        alpha: number = 1.0,
    ): PIXI.Sprite | null {
        const texture = this.getContourTexture(alphaCtx, subTex, color, alpha);
        if (!texture) return null;
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5, 0.5);
        return sprite;
    }

    /**
     * @deprecated Use getContourTexture and manage life-cycle manually
     */
    static drawSlotSelection(
        outlineLayer: PIXI.Container,
        alphaCtx: CanvasRenderingContext2D,
        displayMatrix: PIXI.Matrix,
        subTex: { name: string; x: number; y: number; width: number; height: number },
    ) {
        const contour = this.createContourSprite(alphaCtx, subTex, 0xffffff, 0.9);
        if (contour) {
            contour.setFromMatrix(displayMatrix);
            outlineLayer.addChild(contour);
        }
    }
}
