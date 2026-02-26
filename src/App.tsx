import React, { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";
import { parseDragonBonesProject } from './ProjectParser';
import type { DragonBonesData, BoneData, SlotData, AnimationData } from './DataModel';
import { CanvasRenderer } from './components/CanvasRenderer';
import { SceneTree } from './components/SceneTree';
import { LayerPanel } from './components/LayerPanel';
import { TopBar, type ToolType } from './components/TopBar';
import { TimelinePanel } from './components/TimelinePanel';
import { PropertiesPanel } from './components/PropertiesPanel';

function App() {
    const renderStartTime = performance.now();
    const [isPlaying, setIsPlaying] = useState(false);
    const [projectData, setProjectData] = useState<DragonBonesData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Selection state
    const [selectedBone, setSelectedBone] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

    // Left panel tab state
    const [leftTab, setLeftTab] = useState<'tree' | 'layers'>('tree');

    // Mode state (edit mode vs animation mode)
    const [mode, setMode] = useState<'edit' | 'animation'>('edit');

    // Recording state
    const [isRecording, setIsRecording] = useState(false);

    // Editing tool state
    const [selectedTool, setSelectedTool] = useState<ToolType>('move');

    // Animation state
    const [selectedAnimIndex, setSelectedAnimIndex] = useState(0);
    const [currentFrame, _setCurrentFrame] = useState(0);
    const animFrameRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    // High-frequency state for animation (bypasses React loop during playback)
    const currentFrameRef = useRef(0);
    const frameEmitter = useRef(new EventTarget());

    /** Helper to update frame both in state (for UI) and ref (for rendering) */
    const setCurrentFrame = useCallback((frame: number, isFinal = false) => {
        currentFrameRef.current = frame;
        animFrameRef.current = frame;
        frameEmitter.current.dispatchEvent(new CustomEvent('frameChange', { detail: frame }));
        if (isFinal) {
            _setCurrentFrame(frame);
        }
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        console.log("Loading file...", file.name);
        const parsedData = await parseDragonBonesProject(file);
        if (parsedData) {
            setProjectData(parsedData);
            setSelectedBone(null);
            setSelectedSlot(null);
            console.log("Successfully loaded DragonBones Data Model", parsedData);
        }
    };

    const handleOpenClick = () => {
        fileInputRef.current?.click();
    };

    const handleSelectBone = useCallback((name: string) => {
        setSelectedBone(name);
        setSelectedSlot(null);
    }, []);

    const handleSelectSlot = useCallback((name: string) => {
        setSelectedSlot(name);
        setSelectedBone(null);
    }, []);

    const handleDeselect = useCallback(() => {
        setSelectedBone(null);
        setSelectedSlot(null);
    }, []);

    // Handle mode change
    const handleModeChange = useCallback(() => {
        if (mode === 'animation') {
            // Switch to edit mode: pause animation and reset to initial state
            setIsPlaying(false);
            setCurrentFrame(0);
            setMode('edit');
        } else {
            // Switch to animation mode: start playing
            setMode('animation');
            setIsPlaying(true);
        }
    }, [mode]);

    // Handle recording toggle: auto-stop playback when recording begins
    const handleRecordToggle = useCallback(() => {
        if (!isRecording) {
            // Turning recording ON: stop playback first
            setIsPlaying(false);
        }
        setIsRecording(!isRecording);
    }, [isRecording]);

    /**
     * Pending transform edits in animation mode (stopped, non-recording).
     * Key format: "<type>:<name>" e.g. "bone:root" or "slot:body"
     * Value is a snapshot of the transform BEFORE editing (used to restore on discard).
     */
    const [pendingEdits, setPendingEdits] = useState<Map<string, Record<string, number>>>(new Map());
    // Ref to hold transform snapshots for restoration
    const transformSnapshotRef = useRef<Map<string, Record<string, number>>>(new Map());

    // Get current armature and animation
    const armature = projectData?.armatures[0];
    const animations = armature?.animations || [];
    const currentAnimation: AnimationData | null = animations[selectedAnimIndex] || null;

    // Get selected item's transform for properties panel
    const getSelectedTransform = () => {
        if (!projectData) return null;
        const armature = projectData.armatures[0];
        if (!armature) return null;

        if (selectedBone) {
            const bone = armature.bones.find((b: BoneData) => b.name === selectedBone);
            if (bone) return { name: bone.name, type: 'bone' as const, transform: bone.localTransform, parent: bone.parentBoneName };
        }
        if (selectedSlot) {
            const slot = armature.slots.find((s: SlotData) => s.name === selectedSlot);
            if (slot) {
                // Find the slot's display transform from skins
                const skin = armature.skins?.[0];
                if (skin) {
                    const skinSlot = skin.slots.find((ss: any) => ss.name === selectedSlot);
                    if (skinSlot && skinSlot.displays?.[0]) {
                        return { name: slot.name, type: 'slot' as const, transform: skinSlot.displays[0].transform, parent: slot.parentBoneName };
                    }
                }
                return { name: slot.name, type: 'slot' as const, transform: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 }, parent: slot.parentBoneName };
            }
        }
        return null;
    };

    const selectedInfo = getSelectedTransform();

    /**
     * Write current transform values into the animation keyframe at `currentFrame`.
     * If a keyframe already exists at this frame, it is overwritten.
     * Otherwise a new keyframe is inserted (duration = distance to the next keyframe).
     */
    const handleSetKeyframe = useCallback(() => {
        if (!projectData || !currentAnimation || !selectedInfo) return;
        const arm = projectData.armatures[0];
        if (!arm || !selectedBone) return; // Only bone keyframes for now

        let timeline = currentAnimation.bone.find(t => t.name === selectedBone);
        if (!timeline) {
            // Create empty timeline for this bone
            timeline = { name: selectedBone, translateFrame: [], rotateFrame: [], scaleFrame: [] };
            currentAnimation.bone.push(timeline);
        }

        const tf = selectedInfo.transform;

        // Helper: upsert a keyframe at currentFrame in a frame array
        const upsertKF = <T extends { duration: number; tweenEasing: number | null }>(frames: T[], make: () => T) => {
            let elapsed = 0;
            for (let i = 0; i < frames.length; i++) {
                if (elapsed === currentFrame) { frames[i] = { ...frames[i], ...make() }; return; }
                if (elapsed + frames[i].duration > currentFrame) {
                    // Split the keyframe
                    const before = currentFrame - elapsed;
                    const after = frames[i].duration - before;
                    frames.splice(i + 1, 0, { ...frames[i], duration: after });
                    frames[i] = { ...make(), duration: before };
                    return;
                }
                elapsed += frames[i].duration;
            }
            // Append at end
            frames.push({ ...make(), duration: Math.max(1, currentAnimation!.duration - elapsed) });
        };

        upsertKF(timeline.translateFrame, () => ({ duration: 1, x: tf.x, y: tf.y, tweenEasing: 0 }));
        upsertKF(timeline.rotateFrame, () => ({ duration: 1, rotate: tf.skewX, tweenEasing: 0 }));
        upsertKF(timeline.scaleFrame, () => ({ duration: 1, x: tf.scaleX, y: tf.scaleY, tweenEasing: 0 }));

        // Clear pending edits for this item and persist
        const key = `bone:${selectedBone}`;
        setPendingEdits(prev => { const m = new Map(prev); m.delete(key); return m; });
        setProjectData({ ...projectData });
        console.log('已保存关键帧:', selectedBone, '帧', currentFrame);
    }, [projectData, currentAnimation, selectedInfo, currentFrame, selectedBone]);

    // Animation playback loop
    useEffect(() => {
        if (!isPlaying || !currentAnimation || currentAnimation.duration <= 0 || mode === 'edit') return;

        const frameRate = armature?.frameRate || 24;
        const frameDuration = 1000 / frameRate;

        lastTimeRef.current = performance.now();
        animFrameRef.current = currentFrame;

        const tick = (now: number) => {
            const playbackTickGap = now - lastTimeRef.current;
            if (playbackTickGap >= frameDuration) {
                if (playbackTickGap > frameDuration * 1.5) {
                    console.warn(`[App] Playback Jitter: ${playbackTickGap.toFixed(2)}ms (expected ${frameDuration.toFixed(0)}ms)`);
                }

                lastTimeRef.current = now - (playbackTickGap % frameDuration);
                animFrameRef.current += 1;

                if (animFrameRef.current >= currentAnimation.duration) {
                    if (currentAnimation.playTimes === 0) {
                        animFrameRef.current = 0;
                    } else {
                        animFrameRef.current = 0;
                        setIsPlaying(false);
                        setCurrentFrame(0);
                        return;
                    }
                }

                // Update low-latency state
                currentFrameRef.current = animFrameRef.current;
                frameEmitter.current.dispatchEvent(new CustomEvent('frameChange', { detail: animFrameRef.current }));

                // PERFORMANCE: batch state updates if needed, but not every frame
                if (animFrameRef.current % 5 === 0) {
                    _setCurrentFrame(animFrameRef.current);
                }
                
                setPendingEdits(prev => prev.size > 0 ? new Map() : prev);
            }
            rafId = requestAnimationFrame(tick);
        };

        let rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, currentAnimation, armature, mode]);

    /** Discard pending edits and restore transform snapshots, then change frame */
    const handleChangeFrame = useCallback((frame: number) => {
        if (pendingEdits.size > 0 && projectData) {
            // Restore snapshots
            const arm = projectData.armatures[0];
            if (arm) {
                transformSnapshotRef.current.forEach((snapshot, key) => {
                    const [type, name] = key.split(':');
                    if (type === 'bone') {
                        const bone = arm.bones.find((b: BoneData) => b.name === name);
                        if (bone) Object.assign(bone.localTransform, snapshot);
                    } else if (type === 'slot') {
                        const skin = arm.skins?.[0];
                        const skinSlot = skin?.slots.find((ss: any) => ss.name === name);
                        if (skinSlot?.displays?.[0]) Object.assign(skinSlot.displays[0].transform, snapshot);
                    }
                });
            }
            transformSnapshotRef.current.clear();
            setPendingEdits(new Map());
        }
        setCurrentFrame(frame);
    }, [pendingEdits, projectData]);

    const handleMoveSlot = useCallback((slotName: string, direction: 'up' | 'down') => {
        if (!projectData) return;
        const armature = projectData.armatures[0];
        if (!armature) return;

        const slots = armature.slots;
        const sortedByZ = [...slots].sort((a, b) => b.zOrder - a.zOrder);
        const idx = sortedByZ.findIndex(s => s.name === slotName);
        if (idx === -1) return;

        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= sortedByZ.length) return;

        // Swap Z-orders
        const tempZ = sortedByZ[idx].zOrder;
        sortedByZ[idx].zOrder = sortedByZ[swapIdx].zOrder;
        sortedByZ[swapIdx].zOrder = tempZ;

        // Re-sort and force update
        armature.slots.sort((a, b) => a.zOrder - b.zOrder);
        setProjectData({ ...projectData });
    }, [projectData]);

    // selectedInfo is already defined above

    // Handle transform property changes
    const handleTransformChange = useCallback((field: string, delta: number) => {
        if (!projectData) return;

        const isAnimStopped = mode === 'animation' && !isPlaying;
        const isNonRecordAnim = isAnimStopped && !isRecording;

        if (field === 'commit') {
            if (isNonRecordAnim) {
                // Don't persist: the canvas mutation already happened for display,
                // but we do NOT save it to React state. The snapshot will be restored on frame change.
                // Just trigger a UI re-render for PropertiesPanel to reflect current values.
                setProjectData(prev => prev ? { ...prev } : prev);
            } else {
                setProjectData({ ...projectData });
            }
            return;
        }

        const arm = projectData.armatures[0];
        if (!arm) return;

        let transform: any = null;
        const itemKey = selectedBone ? `bone:${selectedBone}` : selectedSlot ? `slot:${selectedSlot}` : null;
        if (selectedBone) {
            const bone = arm.bones.find((b: BoneData) => b.name === selectedBone);
            if (bone) transform = bone.localTransform;
        } else if (selectedSlot) {
            const skin = arm.skins?.[0];
            const skinSlot = skin?.slots.find((ss: any) => ss.name === selectedSlot);
            if (skinSlot?.displays?.[0]) transform = skinSlot.displays[0].transform;
        }
        if (!transform) return;

        // In non-recording animation mode: save snapshot BEFORE first modification
        if (isNonRecordAnim && itemKey && !transformSnapshotRef.current.has(itemKey)) {
            transformSnapshotRef.current.set(itemKey, { ...transform });
        }

        if (field === 'rotation') {
            transform.skewX += delta;
            transform.skewY += delta;
        } else {
            transform[field] += delta;
        }

        if (isNonRecordAnim && itemKey) {
            // Temporary: only update pendingEdits marker, don't call setProjectData
            setPendingEdits(prev => {
                const m = new Map(prev);
                m.set(itemKey, { [field]: delta });
                return m;
            });
            // Don't persist to state — canvas already updated via PIXI mutation
            return;
        }

        // Recording mode: immediately write keyframe
        if (mode === 'animation' && isRecording && selectedBone && currentAnimation && itemKey) {
            let timeline = currentAnimation.bone.find(t => t.name === selectedBone);
            if (!timeline) {
                timeline = { name: selectedBone, translateFrame: [], rotateFrame: [], scaleFrame: [] };
                currentAnimation.bone.push(timeline);
            }
        }

        setProjectData({ ...projectData });
    }, [selectedBone, selectedSlot, projectData, mode, isRecording, isPlaying, currentAnimation]);

    const renderDuration = performance.now() - renderStartTime;
    if (renderDuration > 15) {
        console.warn(`[App] Heavy Render: ${renderDuration.toFixed(2)}ms`);
    }

    return (
        <div className="flex flex-col h-screen bg-[#2c2c2c] text-[#e0e0e0] font-sans text-sm">
            <input
                type="file"
                accept=".dbproj,.json,.zip"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
            />

            {/* Menu Bar */}
            <TopBar
                handleOpenClick={handleOpenClick}
                selectedTool={selectedTool}
                setSelectedTool={setSelectedTool}
                mode={mode}
                handleModeChange={handleModeChange}
            />

            {/* Main Workspace */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel */}
                <div className="w-64 bg-[#333333] border-r border-[#1a1a1a] flex flex-col">
                    {/* Tabs */}
                    <div className="flex bg-[#3a3a3a] border-b border-[#222]">
                        <button
                            className={`flex-1 py-1.5 px-2 text-xs font-semibold border-b-2 transition-colors ${
                                leftTab === 'tree' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
                            }`}
                            onClick={() => setLeftTab('tree')}
                        >
                            场景树
                        </button>
                        <button
                            className={`flex-1 py-1.5 px-2 text-xs font-semibold border-b-2 transition-colors ${
                                leftTab === 'layers' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
                            }`}
                            onClick={() => setLeftTab('layers')}
                        >
                            层级
                        </button>
                    </div>

                    {/* Panel Content */}
                    <div className="flex-1 overflow-y-auto">
                        {!projectData || !armature ? (
                            <div className="text-gray-500 text-xs text-center mt-10 px-4">
                                No project loaded. Click "File (Open...)" to load a .dbproj file.
                            </div>
                        ) : leftTab === 'tree' ? (
                            <SceneTree
                                armature={armature}
                                selectedBone={selectedBone}
                                selectedSlot={selectedSlot}
                                onSelectBone={handleSelectBone}
                                onSelectSlot={handleSelectSlot}
                            />
                        ) : (
                            <LayerPanel
                                slots={armature.slots}
                                selectedSlot={selectedSlot}
                                onSelectSlot={handleSelectSlot}
                                onMoveSlot={handleMoveSlot}
                            />
                        )}
                    </div>
                </div>

                {/* Center Panel - Canvas & Timeline */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Canvas Area */}
                    <div className="flex-1 relative bg-[#1e1e1e] overflow-hidden flex items-center justify-center">
                        {projectData ? (
                            <CanvasRenderer
                                projectData={projectData}
                                selectedArmatureIndex={0}
                                selectedBone={selectedBone}
                                selectedSlot={selectedSlot}
                                onSelectBone={handleSelectBone}
                                onSelectSlot={handleSelectSlot}
                                onDeselect={handleDeselect}
                                    currentAnimation={currentAnimation}
                                    isPlaying={isPlaying}
                                    currentFrame={currentFrame}
                                    frameEmitter={frameEmitter.current}
                                selectedTool={selectedTool}
                                onTransformChange={handleTransformChange}
                            />
                        ) : (
                            <>
                                <div
                                    className="absolute inset-0"
                                    style={{
                                        backgroundImage:
                                            "linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)",
                                        backgroundSize: "20px 20px",
                                        opacity: 0.5,
                                    }}
                                ></div>
                                <div className="text-gray-500 z-10 flex flex-col items-center gap-2">
                                    <div className="w-16 h-16 border-2 border-dashed border-gray-600 rounded-full flex items-center justify-center">
                                        <div className="w-2 h-2 bg-red-500 rounded-full absolute"></div>
                                    </div>
                                    <span>PixiJS Render Canvas</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Timeline Panel — only visible in animation mode */}
                    {mode === 'animation' && (
                        <TimelinePanel
                            animations={animations as AnimationData[]}
                            currentAnimation={currentAnimation}
                            selectedAnimIndex={selectedAnimIndex}
                            setSelectedAnimIndex={setSelectedAnimIndex}
                            currentFrame={currentFrame}
                            currentFrameRef={currentFrameRef}
                            frameEmitter={frameEmitter.current}
                            setCurrentFrame={(f: number) => setCurrentFrame(f, true)}
                            isPlaying={isPlaying}
                            setIsPlaying={setIsPlaying}
                            isRecording={isRecording}
                            handleRecordToggle={handleRecordToggle}
                            selectedInfo={selectedInfo as any}
                            handleSetKeyframe={handleSetKeyframe}
                            handleSelectBone={handleSelectBone}
                        />
                    )}
                </div>

                {/* Right Panel - Properties */}
                <PropertiesPanel
                    selectedInfo={selectedInfo as any}
                    onTransformChange={handleTransformChange}
                    mode={mode}
                    isPlaying={isPlaying}
                    isRecording={isRecording}
                    hasPendingEdits={pendingEdits.size > 0}
                />
            </div>
        </div>
    );
}

export default App;
