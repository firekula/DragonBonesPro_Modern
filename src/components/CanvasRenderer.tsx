import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import type { DragonBonesData, AnimationData } from '../DataModel';
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

                        // Pre-extract alpha data for this sub-texture
                        const frameX = Math.floor(subTex.x);
                        const frameY = Math.floor(subTex.y);
                        const frameW = Math.floor(subTex.width);
                        const frameH = Math.floor(subTex.height);
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
                        const controlSize = 16 / zoom; // 增大控制点大小
                        const controlLineLength = 32 / zoom; // 增大箭头长度
                        const arrowSize = 6 / zoom; // 增大箭头大小

                    // Draw tool controls based on selectedTool
                    if (selectedTool === 'move') {
                        // Draw move tool controls (arrows)
                        const moveControls = new PIXI.Graphics();

                        // X axis arrow
                        moveControls.moveTo(targetMatrix.tx, targetMatrix.ty);
                        moveControls.lineTo(targetMatrix.tx + controlLineLength, targetMatrix.ty);
                        moveControls.lineTo(targetMatrix.tx + controlLineLength - arrowSize, targetMatrix.ty - arrowSize);
                        moveControls.moveTo(targetMatrix.tx + controlLineLength, targetMatrix.ty);
                        moveControls.lineTo(targetMatrix.tx + controlLineLength - arrowSize, targetMatrix.ty + arrowSize);

                        // Y axis arrow
                        moveControls.moveTo(targetMatrix.tx, targetMatrix.ty);
                        moveControls.lineTo(targetMatrix.tx, targetMatrix.ty + controlLineLength);
                        moveControls.lineTo(targetMatrix.tx - arrowSize, targetMatrix.ty + controlLineLength - arrowSize);
                        moveControls.moveTo(targetMatrix.tx, targetMatrix.ty + controlLineLength);
                        moveControls.lineTo(targetMatrix.tx + arrowSize, targetMatrix.ty + controlLineLength - arrowSize);

                        moveControls.stroke({ width: 2 / zoom, color: 0x00ff00, alpha: 1 });
                        outlineLayer.addChild(moveControls);

                        // Draw center point
                        const centerPoint = new PIXI.Graphics();
                        centerPoint.circle(targetMatrix.tx, targetMatrix.ty, controlSize);
                        centerPoint.fill({ color: 0x00ff00, alpha: 1 });
                        centerPoint.eventMode = 'static';
                        centerPoint.cursor = 'move';
                        outlineLayer.addChild(centerPoint);

                        // Add drag functionality to center point (move in both directions)
                        centerPoint.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                            e.stopPropagation();
                            let lastX = e.clientX;
                            let lastY = e.clientY;

                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                const deltaX = moveEvent.clientX - lastX;
                                const deltaY = moveEvent.clientY - lastY;
                                if (onTransformChange) {
                                    onTransformChange('x', deltaX);
                                    onTransformChange('y', deltaY);
                                }
                                lastX = moveEvent.clientX;
                                lastY = moveEvent.clientY;
                            };

                            const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                        });

                        // Add interactive controls for move tool
                        const xArrow = new PIXI.Graphics();
                        xArrow.moveTo(targetMatrix.tx, targetMatrix.ty);
                        xArrow.lineTo(targetMatrix.tx + controlLineLength, targetMatrix.ty);
                        xArrow.lineTo(targetMatrix.tx + controlLineLength - arrowSize, targetMatrix.ty - arrowSize);
                        xArrow.moveTo(targetMatrix.tx + controlLineLength, targetMatrix.ty);
                        xArrow.lineTo(targetMatrix.tx + controlLineLength - arrowSize, targetMatrix.ty + arrowSize);
                        xArrow.stroke({ width: 3 / zoom, color: 0x00ff00, alpha: 1 });
                        xArrow.eventMode = 'static';
                        xArrow.cursor = 'ew-resize';
                        outlineLayer.addChild(xArrow);

                        // Add drag functionality to X arrow
                        xArrow.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                            e.stopPropagation();
                            let lastX = e.clientX;

                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                const deltaX = moveEvent.clientX - lastX;
                                if (onTransformChange) {
                                    onTransformChange('x', deltaX);
                                }
                                lastX = moveEvent.clientX;
                            };

                            const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                        });

                        const yArrow = new PIXI.Graphics();
                        yArrow.moveTo(targetMatrix.tx, targetMatrix.ty);
                        yArrow.lineTo(targetMatrix.tx, targetMatrix.ty + controlLineLength);
                        yArrow.lineTo(targetMatrix.tx - arrowSize, targetMatrix.ty + controlLineLength - arrowSize);
                        yArrow.moveTo(targetMatrix.tx, targetMatrix.ty + controlLineLength);
                        yArrow.lineTo(targetMatrix.tx + arrowSize, targetMatrix.ty + controlLineLength - arrowSize);
                        yArrow.stroke({ width: 3 / zoom, color: 0x00ff00, alpha: 1 });
                        yArrow.eventMode = 'static';
                        yArrow.cursor = 'ns-resize';
                        outlineLayer.addChild(yArrow);

                        // Add drag functionality to Y arrow
                        yArrow.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                            e.stopPropagation();
                            let lastY = e.clientY;

                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                const deltaY = moveEvent.clientY - lastY;
                                if (onTransformChange) {
                                    onTransformChange('y', deltaY);
                                }
                                lastY = moveEvent.clientY;
                            };

                            const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                        });
                    } else if (selectedTool === 'scale') {
                        // Draw scale tool controls
                        const scaleControls = new PIXI.Graphics();

                        // Scale handles
                        const handles = [
                            { x: 1, y: 0 }, // right
                            { x: -1, y: 0 }, // left
                            { x: 0, y: 1 }, // bottom
                            { x: 0, y: -1 }, // top
                            { x: 1, y: 1 }, // bottom-right
                            { x: -1, y: 1 }, // bottom-left
                            { x: 1, y: -1 }, // top-right
                            { x: -1, y: -1 }, // top-left
                        ];

                        handles.forEach(handle => {
                            const handleX = targetMatrix.tx + handle.x * controlLineLength;
                            const handleY = targetMatrix.ty + handle.y * controlLineLength;
                            const handleControl = new PIXI.Graphics();
                            handleControl.circle(handleX, handleY, controlSize);
                            handleControl.fill({ color: 0x0000ff, alpha: 1 });
                            handleControl.eventMode = 'static';
                            handleControl.cursor = 'pointer';
                            outlineLayer.addChild(handleControl);

                            // Add drag functionality to scale handles
                            handleControl.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                                e.stopPropagation();
                                let lastX = e.clientX;
                                let lastY = e.clientY;

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                    const deltaX = (moveEvent.clientX - lastX) * 0.01;
                                    const deltaY = (moveEvent.clientY - lastY) * 0.01;
                                    if (onTransformChange) {
                                        // 基于世界坐标方向缩放，直接应用delta值
                                        if (handle.x !== 0) {
                                            onTransformChange('scaleX', deltaX * handle.x);
                                        }
                                        if (handle.y !== 0) {
                                            onTransformChange('scaleY', deltaY * handle.y);
                                        }
                                    }
                                    lastX = moveEvent.clientX;
                                    lastY = moveEvent.clientY;
                                };

                                const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                };

                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                            });
                        });
                    } else if (selectedTool === 'rotate') {
                        // Draw rotate tool controls
                        const rotateControls = new PIXI.Graphics();

                        // Rotate handle
                        const rotateRadius = controlLineLength * 2;
                        const handleX = targetMatrix.tx + Math.cos(Math.PI / 4) * rotateRadius;
                        const handleY = targetMatrix.ty + Math.sin(Math.PI / 4) * rotateRadius;

                        // Draw rotation arc
                        rotateControls.arc(targetMatrix.tx, targetMatrix.ty, rotateRadius / 2, 0, Math.PI / 4);
                        rotateControls.stroke({ width: 2 / zoom, color: 0xff0000, alpha: 1 });

                        // Draw rotate handle
                        const rotateHandle = new PIXI.Graphics();
                        rotateHandle.circle(handleX, handleY, controlSize);
                        rotateHandle.fill({ color: 0xff0000, alpha: 1 });
                        rotateHandle.eventMode = 'static';
                        rotateHandle.cursor = 'grabbing';
                        outlineLayer.addChild(rotateHandle);

                        // Add drag functionality to rotate handle
                        rotateHandle.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                            e.stopPropagation();
                            let lastX = e.clientX;
                            let lastY = e.clientY;
                            const centerX = targetMatrix.tx;
                            const centerY = targetMatrix.ty;
                            let lastAngle = Math.atan2(lastY - centerY, lastX - centerX);

                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                // 计算当前鼠标位置与中心点的夹角
                                const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
                                // 计算角度差
                                let deltaAngle = (currentAngle - lastAngle) * (180 / Math.PI);
                                // 确保角度差在合理范围内
                                if (deltaAngle > 180) deltaAngle -= 360;
                                if (deltaAngle < -180) deltaAngle += 360;
                                if (onTransformChange) {
                                    onTransformChange('skewX', deltaAngle);
                                }
                                lastX = moveEvent.clientX;
                                lastY = moveEvent.clientY;
                                lastAngle = currentAngle;
                            };

                            const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                        });

                        // Draw rotation arc
                        const arc = new PIXI.Graphics();
                        arc.arc(targetMatrix.tx, targetMatrix.ty, rotateRadius / 2, 0, Math.PI / 4);
                        arc.stroke({ width: 3 / zoom, color: 0xff0000, alpha: 1 });
                        outlineLayer.addChild(arc);
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
            if (selectedSlot === slotName && outlineLayer && alphaCtx) {
                const subTex = subTextureMap[display.path];
                if (subTex) {
                    const frameW = Math.floor(subTex.width);
                    const frameH = Math.floor(subTex.height);
                    const frameX = Math.floor(subTex.x);
                    const frameY = Math.floor(subTex.y);

                    // Current zoom for zoom-independent line widths
                    const zoom = zoomRef.current;

                    // 1. Dashed bounding box (zoom-independent line width)
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
                    const contourCanvas = document.createElement('canvas');
                    contourCanvas.width = frameW;
                    contourCanvas.height = frameH;
                    const ctx = contourCanvas.getContext('2d')!;
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
        });

        // Draw bone wireframes with click-to-select on joints
        armature.bones.forEach((bone: any) => {
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
            if (boneLayer) {
                boneLayer.addChild(joint);
                boneJoints.set(bone.name, joint);
            }
        });
    }, [currentAnimation, currentFrame, selectedBone, selectedSlot, onSelectBone]);

    // 节流函数，限制函数调用频率
    const throttle = (func: Function, limit: number) => {
        let inThrottle: boolean;
        return function(this: any, ...args: any[]) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    };

    // 节流处理的更新渲染函数
    const throttledUpdateRendering = useCallback(throttle(() => {
        updateRendering();
    }, 16), [updateRendering]);

    // Update rendering when animation or selection changes
    useEffect(() => {
        // 使用节流和requestAnimationFrame来批量处理渲染更新，减少闪烁
        const rafId = requestAnimationFrame(throttledUpdateRendering);
        return () => cancelAnimationFrame(rafId);
    }, [currentAnimation, currentFrame, selectedBone, selectedSlot, onSelectBone, throttledUpdateRendering]);

    return (
        <div 
            ref={containerRef} 
            className="w-full h-full relative"
            style={{ backgroundColor: '#1e1e1e' }}
        />
    );
}
