import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import type { DragonBonesData, BoneData, AnimationData } from '../DataModel';
import { getAnimatedBoneTransforms, applyAnimationToTransform } from './AnimationPlayer';

interface CanvasRendererProps {
    projectData: DragonBonesData | null;
    selectedArmatureIndex?: number;
    selectedBone?: string | null;
    selectedSlot?: string | null;
    onSelectBone?: (name: string) => void;
    onSelectSlot?: (name: string) => void;
    onDeselect?: () => void;
    currentAnimation?: AnimationData | null;
    currentFrame?: number;
}

export function CanvasRenderer({
    projectData,
    selectedArmatureIndex = 0,
    selectedBone,
    selectedSlot,
    onSelectBone,
    onSelectSlot,
    onDeselect,
    currentAnimation,
    currentFrame = 0,
}: CanvasRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pixiAppRef = useRef<PIXI.Application | null>(null);
    const rootContainerRef = useRef<PIXI.Container | null>(null);
    const [isAppReady, setIsAppReady] = useState(false);

    // Pan/zoom state stored in refs to avoid re-renders
    const panRef = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1);
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });

    // Apply pan/zoom to root container
    const applyTransform = useCallback(() => {
        const root = rootContainerRef.current;
        const app = pixiAppRef.current;
        if (!root || !app) return;

        root.x = app.screen.width / 2 + panRef.current.x;
        root.y = app.screen.height / 2 + panRef.current.y;
        root.scale.set(zoomRef.current);
    }, []);

    // PixiJS init
    useEffect(() => {
        if (!containerRef.current) return;

        const app = new PIXI.Application();
        let isMounted = true;

        app.init({
            resizeTo: containerRef.current,
            backgroundColor: 0x1e1e1e,
            backgroundAlpha: 0,
            antialias: true,
        }).then(() => {
            if (!isMounted || !containerRef.current) {
                app.destroy(true, { children: true });
                return;
            }

            containerRef.current.appendChild(app.canvas);
            pixiAppRef.current = app;
            setIsAppReady(true);
        }).catch(err => {
            console.error("PixiJS Init Error:", err);
        });

        // ResizeObserver to handle window resize / fullscreen toggle
        const resizeObserver = new ResizeObserver(() => {
            if (pixiAppRef.current) {
                pixiAppRef.current.resize();
                applyTransform();
            }
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            isMounted = false;
            resizeObserver.disconnect();
            if (pixiAppRef.current) {
                pixiAppRef.current.destroy(true, { children: true });
                pixiAppRef.current = null;
            }
        };
    }, [applyTransform]);

    // Mouse event handlers for pan/zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Zoom with scroll wheel
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
            zoomRef.current = Math.max(0.1, Math.min(5, zoomRef.current + delta * zoomRef.current));
            applyTransform();
        };

        // Pan with middle-click or right-click drag
        const handleMouseDown = (e: MouseEvent) => {
            if (e.button === 1 || e.button === 2) { // Middle or Right click
                isDraggingRef.current = true;
                lastMouseRef.current = { x: e.clientX, y: e.clientY };
                e.preventDefault();
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingRef.current) {
                const dx = e.clientX - lastMouseRef.current.x;
                const dy = e.clientY - lastMouseRef.current.y;
                panRef.current.x += dx;
                panRef.current.y += dy;
                lastMouseRef.current = { x: e.clientX, y: e.clientY };
                applyTransform();
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (e.button === 1 || e.button === 2) {
                isDraggingRef.current = false;
            }
        };

        // Prevent context menu on right-click
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('contextmenu', handleContextMenu);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            container.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [applyTransform]);

    // Draw the Armature when data changes or app becomes ready
    useEffect(() => {
        if (!isAppReady) return;
        const app = pixiAppRef.current;
        if (!app || !projectData || !projectData.armatures[selectedArmatureIndex]) return;

        const armature = projectData.armatures[selectedArmatureIndex];
        const stage = app.stage;
        stage.removeChildren();

        // Click on empty area to deselect
        stage.eventMode = 'static';
        stage.hitArea = app.screen;
        stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            if (e.button === 0 && onDeselect) {
                onDeselect();
            }
        });

        // Root container (zoom/pan applied here)
        const rootContainer = new PIXI.Container();
        rootContainerRef.current = rootContainer;
        stage.addChild(rootContainer);
        applyTransform();

        // Dynamic grid that moves/scales with content
        const gridGraphics = new PIXI.Graphics();
        const gridSize = 20;
        const gridExtent = 5000;
        for (let i = -gridExtent; i <= gridExtent; i += gridSize) {
            gridGraphics.moveTo(i, -gridExtent).lineTo(i, gridExtent);
            gridGraphics.moveTo(-gridExtent, i).lineTo(gridExtent, i);
        }
        gridGraphics.stroke({ width: 1, color: 0x333333, alpha: 0.5 });
        rootContainer.addChild(gridGraphics);

        // Reference axes
        const axes = new PIXI.Graphics();
        axes.moveTo(-5000, 0).lineTo(5000, 0);
        axes.moveTo(0, -5000).lineTo(0, 5000);
        axes.stroke({ width: 1, color: 0x555555, alpha: 0.8 });
        rootContainer.addChild(axes);

        // Sprite rendering layer (below bones)
        const spriteLayer = new PIXI.Container();
        rootContainer.addChild(spriteLayer);

        // Bone wireframe layer (on top)
        const boneLayer = new PIXI.Container();
        rootContainer.addChild(boneLayer);
        const boneGraphics = new PIXI.Graphics();
        boneLayer.addChild(boneGraphics);

        // Helper to find a bone by name
        const findBone = (name: string) => armature.bones.find(b => b.name === name);

        // Compute global bone transforms (with animation if playing)
        const globalTransforms: Record<string, PIXI.Matrix> = {};
        const DEG_TO_RAD = Math.PI / 180;

        // Get animation deltas for current frame
        const animBoneMap = currentAnimation
            ? getAnimatedBoneTransforms(currentAnimation, currentFrame)
            : null;

        const getGlobalMatrix = (bone: BoneData): PIXI.Matrix => {
            if (globalTransforms[bone.name]) return globalTransforms[bone.name];

            const localMatrix = new PIXI.Matrix();

            // Get base transform, apply animation delta if present
            let { x, y, skewX, skewY, scaleX, scaleY } = bone.localTransform;
            const animDelta = animBoneMap?.get(bone.name);
            if (animDelta) {
                const animated = applyAnimationToTransform(bone.localTransform, animDelta);
                x = animated.x;
                y = animated.y;
                skewX = animated.skewX;
                skewY = animated.skewY;
                scaleX = animated.scaleX;
                scaleY = animated.scaleY;
            }

            const skXRad = skewX * DEG_TO_RAD;
            const skYRad = skewY * DEG_TO_RAD;

            localMatrix.a = Math.cos(skYRad) * scaleX;
            localMatrix.b = Math.sin(skYRad) * scaleX;
            localMatrix.c = -Math.sin(skXRad) * scaleY;
            localMatrix.d = Math.cos(skXRad) * scaleY;
            localMatrix.tx = x;
            localMatrix.ty = y;

            if (bone.parentBoneName) {
                const parentBone = findBone(bone.parentBoneName);
                if (parentBone) {
                    const parentMatrix = getGlobalMatrix(parentBone);
                    localMatrix.prepend(parentMatrix);
                }
            }

            globalTransforms[bone.name] = localMatrix;
            return localMatrix;
        };

        // Build lookup: slotName -> SkinSlotData (from first skin)
        const skinSlotMap: Record<string, any> = {};
        if (armature.skins && armature.skins[0]) {
            for (const skinSlot of armature.skins[0].slots) {
                skinSlotMap[skinSlot.name] = skinSlot;
            }
        }

        // Build texture atlas SubTexture lookup
        const subTextureMap: Record<string, any> = {};
        if (projectData.textureAtlas && projectData.textureAtlas.SubTexture) {
            for (const sub of projectData.textureAtlas.SubTexture) {
                subTextureMap[sub.name] = sub;
            }
        }

        // Store sprite refs for click-to-select
        const slotSpriteMap: Map<PIXI.Sprite, string> = new Map();

        // Selection outline layer (on top of sprites, below bones)
        const outlineLayer = new PIXI.Container();
        rootContainer.addChild(outlineLayer);
        // Re-add boneLayer on top
        rootContainer.removeChild(boneLayer);
        rootContainer.addChild(boneLayer);

        // Helper: generate a thick white contour texture from alpha data
        function createContourTexture(
            alphaCtx: CanvasRenderingContext2D,
            fx: number, fy: number, fw: number, fh: number,
            thickness: number = 2
        ): HTMLCanvasElement {
            const imgData = alphaCtx.getImageData(fx, fy, fw, fh);
            const src = imgData.data;

            // Build binary alpha mask
            const mask = new Uint8Array(fw * fh);
            for (let i = 0; i < fw * fh; i++) {
                mask[i] = src[i * 4 + 3] > 20 ? 1 : 0;
            }

            // Find edge pixels with configurable thickness
            const contourCanvas = document.createElement('canvas');
            contourCanvas.width = fw;
            contourCanvas.height = fh;
            const ctx = contourCanvas.getContext('2d')!;
            const out = ctx.createImageData(fw, fh);

            for (let y = 0; y < fh; y++) {
                for (let x = 0; x < fw; x++) {
                    const idx = y * fw + x;
                    if (mask[idx] === 0) continue;

                    // Check neighbors within 'thickness' radius
                    let isEdge = false;
                    for (let dy = -thickness; dy <= thickness && !isEdge; dy++) {
                        for (let dx = -thickness; dx <= thickness && !isEdge; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= fw || ny >= fh || mask[ny * fw + nx] === 0) {
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
            return contourCanvas;
        }

        // Helper: draw dashed rectangle
        function drawDashedRect(g: PIXI.Graphics, x: number, y: number, w: number, h: number, dashLen: number, gapLen: number) {
            const sides = [
                [x, y, x + w, y],
                [x + w, y, x + w, y + h],
                [x + w, y + h, x, y + h],
                [x, y + h, x, y],
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
                    const segLen = Math.min(drawing ? dashLen : gapLen, len - d);
                    if (drawing) {
                        g.moveTo(x1 + nx * d, y1 + ny * d);
                        g.lineTo(x1 + nx * (d + segLen), y1 + ny * (d + segLen));
                    }
                    d += segLen;
                    drawing = !drawing;
                }
            }
        }

        // Load the texture image and render sprites
        const textureBlobUrl = projectData.images['texture.png'];
        if (textureBlobUrl) {
            const loadAndRender = async () => {
                try {
                    const img = new Image();
                    img.src = textureBlobUrl;
                    await img.decode();

                    const imageSource = new PIXI.ImageSource({ resource: img });

                    // Offscreen canvas for alpha sampling
                    const alphaCanvas = document.createElement('canvas');
                    alphaCanvas.width = img.width;
                    alphaCanvas.height = img.height;
                    const alphaCtx = alphaCanvas.getContext('2d', { willReadFrequently: true })!;
                    alphaCtx.drawImage(img, 0, 0);

                    for (const slot of armature.slots) {
                        const parentBone = findBone(slot.parentBoneName);
                        if (!parentBone) continue;

                        const boneMatrix = getGlobalMatrix(parentBone);

                        const skinSlot = skinSlotMap[slot.name];
                        if (!skinSlot || !skinSlot.displays || skinSlot.displays.length === 0) continue;

                        const display = skinSlot.displays[slot.displayIndex] || skinSlot.displays[0];
                        if (display.type !== 'image') continue;

                        const subTex = subTextureMap[display.path];
                        if (!subTex) continue;

                        const frameX = Math.floor(subTex.x);
                        const frameY = Math.floor(subTex.y);
                        const frameW = Math.floor(subTex.width);
                        const frameH = Math.floor(subTex.height);

                        const frame = new PIXI.Rectangle(subTex.x, subTex.y, subTex.width, subTex.height);
                        const subTexture = new PIXI.Texture({ source: imageSource, frame });

                        const sprite = new PIXI.Sprite(subTexture);
                        sprite.anchor.set(0.5, 0.5);

                        const displayTransform = display.transform;
                        const displayMatrix = new PIXI.Matrix();

                        const dSkewX = displayTransform.skewX * DEG_TO_RAD;
                        const dSkewY = displayTransform.skewY * DEG_TO_RAD;

                        displayMatrix.a = Math.cos(dSkewY) * displayTransform.scaleX;
                        displayMatrix.b = Math.sin(dSkewY) * displayTransform.scaleX;
                        displayMatrix.c = -Math.sin(dSkewX) * displayTransform.scaleY;
                        displayMatrix.d = Math.cos(dSkewX) * displayTransform.scaleY;
                        displayMatrix.tx = displayTransform.x;
                        displayMatrix.ty = displayTransform.y;

                        displayMatrix.prepend(boneMatrix);
                        sprite.setFromMatrix(displayMatrix);

                        // ---- Pixel-perfect hit test via hitArea ----
                        // hitArea.contains() receives coords in local sprite space (pre-transformed by PixiJS)
                        // Transparent pixels return false → event falls through to sprites below
                        sprite.eventMode = 'static';
                        sprite.cursor = 'pointer';
                        slotSpriteMap.set(sprite, slot.name);

                        // Pre-extract alpha data for this sub-texture
                        const alphaData = alphaCtx.getImageData(frameX, frameY, frameW, frameH).data;
                        const halfW = frameW * 0.5;
                        const halfH = frameH * 0.5;

                        // Custom hitArea that checks pixel alpha
                        sprite.hitArea = {
                            contains(x: number, y: number): boolean {
                                // x, y are in local sprite coords (anchor-centered: 0,0 = center)
                                const px = Math.floor(x + halfW);
                                const py = Math.floor(y + halfH);
                                if (px < 0 || py < 0 || px >= frameW || py >= frameH) return false;
                                const alphaIndex = (py * frameW + px) * 4 + 3;
                                return alphaData[alphaIndex] > 20;
                            }
                        };

                        sprite.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                            if (e.button === 0 && onSelectSlot) {
                                onSelectSlot(slot.name);
                            }
                        });

                        // ---- Selection visuals ----
                        // Current zoom for zoom-independent line widths
                        const zoom = zoomRef.current;

                        if (selectedSlot === slot.name) {
                            // 1. Dashed bounding box (zoom-independent line width)
                            const dashedBox = new PIXI.Graphics();
                            drawDashedRect(dashedBox, -frameW / 2, -frameH / 2, frameW, frameH, 6, 4);
                            dashedBox.stroke({ width: 1 / zoom, color: 0xcccccc, alpha: 0.7 });
                            dashedBox.setFromMatrix(displayMatrix);
                            outlineLayer.addChild(dashedBox);

                            // 2. White contour of non-transparent pixels
                            const contourCanvas = createContourTexture(alphaCtx, frameX, frameY, frameW, frameH);
                            const contourSource = new PIXI.ImageSource({ resource: contourCanvas });
                            const contourTexture = new PIXI.Texture({ source: contourSource });
                            const contourSprite = new PIXI.Sprite(contourTexture);
                            contourSprite.anchor.set(0.5, 0.5);
                            contourSprite.setFromMatrix(displayMatrix);
                            outlineLayer.addChild(contourSprite);
                        }

                        spriteLayer.addChild(sprite);
                    }
                } catch (err) {
                    console.error("Error loading texture for rendering:", err);
                }
            };

            loadAndRender();
        }

        // Draw bone wireframes with click-to-select on joints
        armature.bones.forEach(bone => {
            const matrix = getGlobalMatrix(bone);
            const startX = matrix.tx;
            const startY = matrix.ty;
            const length = Math.max(bone.length, 10);
            const endX = startX + matrix.a * length;
            const endY = startY + matrix.b * length;

            const isSelected = selectedBone === bone.name;
            const boneColor = isSelected ? 0xffffff : (bone.color || 0x00ffff);
            const zoom = zoomRef.current;
            const boneWidth = (isSelected ? 3 : 2) / zoom;  // Zoom-independent
            const boneAlpha = isSelected ? 1.0 : 0.8;

            boneGraphics.moveTo(startX, startY);
            boneGraphics.lineTo(endX, endY);
            boneGraphics.stroke({ width: boneWidth, color: boneColor, alpha: boneAlpha });

            const jointSize = (isSelected ? 6 : 4) / zoom;  // Zoom-independent
            boneGraphics.circle(startX, startY, jointSize);
            boneGraphics.fill({ color: isSelected ? 0xff4400 : 0xffaa00, alpha: boneAlpha });

            // Clickable joint circle for bone selection
            const joint = new PIXI.Graphics();
            joint.circle(startX, startY, 8);
            joint.fill({ color: 0x000000, alpha: 0.01 }); // Nearly invisible hit area
            joint.eventMode = 'static';
            joint.cursor = 'pointer';
            joint.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                if (e.button === 0 && onSelectBone) {
                    onSelectBone(bone.name);
                    e.stopPropagation();
                }
            });
            boneLayer.addChild(joint);
        });

    }, [projectData, selectedArmatureIndex, isAppReady, selectedBone, selectedSlot, applyTransform, onSelectBone, onSelectSlot, onDeselect, currentAnimation, currentFrame]);

    return (
        <div 
            ref={containerRef} 
            className="w-full h-full relative"
            style={{ backgroundColor: '#1e1e1e' }}
        />
    );
}
