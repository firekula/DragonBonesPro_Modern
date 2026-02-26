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
                                e.stopPropagation(); // 阻止事件冒泡，防止触发舞台的点击事件
                            }
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
        const { boneLayer, boneGraphics, outlineLayer, slotSprites, boneJoints, armature, skinSlotMap, subTextureMap, alphaCtx } = renderingRef.current;
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

    /**
     * During drag: apply delta directly to the armature transform and re-render via PIXI
     * (bypasses React state to prevent flicker caused by re-renders on every mousemove).
     * On drag end: call onTransformChange('commit', 0) to sync the mutated data to App.tsx.
     */
    const applyDeltaDirectly = useCallback((field: string, canvasPixelDelta: number) => {
        const zoom = zoomRef.current;
        const worldDelta = field === 'rotation' ? canvasPixelDelta : canvasPixelDelta / zoom;

        const arm = renderingRef.current.armature;
        if (!arm) return;

        let transform: any = null;
        const bone = arm.bones.find((b: any) => b.name === selectedBone);
        if (bone) {
            transform = bone.localTransform;
        } else if (selectedSlot) {
            const skin = arm.skins?.[0];
            const skinSlot = skin?.slots.find((ss: any) => ss.name === selectedSlot);
            if (skinSlot?.displays?.[0]) transform = skinSlot.displays[0].transform;
        }
        if (!transform) return;

        if (field === 'rotation') {
            transform.skewX += worldDelta;
            transform.skewY += worldDelta;
        } else {
            transform[field] += worldDelta;
        }
        // Direct PIXI re-render, no React state update = no flicker
        updateRendering();
    }, [selectedBone, selectedSlot, zoomRef, updateRendering]);

    const handleToolTransformChange = useCallback((field: string, canvasPixelDelta: number) => {
        applyDeltaDirectly(field, canvasPixelDelta);
    }, [applyDeltaDirectly]);

    const handleToolDragEnd = useCallback(() => {
        // One-time commit: signal App.tsx to shallow-copy projectData so PropertiesPanel refreshes
        if (onTransformChange) onTransformChange('commit', 0);
    }, [onTransformChange]);

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
