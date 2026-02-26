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
    isPlaying?: boolean;
    currentFrame?: number;
    frameEmitter?: EventTarget;
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
    isPlaying = false,
    currentFrame = 0,
    frameEmitter,
    onTransformChange,
}: CanvasRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pixiAppRef = useRef<PIXI.Application | null>(null);
    const rootContainerRef = useRef<PIXI.Container | null>(null);
    const [isAppReady, setIsAppReady] = useState(false);
    const frameRef = useRef(currentFrame);

    // Sync frameRef when prop changes (manual scrubbing)
    useEffect(() => {
        frameRef.current = currentFrame;
    }, [currentFrame]);

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

        // Frame emitter subscription (use ref to avoid capturing stale updateRendering)
        const handleFrameChange = (e: any) => {
            frameRef.current = e.detail;
            if (updateRenderingRef.current) {
                updateRenderingRef.current();
            } else {
                console.warn("[CanvasRenderer] handleFrameChange: updateRenderingRef.current is missing");
            }
        };

        if (frameEmitter) {
            console.log("[CanvasRenderer] Subscribing to frameEmitter");
            frameEmitter.addEventListener('frameChange', handleFrameChange);
        } else {
            console.warn("[CanvasRenderer] frameEmitter is missing in hook!");
        }

        return () => {
            isMounted = false;
            resizeObserver.disconnect();
            if (frameEmitter) {
                frameEmitter.removeEventListener('frameChange', handleFrameChange);
            }
            if (pixiAppRef.current) {
                pixiAppRef.current.destroy(true, { children: true });
                pixiAppRef.current = null;
            }
        };
    }, [applyTransform, frameEmitter]);

    // Pan zoom logic handled by usePanZoom hook

    // Store references to rendering elements
    const renderingRef = useRef({
        spriteLayer: null as PIXI.Container | null,
        boneLayer: null as PIXI.Container | null,
        boneGraphics: null as PIXI.Graphics | null,
        outlineLayer: null as PIXI.Container | null,
        hoverGraphics: null as PIXI.Container | null, // always-on-top hover outline
        slotSprites: new Map<string, PIXI.Sprite>(),
        boneJoints: new Map<string, PIXI.Graphics>(),
        armature: null as any,
        skinSlotMap: {} as Record<string, any>,
        subTextureMap: {} as Record<string, any>,
        textureBlobUrl: null as string | null,
        imageSource: null as PIXI.ImageSource | null,
        alphaCtx: null as CanvasRenderingContext2D | null,
        selectionG: null as PIXI.Graphics | null,
        selectionContour: null as PIXI.Sprite | null,
    });

    // Keep armature reference in renderingRef in sync whenever projectData changes
    useEffect(() => {
        if (!projectData || !projectData.armatures[selectedArmatureIndex]) return;
        renderingRef.current.armature = projectData.armatures[selectedArmatureIndex];
    }, [projectData, selectedArmatureIndex]);

    // Refs to always-latest values, avoiding stale closures in drag callbacks
    const isDraggingRef = useRef(false);
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

        // Hover + selection outline Graphics (always topmost, drawn directly)
        const hoverGraphics = new PIXI.Container();
        hoverGraphics.eventMode = 'none'; // Overlays shouldn't block
        rootContainer.addChild(hoverGraphics);

        // Selection outline layer (contains tool handles, must be topmost and interactive)
        const outlineLayer = new PIXI.Container();
        outlineLayer.eventMode = 'passive'; // Pass through to children
        rootContainer.addChild(outlineLayer);

        // Persistent selection visuals
        const selectionG = new PIXI.Graphics();
        outlineLayer.addChild(selectionG);
        const selectionContour = new PIXI.Sprite();
        selectionContour.anchor.set(0.5, 0.5);
        selectionContour.eventMode = 'none';
        outlineLayer.addChild(selectionContour);

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
            selectionG,
            selectionContour,
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
                            const { hoverGraphics, armature, skinSlotMap, subTextureMap, alphaCtx } = renderingRef.current;
                            const rc = rootContainerRef.current;
                            if (!hoverGraphics || !rc || !alphaCtx || !armature || isDraggingRef.current) return;
                            
                            hoverGraphics.removeChildren();
                            const dashG = new PIXI.Graphics();
                            hoverGraphics.addChild(dashG);

                            const bounds = sprite.getLocalBounds();
                            
                            // 1. Dash box
                            const corners = [
                                [bounds.left, bounds.top], [bounds.right, bounds.top],
                                [bounds.right, bounds.bottom], [bounds.left, bounds.bottom],
                            ].map(([lx, ly]) => {
                                const gp = sprite.toGlobal({ x: lx, y: ly });
                                return rc.toLocal(gp);
                            });

                            dashG.setStrokeStyle({ width: 1.2 / (zoomRef.current || 1), color: 0xffffff, alpha: 0.6 });
                            const dashLen = 4 / (zoomRef.current || 1);
                            const gapLen = 3 / (zoomRef.current || 1);
                            for (let ci = 0; ci < corners.length; ci++) {
                                const a = corners[ci], b = corners[(ci + 1) % corners.length];
                                const dx = b.x - a.x, dy = b.y - a.y;
                                const len = Math.sqrt(dx * dx + dy * dy);
                                const ux = dx / len, uy = dy / len;
                                let t = 0;
                                while (t < len) {
                                    const endT = Math.min(t + dashLen, len);
                                    dashG.moveTo(a.x + ux * t, a.y + uy * t);
                                    dashG.lineTo(a.x + ux * endT, a.y + uy * endT);
                                    t += dashLen + gapLen;
                                }
                            }
                            dashG.stroke();

                            // 2. Pixel-perfect white contour
                            const skinSlot = skinSlotMap[slot.name];
                            if (skinSlot && skinSlot.displays) {
                                const display = skinSlot.displays[slot.displayIndex] || skinSlot.displays[0];
                                const subTex = subTextureMap[display.path];
                                if (subTex) {
                                    const contour = SelectionRenderer.createContourSprite(alphaCtx, subTex, 0xffffff, 0.7);
                                    if (contour) {
                                        // Standard way in modern PIXI:
                                        const worldMat = sprite.worldTransform.clone();
                                        const rcInverse = rc.worldTransform.clone().invert();
                                        worldMat.prepend(rcInverse);
                                        contour.setFromMatrix(worldMat);
                                        contour.eventMode = 'none';
                                        hoverGraphics.addChild(contour);
                                    }
                                }
                            }
                        });

                        sprite.on('pointerout', () => {
                            renderingRef.current.hoverGraphics?.removeChildren();
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

    // Performance profiling state
    const perfRef = useRef({ lastFrameTime: 0, frameCount: 0, totalMs: 0 });

    // Helper function to update rendering without recreating the entire scene
    const updateRendering = useCallback(() => {
        const startTime = performance.now();
        const { boneLayer, boneGraphics, outlineLayer, slotSprites, boneJoints, armature, skinSlotMap, subTextureMap, alphaCtx, hoverGraphics } = renderingRef.current;
        if (!armature || !boneGraphics) return;

        // Helper to find a bone by name
        const findBone = (name: string) => armature.bones.find((b: any) => b.name === name);

        // Compute global bone transforms (with animation if playing)
        const globalTransforms: Record<string, PIXI.Matrix> = {};
        const DEG_TO_RAD = Math.PI / 180;

        // Get animation deltas for current frame
        const currentF = frameRef.current;
        const animBoneMap = currentAnimation
            ? getAnimatedBoneTransforms(currentAnimation, currentF)
            : null;
        
        if (currentF % 24 === 0) {
            console.log(`[CanvasRenderer] Rendering f=${currentF}, anim=${currentAnimation?.name}, hasMap=${!!animBoneMap}`);
        }
        if (currentF % 24 === 0) { // Log occasionally to verify loop
            console.log(`[CanvasRenderer] updateRendering: f=${currentF}, anim=${currentAnimation?.name}, isPlaying=${isPlaying}`);
        }

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

        // Use persistent selection visuals
        const { selectionG, selectionContour } = renderingRef.current;
        if (selectionG) selectionG.clear();
        if (selectionContour) selectionContour.visible = false;

        // Clear existing hover/tool handles (but keep persistent selection objects if we want them always there)
        if (outlineLayer) {
            // We want to keep selectionG and selectionContour, and also tool handles might be children.
            // ToolRenderer usually adds/removes children.
            // A safer way is to ONLY remove ToolRenderer children or let it manage them.
            // For now, let's just ensure we don't remove our persistent ones.
            const persistent = [selectionG, selectionContour];
            outlineLayer.children.forEach(c => {
                if (!persistent.includes(c as any) && !(c instanceof PIXI.Container && c.children.length > 0)) {
                    // This is still a bit fuzzy, maybe we should just clear everything except persistent
                }
            });
            // Actually, let's just clear outlineLayer children that are NOT persistent
            const toRemove = outlineLayer.children.filter(c => !persistent.includes(c as any));
            toRemove.forEach(c => outlineLayer.removeChild(c));
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
                    hoverGraphics?.removeChildren();

                    // Blue solid selection outline and contour for selected slot sprite
                    if (selectedSlot && selectionG && selectionContour) {
                        const selSprite = slotSprites?.get(selectedSlot);
                        const rc = rootContainerRef.current;
                        if (selSprite && rc && alphaCtx) {
                            const bounds = selSprite.getLocalBounds();
                            
                            // Calculate corners directly from displayMatrix to avoid worldTransform lag
                            const corners = [
                                { x: bounds.left, y: bounds.top },
                                { x: bounds.right, y: bounds.top },
                                { x: bounds.right, y: bounds.bottom },
                                { x: bounds.left, y: bounds.bottom },
                            ].map(p => {
                                const out = { x: 0, y: 0 };
                                targetMatrix!.apply(p, out);
                                return out;
                            });
                            
                            selectionG.setStrokeStyle({ width: 1.5 / zoom, color: 0x4a9eff, alpha: 1 });
                            selectionG.moveTo(corners[0].x, corners[0].y);
                            for (let i = 1; i < corners.length; i++) selectionG.lineTo(corners[i].x, corners[i].y);
                            selectionG.lineTo(corners[0].x, corners[0].y);
                            selectionG.stroke();

                            // Pixel-perfect blue contour
                            const skinSlot = skinSlotMap[selectedSlot];
                            const slot = armature.slots.find((s: any) => s.name === selectedSlot);
                            if (skinSlot && slot) {
                                const display = skinSlot.displays[slot.displayIndex] || skinSlot.displays[0];
                                const subTex = subTextureMap[display.path];
                                if (subTex) {
                                    const texture = SelectionRenderer.getContourTexture(alphaCtx, subTex, 0x4a9eff, 0.8);
                                    if (texture) {
                                        selectionContour.texture = texture;
                                        selectionContour.visible = true;
                                        // targetMatrix IS the local-to-rootContainer transform
                                        selectionContour.setFromMatrix(targetMatrix!);
                                    }
                                }
                            }
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

            // Old SelectionRenderer removed — replaced by hoverGraphics / outlineLayer blue rect
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

        // Profiling
        const endTime = performance.now();
        const duration = endTime - startTime;
        perfRef.current.totalMs += duration;
        perfRef.current.frameCount++;
        if (duration > 12) {
            console.warn(`[CanvasRenderer] Heavy Frame: ${duration.toFixed(2)}ms (Selected: ${selectedBone || selectedSlot || 'None'})`);
        }
        if (perfRef.current.frameCount >= 60) {
            const avg = perfRef.current.totalMs / perfRef.current.frameCount;
            console.log(`[CanvasRenderer] Avg Render Time (60f): ${avg.toFixed(2)}ms (Selected: ${selectedBone || selectedSlot || 'None'})`);
            perfRef.current.frameCount = 0;
            perfRef.current.totalMs = 0;
        }

        // Detect frame pacing issues
        const now = performance.now();
        if (perfRef.current.lastFrameTime > 0) {
            const gap = now - perfRef.current.lastFrameTime;
            if (gap > 35) { // Gap > 35ms (~30fps)
                console.warn(`[CanvasRenderer] Stutter detected: ${gap.toFixed(2)}ms since last update`);
            }
        }
        perfRef.current.lastFrameTime = now;

    // projectData changes trigger re-render since armature ref is updated above
    }, [currentAnimation, isPlaying, selectedBone, selectedSlot, selectedTool, onSelectBone, onTransformChange]);
    const updateRenderingRef = useRef(updateRendering);
    useEffect(() => { updateRenderingRef.current = updateRendering; }, [updateRendering]);

    /**
     * Lightweight update: only refreshes bone wireframes and sprite positions.
     * Does NOT touch outlineLayer (tool controls), so control points stay visible during drag.
     */
    const updateBonesAndSprites = useCallback(() => {
        const { boneLayer, boneGraphics, slotSprites, boneJoints, armature, skinSlotMap, outlineLayer, hoverGraphics, alphaCtx, subTextureMap } = renderingRef.current;
        if (!armature || !boneGraphics) return;

        // Ensure hover is cleared during drag
        hoverGraphics?.removeChildren();

        // Use persistent selection visuals
        const { selectionG, selectionContour } = renderingRef.current;
        if (selectionG) selectionG.clear();
        if (selectionContour) selectionContour.visible = false;
        
        // No need to clear outlineLayer here if we only update persistent visuals

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

            // Update selection visuals if this is the selected slot
            const selSlot = selectedSlotRef.current;
            const zoom = zoomRef.current;
            if (slot.name === selSlot && outlineLayer && alphaCtx && selectionG && selectionContour) {
                const rc = rootContainerRef.current;
                if (rc) {
                    const bounds = sprite.getLocalBounds();
                    
                    // Calculate corners directly from displayMatrix to avoid worldTransform lag
                    const corners = [
                        { x: bounds.left, y: bounds.top },
                        { x: bounds.right, y: bounds.top },
                        { x: bounds.right, y: bounds.bottom },
                        { x: bounds.left, y: bounds.bottom },
                    ].map(p => {
                        const out = { x: 0, y: 0 };
                        displayMatrix.apply(p, out);
                        return out;
                    });
                    
                    selectionG.setStrokeStyle({ width: 1.5 / zoom, color: 0x4a9eff, alpha: 1 });
                    selectionG.moveTo(corners[0].x, corners[0].y);
                    for (let i = 1; i < corners.length; i++) selectionG.lineTo(corners[i].x, corners[i].y);
                    selectionG.lineTo(corners[0].x, corners[0].y);
                    selectionG.stroke();

                    const skinSlot = skinSlotMap[slot.name];
                    if (skinSlot) {
                        const display = skinSlot.displays[slot.displayIndex] || skinSlot.displays[0];
                        const subTex = subTextureMap[display.path];
                        if (subTex) {
                            const texture = SelectionRenderer.getContourTexture(alphaCtx, subTex, 0x4a9eff, 0.8);
                            if (texture) {
                                selectionContour.texture = texture;
                                selectionContour.visible = true;
                                // displayMatrix IS the local-to-rootContainer transform
                                selectionContour.setFromMatrix(displayMatrix);
                            }
                        }
                    }
                }
            }
        });

        // Draw bone wireframes
        BoneRenderer.drawBones(
            armature, getGlobalMatrix, boneGraphics, boneLayer,
            boneJoints, selectedBone, zoomRef.current, onSelectBone
        );
    }, [currentAnimation, currentFrame, selectedBone, selectedSlot, onSelectBone]);
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
        isDraggingRef.current = true;
        applyDeltaDirectly(field, canvasPixelDelta);
    }, [applyDeltaDirectly]);
    const handleToolTransformChangeRef = useRef(handleToolTransformChange);
    useEffect(() => { handleToolTransformChangeRef.current = handleToolTransformChange; }, [handleToolTransformChange]);

    const handleToolDragEnd = useCallback(() => {
        isDraggingRef.current = false;
        updateRenderingRef.current();
        if (onTransformChangeRef.current) onTransformChangeRef.current('commit', 0);
    }, []);
    const handleToolDragEndRef = useRef(handleToolDragEnd);
    useEffect(() => { handleToolDragEndRef.current = handleToolDragEnd; }, [handleToolDragEnd]);

    // Update rendering when animation/selection/tool changes (NOT on every projectData change - drags go through applyDeltaDirectly)
    useEffect(() => {
        const rafId = requestAnimationFrame(() => updateRendering());
        return () => cancelAnimationFrame(rafId);
    }, [currentAnimation, selectedBone, selectedSlot, selectedTool, updateRendering]);


    return (
        <div 
            ref={containerRef} 
            className="w-full h-full relative"
            style={{ backgroundColor: '#1e1e1e' }}
        />
    );
}
