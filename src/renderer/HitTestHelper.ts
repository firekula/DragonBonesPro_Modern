export class HitTestHelper {
    static createAlphaHitArea(
        alphaCtx: CanvasRenderingContext2D,
        frameX: number,
        frameY: number,
        frameW: number,
        frameH: number,
    ) {
        const alphaData = alphaCtx.getImageData(frameX, frameY, frameW, frameH).data;
        const halfW = frameW * 0.5;
        const halfH = frameH * 0.5;

        return {
            contains(x: number, y: number): boolean {
                // x, y are in local sprite coords (anchor-centered: 0,0 = center)
                const px = Math.floor(x + halfW);
                const py = Math.floor(y + halfH);
                if (px < 0 || py < 0 || px >= frameW || py >= frameH) return false;
                const alphaIndex = (py * frameW + px) * 4 + 3;
                return alphaData[alphaIndex] > 20;
            },
        };
    }
}
