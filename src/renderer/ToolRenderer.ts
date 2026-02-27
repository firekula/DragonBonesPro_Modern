import * as PIXI from "pixi.js";

/**
 * Helper to get the PIXI stage from any container inside the scene graph.
 * OutlineLayer → RootContainer → Stage
 */
function getStage(outlineLayer: PIXI.Container): PIXI.Container | null {
    return outlineLayer.parent?.parent ?? null;
}

/**
 * Add a drag interaction using PIXI stage pointermove/pointerup events.
 * Consistent canvas-pixel coordinates via e.global.x/y throughout.
 */
function addDragHandler(
    target: PIXI.Graphics,
    outlineLayer: PIXI.Container,
    onPointerDown: (e: PIXI.FederatedPointerEvent) => {
        onMove: (e: PIXI.FederatedPointerEvent) => void;
        onUp: () => void;
    },
) {
    target.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        const stage = getStage(outlineLayer);
        if (!stage) return;

        const { onMove, onUp } = onPointerDown(e);

        const cleanup = () => {
            stage.off("pointermove", onMove);
            stage.off("pointerup", cleanup);
            stage.off("pointerupoutside", cleanup);
            onUp();
        };

        stage.on("pointermove", onMove);
        stage.on("pointerup", cleanup);
        stage.on("pointerupoutside", cleanup);
    });
}

export class ToolRenderer {
    static drawMoveControls(
        outlineLayer: PIXI.Container,
        targetMatrix: PIXI.Matrix,
        controlSize: number,
        controlLineLength: number,
        arrowSize: number,
        onTransformChange?: (field: string, value: number) => void,
        onDragStart?: () => void,
        onDragEnd?: () => void,
    ) {
        const moveControls = new PIXI.Graphics();

        // X axis arrow (points RIGHT → positive X in DragonBones world)
        moveControls.moveTo(targetMatrix.tx, targetMatrix.ty);
        moveControls.lineTo(targetMatrix.tx + controlLineLength, targetMatrix.ty);
        moveControls.lineTo(targetMatrix.tx + controlLineLength - arrowSize, targetMatrix.ty - arrowSize);
        moveControls.moveTo(targetMatrix.tx + controlLineLength, targetMatrix.ty);
        moveControls.lineTo(targetMatrix.tx + controlLineLength - arrowSize, targetMatrix.ty + arrowSize);

        // Y axis arrow (points DOWN → positive Y in DragonBones world, same as screen)
        moveControls.moveTo(targetMatrix.tx, targetMatrix.ty);
        moveControls.lineTo(targetMatrix.tx, targetMatrix.ty + controlLineLength);
        moveControls.lineTo(targetMatrix.tx - arrowSize, targetMatrix.ty + controlLineLength - arrowSize);
        moveControls.moveTo(targetMatrix.tx, targetMatrix.ty + controlLineLength);
        moveControls.lineTo(targetMatrix.tx + arrowSize, targetMatrix.ty + controlLineLength - arrowSize);

        moveControls.stroke({ width: 2, color: 0x00ff00, alpha: 0.8 });
        outlineLayer.addChild(moveControls);

        // Center dot - free move on both axes
        const centerDot = new PIXI.Graphics();
        centerDot.circle(targetMatrix.tx, targetMatrix.ty, controlSize / 2);
        centerDot.fill({ color: 0x00ff00, alpha: 1 });
        centerDot.eventMode = "static";
        centerDot.cursor = "move";

        if (onTransformChange) {
            addDragHandler(centerDot, outlineLayer, (e) => {
                onDragStart?.();
                let lastX = e.global.x;
                let lastY = e.global.y;
                return {
                    onMove: (moveEvent) => {
                        const dx = moveEvent.global.x - lastX;
                        const dy = moveEvent.global.y - lastY;
                        lastX = moveEvent.global.x;
                        lastY = moveEvent.global.y;
                        // horizontal mouse → X field, vertical mouse → Y field
                        onTransformChange("x", dx);
                        onTransformChange("y", dy);
                    },
                    onUp: () => onDragEnd?.(),
                };
            });
        }
        outlineLayer.addChild(centerDot);

        // X axis handle - constrained horizontal move (horizontal mouse → X)
        const xAxisHandle = new PIXI.Graphics();
        xAxisHandle.moveTo(targetMatrix.tx, targetMatrix.ty);
        xAxisHandle.lineTo(targetMatrix.tx + controlLineLength, targetMatrix.ty);
        xAxisHandle.stroke({ width: 10, color: 0xff0000, alpha: 0.01 });
        xAxisHandle.eventMode = "static";
        xAxisHandle.cursor = "ew-resize";

        if (onTransformChange) {
            addDragHandler(xAxisHandle, outlineLayer, (e) => {
                onDragStart?.();
                let lastX = e.global.x;
                return {
                    onMove: (moveEvent) => {
                        const dx = moveEvent.global.x - lastX;
                        lastX = moveEvent.global.x;
                        onTransformChange("x", dx);
                    },
                    onUp: () => onDragEnd?.(),
                };
            });
        }
        outlineLayer.addChild(xAxisHandle);

        // Y axis handle - constrained vertical move (vertical mouse → Y)
        const yAxisHandle = new PIXI.Graphics();
        yAxisHandle.moveTo(targetMatrix.tx, targetMatrix.ty);
        yAxisHandle.lineTo(targetMatrix.tx, targetMatrix.ty + controlLineLength);
        yAxisHandle.stroke({ width: 10, color: 0x00ff00, alpha: 0.01 });
        yAxisHandle.eventMode = "static";
        yAxisHandle.cursor = "ns-resize";

        if (onTransformChange) {
            addDragHandler(yAxisHandle, outlineLayer, (e) => {
                onDragStart?.();
                let lastY = e.global.y;
                return {
                    onMove: (moveEvent) => {
                        const dy = moveEvent.global.y - lastY;
                        lastY = moveEvent.global.y;
                        onTransformChange("y", dy);
                    },
                    onUp: () => onDragEnd?.(),
                };
            });
        }
        outlineLayer.addChild(yAxisHandle);
    }

    static drawScaleControls(
        outlineLayer: PIXI.Container,
        targetMatrix: PIXI.Matrix,
        controlSize: number,
        controlLineLength: number,
        onTransformChange?: (field: string, value: number) => void,
        onDragStart?: () => void,
        onDragEnd?: () => void,
    ) {
        const handles = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: 1 },
            { x: -1, y: 1 },
            { x: 1, y: -1 },
            { x: -1, y: -1 },
        ];

        handles.forEach((handle) => {
            const handleX = targetMatrix.tx + handle.x * controlLineLength;
            const handleY = targetMatrix.ty + handle.y * controlLineLength;
            const handleControl = new PIXI.Graphics();
            handleControl.circle(handleX, handleY, controlSize);
            handleControl.fill({ color: 0x0000ff, alpha: 1 });
            handleControl.eventMode = "static";
            handleControl.cursor = "pointer";

            if (onTransformChange) {
                addDragHandler(handleControl, outlineLayer, (e) => {
                    onDragStart?.();
                    let lastX = e.global.x;
                    let lastY = e.global.y;
                    return {
                        onMove: (moveEvent) => {
                            const dx = moveEvent.global.x - lastX;
                            const dy = moveEvent.global.y - lastY;
                            lastX = moveEvent.global.x;
                            lastY = moveEvent.global.y;
                            // horizontal delta → scaleX, vertical delta → scaleY
                            if (handle.x !== 0) onTransformChange("scaleX", dx * 0.01 * handle.x);
                            if (handle.y !== 0) onTransformChange("scaleY", dy * 0.01 * handle.y);
                        },
                        onUp: () => onDragEnd?.(),
                    };
                });
            }
            outlineLayer.addChild(handleControl);
        });
    }

    static drawRotateControls(
        outlineLayer: PIXI.Container,
        targetMatrix: PIXI.Matrix,
        controlSize: number,
        controlLineLength: number,
        onTransformChange?: (field: string, value: number) => void,
        onDragStart?: () => void,
        onDragEnd?: () => void,
    ) {
        // Rotation handle at bottom-right of the bone
        const rotateHandleX = targetMatrix.tx + controlLineLength;
        const rotateHandleY = targetMatrix.ty + controlLineLength;
        const rotateControl = new PIXI.Graphics();
        rotateControl.circle(rotateHandleX, rotateHandleY, controlSize);
        rotateControl.fill({ color: 0xff00ff, alpha: 1 });
        rotateControl.eventMode = "static";
        rotateControl.cursor = "crosshair";

        if (onTransformChange) {
            addDragHandler(rotateControl, outlineLayer, (e) => {
                onDragStart?.();
                const rootContainer = outlineLayer.parent;
                if (!rootContainer) return { onMove: () => {}, onUp: () => {} };

                // Convert bone center from rootContainer local space to canvas global pixel space
                const globalCenter = rootContainer.toGlobal(new PIXI.Point(targetMatrix.tx, targetMatrix.ty));
                const cx = globalCenter.x;
                const cy = globalCenter.y;

                // Initial angle from bone center to mouse, in canvas pixel space
                let lastAngle = Math.atan2(e.global.y - cy, e.global.x - cx);

                return {
                    onMove: (moveEvent) => {
                        const currentAngle = Math.atan2(moveEvent.global.y - cy, moveEvent.global.x - cx);
                        let deltaAngle = currentAngle - lastAngle;
                        // Wraparound guard at ±π
                        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
                        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
                        lastAngle = currentAngle;
                        // Send degrees; App.tsx sets both skewX and skewY for pure rotation
                        onTransformChange("rotation", deltaAngle * (180 / Math.PI));
                    },
                    onUp: () => onDragEnd?.(),
                };
            });
        }
        outlineLayer.addChild(rotateControl);

        // Rotation arc (quarter circle at bottom-right)
        const rotationArc = new PIXI.Graphics();
        rotationArc.arc(targetMatrix.tx, targetMatrix.ty, controlLineLength, 0, Math.PI / 2);
        rotationArc.stroke({ width: 2, color: 0xff00ff, alpha: 0.5 });
        outlineLayer.addChild(rotationArc);
    }
}
