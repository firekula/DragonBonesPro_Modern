import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import type { DragonBonesData, AnimationData } from '../DataModel';
import { getAnimatedBoneTransforms, applyAnimationToTransform } from './AnimationPlayer';
import { usePanZoom } from '../hooks/usePanZoom';
import { GridRenderer } from '../renderer/GridRenderer';
import { HitTestHelper } from '../renderer/HitTestHelper';
import { BoneRenderer } from '../renderer/BoneRenderer';
import { SelectionRenderer } from '../renderer/SelectionRenderer';
import { ToolRenderer } from '../renderer/ToolRenderer';

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
    selectedTool?: 'move' | 'scale' | 'rotate';
    onTransformChange?: (field: string, value: number) => void;
}

export function CanvasRenderer({
    projectData,
    selectedArmatureIndex = 0,
    selectedBone,
    selectedSlot,
    onSelectBone,
    onSelectSlot,
    onDeselect,
    selectedTool = 'move',
    currentAnimation,
    currentFrame = 0,
    onTransformChange,
}: CanvasRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pixiAppRef = useRef<PIXI.Application | null>(null);
    const rootContainerRef = useRef<PIXI.Container | null>(null);
    const [isAppReady, setIsAppReady] = useState(false);

    // Apply pan/zoom to root container
    const applyTransformRaw = useCallback((pan: {x: number, y: number}, zoom: number) => {
        const root = rootContainerRef.current;
        const app = pixiAppRef.current;
        if (!root || !app) return;

        root.x = app.screen.width / 2 + pan.x;
        root.y = app.screen.height / 2 + pan.y;
        root.scale.set(zoom);
    }, []);

    const { panRef, zoomRef } = usePanZoom({ containerRef, onTransform: applyTransformRaw });

    const applyTransform = useCallback(() => {
        applyTransformRaw(panRef.current, zoomRef.current);
    }, [applyTransformRaw, panRef, zoomRef]);

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

    // Pan zoom logic handled by usePanZoom hook

    // Store references to rendering elements
    const renderingRef = useRef({
        spriteLayer: null as PIXI.Container | null,
        boneLayer: null as PIXI.Container | null,
        boneGraphics: null as PIXI.Graphics | null,
        outlineLayer: null as PIXI.Container | null,
        hoverGraphics: null as PIXI.Graphics | null, // always-on-top hover outline
        slotSprites: new Map<string, PIXI.Sprite>(),
        boneJoints: new Map<string, PIXI.Graphics>(),
        armature: null as any,
        skinSlotMap: {} as Record<string, any>,
        subTextureMap: {} as Record<string, any>,
        textureBlobUrl: null as string | null,
        imageSource: null as PIXI.ImageSource | null,
        alphaCtx: null as CanvasRenderingContext2D | null,
    });

    // Keep armature reference in renderingRef in sync whenever projectData changes
    useEffect(() => {
        if (!projectData || !projectData.armatures[selectedArmatureIndex]) return;
        renderingRef.current.armature = projectData.armatures[selectedArmatureIndex];
    }, [projectData, selectedArmatureIndex]);

    // (applyDeltaDirectly and handleToolDragEnd are defined after updateRendering below)
    // Refs to always-latest values, avoiding stale closures in drag callbacks
    const selectedBoneRef = useRef(selectedBone);
    const selectedSlotRef = useRef(selectedSlot);
    useEffect(() => { selectedBoneRef.current = selectedBone; }, [selectedBone]);
    useEffect(() => { selectedSlotRef.current = selectedSlot; }, [selectedSlot]);
    const onTransformChangeRef = useRef(onTransformChange);
    useEffect(() => { onTransformChangeRef.current = onTransformChange; }, [onTransformChange]);
    // updateRenderingRef and updateBonesAndSpritesRef are set after those callbacks are defined below

    // Initialize scene when app is ready or project data changes
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
        // Ensure stage receives pointermove events even when pointer is outside any child
        // (required by ToolRenderer's drag system which listens on stage.on('pointermove'))
        stage.on('pointermove', () => {});

        // Root container (zoom/pan applied here)
        const rootContainer = new PIXI.Container();
        rootContainerRef.current = rootContainer;
        stage.addChild(rootContainer);
        applyTransform();

        GridRenderer.createGridAndAxes(rootContainer);

        // Sprite rendering layer (below bones)
        const spriteLayer = new PIXI.Container();
        rootContainer.addChild(spriteLayer);

        // Bone wireframe layer (on top)
        const boneLayer = new PIXI.Container();
        rootContainer.addChild(boneLayer);
        const boneGraphics = new PIXI.Graphics();
        boneLayer.addChild(boneGraphics);

        // Selection outline layer (on top of sprites, below bones)
        const outlineLayer = new PIXI.Container();
        rootContainer.addChild(outlineLayer);
        // Re-add boneLayer on top
        rootContainer.removeChild(boneLayer);
        rootContainer.addChild(boneLayer);

        // Hover + selection outline Graphics (always topmost, drawn directly)
        const hoverGraphics = new PIXI.Graphics();
        rootContainer.addChild(hoverGraphics);

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

        // Store references
        renderingRef.current = {
            spriteLayer,
            boneLayer,
            boneGraphics,
            outlineLayer,
            hoverGraphics,
            slotSprites: new Map(),
            boneJoints: new Map(),
            armature,
            skinSlotMap,
            subTextureMap,
            textureBlobUrl: projectData.images['texture.png'],
            imageSource: null,
            alphaCtx: null,
        };

        // Load the texture image and create sprites
        const textureBlobUrl = projectData.images['texture.png'];
        if (textureBlobUrl) {
            const loadAndRender = async () => {
                try {
                    const img = new Image();
                    img.src = textureBlobUrl;
                    await img.decode();

                    const imageSource = new PIXI.ImageSource({ resource: img });
                    renderingRef.current.imageSource = imageSource;

                    // Offscreen canvas for alpha sampling
                    const alphaCanvas = document.createElement('canvas');
                    alphaCanvas.width = img.width;
                    alphaCanvas.height = img.height;
                    const alphaCtx = alphaCanvas.getContext('2d', { willReadFrequently: true })!;
                    alphaCtx.drawImage(img, 0, 0);
                    renderingRef.current.alphaCtx = alphaCtx;



                    // Create sprites for slots
                    const slotSprites = new Map<string, PIXI.Sprite>();
                    for (const slot of armature.slots) {
                        const skinSlot = skinSlotMap[slot.name];
                        if (!skinSlot || !skinSlot.displays || skinSlot.displays.length === 0) continue;

                        const display = skinSlot.displays[slot.displayIndex] || skinSlot.displays[0];
                        if (display.type !== 'image') continue;

                        const subTex = subTextureMap[display.path];
                        if (!subTex) continue;

                        const frame = new PIXI.Rectangle(subTex.x, subTex.y, subTex.width, subTex.height);
                        const subTexture = new PIXI.Texture({ source: imageSource, frame });

                        const sprite = new PIXI.Sprite(subTexture);
                        sprite.anchor.set(0.5, 0.5);

                        // ---- Pixel-perfect hit test via hitArea ----
                        sprite.eventMode = 'static';
                        sprite.cursor = 'pointer';

                        const frameX = Math.floor(subTex.x);
                        const frameY = Math.floor(subTex.y);
                        const frameW = Math.floor(subTex.width);
                        const frameH = Math.floor(subTex.height);

                        sprite.hitArea = HitTestHelper.createAlphaHitArea(
                            alphaCtx, frameX, frameY, frameW, frameH
                        );

                        sprite.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                            if (e.button === 0 && onSelectSlot) {
                                onSelectSlot(slot.name);
                                e.stopPropagation();
                            }
                        });

                        // Hover outline: white dashed when hovering unselected sprites
                        sprite.on('pointerover', () => {
                            const hg = renderingRef.current.hoverGraphics;
                            if (!hg) return;
                            hg.clear();
                            const bounds = sprite.getLocalBounds();
                            const mat = sprite.worldTransform;
                            // Draw dashed white rectangle in world space using the sprite's transform
                            const corners = [
                                [bounds.left, bounds.top], [bounds.right, bounds.top],
                                [bounds.right, bounds.bottom], [bounds.left, bounds.bottom],
                            ].map(([lx, ly]) => mat.apply({ x: lx, y: ly }));
                            hg.setStrokeStyle({ width: 1.2 / (zoomRef.current || 1), color: 0xffffff, alpha: 0.75 });
                            // Dash simulation
                            const dashLen = 4 / (zoomRef.current || 1);
                            const gapLen = 3 / (zoomRef.current || 1);
                            for (let ci = 0; ci < corners.length; ci++) {
                                const a = corners[ci];
                                const b = corners[(ci + 1) % corners.length];
                                const dx = b.x - a.x, dy = b.y - a.y;
                                const len = Math.sqrt(dx * dx + dy * dy);
                                const ux = dx / len, uy = dy / len;
                                let t = 0;
                                while (t < len) {
                                    const startX = a.x + ux * t, startY = a.y + uy * t;
                                    const endT = Math.min(t + dashLen, len);
                                    const endX = a.x + ux * endT, endY = a.y + uy * endT;
                                    hg.moveTo(startX, startY);
                                    hg.lineTo(endX, endY);
                                    t += dashLen + gapLen;
                                }
                            }
                            hg.stroke();
                        });
                        sprite.on('pointerout', () => {
                            renderingRef.current.hoverGraphics?.clear();
                        });

                        spriteLayer.addChild(sprite);
                        slotSprites.set(slot.name, sprite);
                    }

                    renderingRef.current.slotSprites = slotSprites;

                    // Update rendering with current animation
                    updateRendering();
                } catch (err) {
                    console.error("Error loading texture for rendering:", err);
                }
            };

            loadAndRender();
        } else {
            // No texture, just update bone rendering
            updateRendering();
        }

    }, [projectData, selectedArmatureIndex, isAppReady, applyTransform, onSelectSlot, onDeselect]);

    // Helper function to update rendering without recreating the entire scene
    const updateRendering = useCallback(() => {
        const { boneLayer, boneGraphics, outlineLayer, slotSprites, boneJoints, armature, skinSlotMap, subTextureMap, alphaCtx, hoverGraphics } = renderingRef.current;
        if (!armature || !boneGraphics) return;

        // Helper to find a bone by name
        const findBone = (name: string) => armature.bones.find((b: any) => b.name === name);

        // Compute global bone transforms (with animation if playing)
        const globalTransforms: Record<string, PIXI.Matrix> = {};
        const DEG_TO_RAD = Math.PI / 180;

        // Get animation deltas for current frame
        const animBoneMap = currentAnimation
            ? getAnimatedBoneTransforms(currentAnimation, currentFrame)
            : null;

        const getGlobalMatrix = (bone: any): PIXI.Matrix => {
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

        // Clear existing bone graphics and joints
        boneGraphics.clear();
        boneJoints.forEach(joint => {
            if (joint.parent) {
                joint.parent.removeChild(joint);
            }
        });
        boneJoints.clear();

        // Clear existing outlines
        if (outlineLayer) {
            outlineLayer.removeChildren();
        }

        // Draw edit tool controls if something is selected
        if (outlineLayer) {
            if (selectedBone || selectedSlot) {
                let targetMatrix: PIXI.Matrix | null = null;

                if (selectedBone) {
                    const bone = armature.bones.find((b: any) => b.name === selectedBone);
                    if (bone) {
                        targetMatrix = getGlobalMatrix(bone);
                    }
                } else if (selectedSlot) {
                    const slot = armature.slots.find((s: any) => s.name === selectedSlot);
                    if (slot) {
                        const parentBone = findBone(slot.parentBoneName);
                        if (parentBone) {
                            // 获取父骨骼的全局矩阵
                            const boneMatrix = getGlobalMatrix(parentBone);
                            
                            // 获取皮肤槽位的显示信息
                            const skinSlot = skinSlotMap[slot.name];
                            if (skinSlot && skinSlot.displays && skinSlot.displays.length > 0) {
                                const display = skinSlot.displays[slot.displayIndex] || skinSlot.displays[0];
                                if (display.transform) {
                                    // 创建显示对象的本地矩阵
                                    const displayMatrix = new PIXI.Matrix();
                                    const dSkewX = display.transform.skewX * DEG_TO_RAD;
                                    const dSkewY = display.transform.skewY * DEG_TO_RAD;
                                    displayMatrix.a = Math.cos(dSkewY) * display.transform.scaleX;
                                    displayMatrix.b = Math.sin(dSkewY) * display.transform.scaleX;
                                    displayMatrix.c = -Math.sin(dSkewX) * display.transform.scaleY;
                                    displayMatrix.d = Math.cos(dSkewX) * display.transform.scaleY;
                                    displayMatrix.tx = display.transform.x;
                                    displayMatrix.ty = display.transform.y;
                                    
                                    // 计算显示对象的全局矩阵（父骨骼矩阵 + 显示对象本地矩阵）
                                    displayMatrix.prepend(boneMatrix);
                                    targetMatrix = displayMatrix;
                                } else {
                                    targetMatrix = boneMatrix;
                                }
                            } else {
                                targetMatrix = boneMatrix;
                            }
                        }
                    }
                }

                if (targetMatrix) {
                        const zoom = zoomRef.current;
                        const controlSize = 16 / zoom;
                        const controlLineLength = 32 / zoom;
                        const arrowSize = 6 / zoom;

                    // Clear hover outline when something is selected
                    hoverGraphics?.clear();

                    // Blue solid selection outline for selected slot sprite
                    if (selectedSlot) {
                        const selSprite = slotSprites?.get(selectedSlot);
                        if (selSprite) {
                            const selBounds = selSprite.getLocalBounds();
                            const selMat = selSprite.worldTransform;
                            const selCorners = [
                                [selBounds.left, selBounds.top], [selBounds.right, selBounds.top],
                                [selBounds.right, selBounds.bottom], [selBounds.left, selBounds.bottom],
                            ].map(([lx, ly]) => selMat.apply({ x: lx, y: ly }));
                            const selG = new PIXI.Graphics();
                            selG.setStrokeStyle({ width: 1.5 / zoom, color: 0x4a9eff, alpha: 1 });
                            selG.moveTo(selCorners[0].x, selCorners[0].y);
                            selCorners.slice(1).forEach(c => selG.lineTo(c.x, c.y));
                            selG.lineTo(selCorners[0].x, selCorners[0].y);
                            selG.stroke();
                            outlineLayer.addChild(selG);
                        }
                    }

                    // Draw tool controls based on selectedTool
                    if (selectedTool === 'move') {
                        ToolRenderer.drawMoveControls(outlineLayer, targetMatrix, controlSize, controlLineLength, arrowSize, handleToolTransformChange, handleToolDragEnd);
                    } else if (selectedTool === 'scale') {
                        ToolRenderer.drawScaleControls(outlineLayer, targetMatrix, controlSize, controlLineLength, handleToolTransformChange, handleToolDragEnd);
                    } else if (selectedTool === 'rotate') {
                        ToolRenderer.drawRotateControls(outlineLayer, targetMatrix, controlSize, controlLineLength, handleToolTransformChange, handleToolDragEnd);
                    }
                }
            }
        }

        // Update sprites
        slotSprites.forEach((sprite, slotName) => {
            const slot = armature.slots.find((s: any) => s.name === slotName);
            if (!slot) return;

            const parentBone = findBone(slot.parentBoneName);
            if (!parentBone) return;

            const boneMatrix = getGlobalMatrix(parentBone);
            const skinSlot = skinSlotMap[slot.name];
            if (!skinSlot || !skinSlot.displays || skinSlot.displays.length === 0) return;

            const display = skinSlot.displays[slot.displayIndex] || skinSlot.displays[0];
            if (display.type !== 'image') return;

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

            // Update selection visuals
            if (selectedSlot === slot.name && outlineLayer && alphaCtx) {
                const subTex = subTextureMap[display.path];
                if (subTex) {
                    SelectionRenderer.drawSlotSelection(
                        outlineLayer, alphaCtx, displayMatrix, subTex, zoomRef.current
                    );
                }
            }
        });

        // Draw bone wireframes with click-to-select on joints
        BoneRenderer.drawBones(
            armature,
            getGlobalMatrix,
            boneGraphics,
            boneLayer,
            boneJoints,
            selectedBone,
            zoomRef.current,
            onSelectBone
        );
    // projectData changes trigger re-render since armature ref is updated above
    }, [currentAnimation, currentFrame, selectedBone, selectedSlot, selectedTool, onSelectBone, onTransformChange]);
    const updateRenderingRef = useRef(updateRendering);
    useEffect(() => { updateRenderingRef.current = updateRendering; }, [updateRendering]);

    /**
     * Lightweight update: only refreshes bone wireframes and sprite positions.
     * Does NOT touch outlineLayer (tool controls), so control points stay visible during drag.
     */
    const updateBonesAndSprites = useCallback(() => {
        const { boneLayer, boneGraphics, slotSprites, boneJoints, armature, skinSlotMap } = renderingRef.current;
        if (!armature || !boneGraphics) return;

        const findBone = (name: string) => armature.bones.find((b: any) => b.name === name);
        const globalTransforms: Record<string, PIXI.Matrix> = {};
        const DEG_TO_RAD = Math.PI / 180;

        const animBoneMap = currentAnimation
            ? getAnimatedBoneTransforms(currentAnimation, currentFrame)
            : null;

        const getGlobalMatrix = (bone: any): PIXI.Matrix => {
            if (globalTransforms[bone.name]) return globalTransforms[bone.name];
            const localMatrix = new PIXI.Matrix();
            let { x, y, skewX, skewY, scaleX, scaleY } = bone.localTransform;
            const animDelta = animBoneMap?.get(bone.name);
            if (animDelta) {
                const animated = applyAnimationToTransform(bone.localTransform, animDelta);
                x = animated.x; y = animated.y; skewX = animated.skewX;
                skewY = animated.skewY; scaleX = animated.scaleX; scaleY = animated.scaleY;
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
                if (parentBone) localMatrix.prepend(getGlobalMatrix(parentBone));
            }
            globalTransforms[bone.name] = localMatrix;
            return localMatrix;
        };

        boneGraphics.clear();
        boneJoints.forEach(joint => { if (joint.parent) joint.parent.removeChild(joint); });
        boneJoints.clear();

        // Update sprites
        slotSprites.forEach((sprite, slotName) => {
            const slot = armature.slots.find((s: any) => s.name === slotName);
            if (!slot) return;
            const parentBone = findBone(slot.parentBoneName);
            if (!parentBone) return;
            const boneMatrix = getGlobalMatrix(parentBone);
            const skinSlot = skinSlotMap[slot.name];
            if (!skinSlot || !skinSlot.displays || skinSlot.displays.length === 0) return;
            const display = skinSlot.displays[slot.displayIndex] || skinSlot.displays[0];
            if (display.type !== 'image') return;
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
        });

        // Draw bone wireframes
        BoneRenderer.drawBones(
            armature, getGlobalMatrix, boneGraphics, boneLayer,
            boneJoints, selectedBone, zoomRef.current, onSelectBone
        );
    }, [currentAnimation, currentFrame, selectedBone, onSelectBone]);
    const updateBonesAndSpritesRef = useRef(updateBonesAndSprites);
    useEffect(() => { updateBonesAndSpritesRef.current = updateBonesAndSprites; }, [updateBonesAndSprites]);

    // Use refs so updateRendering always gets the latest callbacks without dep-cycle
    const applyDeltaDirectly = useCallback((field: string, canvasPixelDelta: number) => {
        const zoom = zoomRef.current;
        const worldDelta = field === 'rotation' ? canvasPixelDelta : canvasPixelDelta / zoom;

        const arm = renderingRef.current.armature;
        if (!arm) return;

        let transform: any = null;
        let parentBoneName: string | undefined;
        const boneName = selectedBoneRef.current;
        const slotName = selectedSlotRef.current;
        const bone = boneName ? arm.bones.find((b: any) => b.name === boneName) : null;
        if (bone) {
            transform = bone.localTransform;
            parentBoneName = bone.parentBoneName;
        } else if (slotName) {
            const slotInfo = arm.slots?.find((s: any) => s.name === slotName);
            parentBoneName = slotInfo?.parentBoneName;
            const skin = arm.skins?.[0];
            const skinSlot = skin?.slots.find((ss: any) => ss.name === slotName);
            if (skinSlot?.displays?.[0]) transform = skinSlot.displays[0].transform;
        }
        if (!transform) return;

        if (field === 'rotation') {
            transform.skewX += worldDelta;
            transform.skewY += worldDelta;
        } else if ((field === 'x' || field === 'y') && parentBoneName) {
            // Convert world-space delta to local-space delta via parent inverse matrix
            const DEG_TO_RAD = Math.PI / 180;
            const gtCache: Record<string, PIXI.Matrix> = {};
            const findB = (n: string) => arm.bones.find((b: any) => b.name === n);
            const getGM = (b: any): PIXI.Matrix => {
                if (gtCache[b.name]) return gtCache[b.name];
                const m = new PIXI.Matrix();
                const { skewX, skewY, scaleX, scaleY, x, y } = b.localTransform;
                m.a = Math.cos(skewY * DEG_TO_RAD) * scaleX;
                m.b = Math.sin(skewY * DEG_TO_RAD) * scaleX;
                m.c = -Math.sin(skewX * DEG_TO_RAD) * scaleY;
                m.d = Math.cos(skewX * DEG_TO_RAD) * scaleY;
                m.tx = x; m.ty = y;
                if (b.parentBoneName) { const pb = findB(b.parentBoneName); if (pb) m.prepend(getGM(pb)); }
                gtCache[b.name] = m;
                return m;
            };
            const parentBone = findB(parentBoneName);
            if (parentBone) {
                // Only rotation-scale part of inverse (zero translation so delta maps correctly)
                const inv = getGM(parentBone).clone();
                inv.tx = 0; inv.ty = 0;
                inv.invert();
                const wdx = field === 'x' ? worldDelta : 0;
                const wdy = field === 'y' ? worldDelta : 0;
                transform.x += inv.a * wdx + inv.c * wdy;
                transform.y += inv.b * wdx + inv.d * wdy;
            } else {
                transform[field] += worldDelta;
            }
        } else {
            transform[field] += worldDelta;
        }
        updateBonesAndSpritesRef.current();
    }, [zoomRef, updateBonesAndSprites]);

    const handleToolTransformChange = useCallback((field: string, canvasPixelDelta: number) => {
        applyDeltaDirectly(field, canvasPixelDelta);
    }, [applyDeltaDirectly]);
    const handleToolTransformChangeRef = useRef(handleToolTransformChange);
    useEffect(() => { handleToolTransformChangeRef.current = handleToolTransformChange; }, [handleToolTransformChange]);

    const handleToolDragEnd = useCallback(() => {
        updateRenderingRef.current();
        if (onTransformChangeRef.current) onTransformChangeRef.current('commit', 0);
    }, []);
    const handleToolDragEndRef = useRef(handleToolDragEnd);
    useEffect(() => { handleToolDragEndRef.current = handleToolDragEnd; }, [handleToolDragEnd]);

    // Update rendering when animation/selection/tool changes (NOT on every projectData change - drags go through applyDeltaDirectly)
    useEffect(() => {
        const rafId = requestAnimationFrame(() => updateRendering());
        return () => cancelAnimationFrame(rafId);
    }, [currentAnimation, currentFrame, selectedBone, selectedSlot, selectedTool, onSelectBone, updateRendering]);


    return (
        <div 
            ref={containerRef} 
            className="w-full h-full relative"
            style={{ backgroundColor: '#1e1e1e' }}
        />
    );
}
