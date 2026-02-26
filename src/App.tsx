import React, { useState, useRef, useCallback, useEffect } from "react";
import { Settings, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import "./App.css";
import { parseDragonBonesProject } from './ProjectParser';
import type { DragonBonesData, BoneData, SlotData, AnimationData } from './DataModel';
import { CanvasRenderer } from './components/CanvasRenderer';
import { SceneTree } from './components/SceneTree';
import { LayerPanel } from './components/LayerPanel';

function App() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [projectData, setProjectData] = useState<DragonBonesData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Selection state
    const [selectedBone, setSelectedBone] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

    // Left panel tab state
    const [leftTab, setLeftTab] = useState<'tree' | 'layers'>('tree');

    // Animation state
    const [selectedAnimIndex, setSelectedAnimIndex] = useState(0);
    const [currentFrame, setCurrentFrame] = useState(0);
    const animFrameRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

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

    // Get current armature and animation
    const armature = projectData?.armatures[0];
    const animations = armature?.animations || [];
    const currentAnimation: AnimationData | null = animations[selectedAnimIndex] || null;

    // Animation playback loop
    useEffect(() => {
        if (!isPlaying || !currentAnimation || currentAnimation.duration <= 0) return;

        const frameRate = armature?.frameRate || 24;
        const frameDuration = 1000 / frameRate;

        lastTimeRef.current = performance.now();
        animFrameRef.current = currentFrame;

        const tick = (now: number) => {
            const delta = now - lastTimeRef.current;
            if (delta >= frameDuration) {
                lastTimeRef.current = now - (delta % frameDuration);
                animFrameRef.current += 1;

                // Loop or stop
                if (animFrameRef.current >= currentAnimation.duration) {
                    if (currentAnimation.playTimes === 0) {
                        // Loop forever
                        animFrameRef.current = 0;
                    } else {
                        animFrameRef.current = 0;
                        setIsPlaying(false);
                        setCurrentFrame(0);
                        return;
                    }
                }

                setCurrentFrame(animFrameRef.current);
            }
            rafId = requestAnimationFrame(tick);
        };

        let rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, currentAnimation, armature]);

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

    // Handle transform property changes from the properties panel
    const handleTransformChange = useCallback((field: string, value: number) => {
        if (!selectedInfo || !projectData) return;
        // The transform object is a direct reference to the data model
        (selectedInfo.transform as any)[field] = value;
        // Force re-render by shallow-copying projectData
        setProjectData({ ...projectData });
    }, [selectedInfo, projectData]);

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
            <div className="flex items-center h-8 bg-[#383838] px-2 border-b border-[#1a1a1a]">
                <div className="flex gap-4">
                    <div className="relative group">
                        <span className="cursor-pointer hover:text-white" onClick={handleOpenClick}>File (Open...)</span>
                    </div>
                    <span className="cursor-pointer hover:text-white">Edit</span>
                    <span className="cursor-pointer hover:text-white">View</span>
                    <span className="cursor-pointer hover:text-white">Help</span>
                </div>
            </div>

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
                                currentAnimation={isPlaying || currentFrame > 0 ? currentAnimation : null}
                                currentFrame={currentFrame}
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

                    {/* Timeline Panel */}
                    <div className="h-48 bg-[#2a2a2a] border-t border-[#1a1a1a] flex flex-col">
                        <div className="flex items-center justify-between p-2 bg-[#383838] border-b border-[#222]">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs">Timeline</span>
                                {animations.length > 0 && (
                                    <select
                                        className="bg-[#222] text-white text-xs border border-[#555] rounded px-1 py-0.5 outline-none"
                                        value={selectedAnimIndex}
                                        onChange={(e) => {
                                            setSelectedAnimIndex(Number(e.target.value));
                                            setCurrentFrame(0);
                                            setIsPlaying(false);
                                        }}
                                    >
                                        {animations.map((anim: AnimationData, i: number) => (
                                            <option key={i} value={i}>{anim.name} ({anim.duration}f)</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="flex gap-1 items-center">
                                <button
                                    onClick={() => { setCurrentFrame(0); setIsPlaying(false); }}
                                    className="p-1 hover:bg-[#555] rounded" title="Reset"
                                >
                                    <SkipBack size={14} />
                                </button>
                                <button
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    className="p-1 hover:bg-[#555] rounded" title={isPlaying ? 'Pause' : 'Play'}
                                    disabled={!currentAnimation || currentAnimation.duration <= 0}
                                >
                                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                                </button>
                                <button
                                    onClick={() => {
                                        if (currentAnimation) {
                                            setCurrentFrame(Math.min(currentFrame + 1, currentAnimation.duration - 1));
                                        }
                                    }}
                                    className="p-1 hover:bg-[#555] rounded" title="Step Forward"
                                >
                                    <SkipForward size={14} />
                                </button>
                                <span className="text-[10px] text-gray-400 ml-2">
                                    {currentFrame} / {currentAnimation?.duration || 0}
                                </span>
                            </div>
                        </div>
                        <div className="flex-1 flex">
                            {/* Bone name list */}
                            <div className="w-48 border-r border-[#1a1a1a] bg-[#333] overflow-y-auto">
                                {currentAnimation?.bone.map((bt, i) => (
                                    <div key={i} className="py-1 px-2 border-b border-[#222] text-xs truncate">{bt.name}</div>
                                ))}
                            </div>
                            {/* Frame grid */}
                            <div className="flex-1 bg-[#1e1e1e] relative overflow-hidden">
                                {/* Frame number header */}
                                <div className="h-6 bg-[#2a2a2a] border-b border-[#222] flex items-end relative">
                                    {currentAnimation && [...Array(Math.max(currentAnimation.duration, 1))].map((_, i) => (
                                        <div key={i}
                                            className="border-l border-[#444] h-2 cursor-pointer"
                                            style={{ width: '12px', minWidth: '12px' }}
                                            onClick={() => { setCurrentFrame(i); setIsPlaying(false); }}
                                        >
                                            {i % 5 === 0 && (
                                                <span className="absolute -top-4 text-[9px] text-gray-500">{i}</span>
                                            )}
                                        </div>
                                    ))}
                                    {/* Playhead */}
                                    {currentAnimation && currentAnimation.duration > 0 && (
                                        <div
                                            className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none"
                                            style={{ left: `${currentFrame * 12}px` }}
                                        />
                                    )}
                                </div>
                                {/* Bone timeline rows */}
                                {currentAnimation?.bone.map((bt, i) => (
                                    <div key={i} className="h-7 border-b border-[#222] flex items-center relative">
                                        {bt.translateFrame.map((_kf, j) => {
                                            let framePos = 0;
                                            for (let k = 0; k < j; k++) framePos += bt.translateFrame[k].duration;
                                            return (
                                                <div key={`t${j}`}
                                                    className="w-2 h-2 bg-blue-500 rounded-full transform rotate-45 cursor-pointer hover:bg-white absolute"
                                                    style={{ left: `${framePos * 12 + 3}px` }}
                                                    title={`Translate @${framePos}`}
                                                />
                                            );
                                        })}
                                        {bt.rotateFrame.map((_kf, j) => {
                                            let framePos = 0;
                                            for (let k = 0; k < j; k++) framePos += bt.rotateFrame[k].duration;
                                            return (
                                                <div key={`r${j}`}
                                                    className="w-2 h-2 bg-green-500 rounded-full transform rotate-45 cursor-pointer hover:bg-white absolute"
                                                    style={{ left: `${framePos * 12 + 3}px` }}
                                                    title={`Rotate @${framePos}`}
                                                />
                                            );
                                        })}
                                        {/* Playhead line */}
                                        {currentAnimation && currentAnimation.duration > 0 && (
                                            <div
                                                className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none opacity-50"
                                                style={{ left: `${currentFrame * 12}px` }}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel - Properties */}
                <div className="w-64 bg-[#333333] border-l border-[#1a1a1a] flex flex-col">
                    <div className="p-2 bg-[#383838] border-b border-[#222] font-semibold flex items-center gap-2 text-xs">
                        <Settings size={14} /> Properties
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-4">
                        {selectedInfo ? (
                            <>
                                {/* Selected Item Name */}
                                <div className="text-[11px] text-gray-400">
                                    {selectedInfo.type === 'bone' ? '🦴 Bone' : '🖼 Slot'}: <span className="text-white font-medium">{selectedInfo.name}</span>
                                    {selectedInfo.parent && (
                                        <div className="mt-0.5">Parent: <span className="text-blue-300">{selectedInfo.parent}</span></div>
                                    )}
                                </div>

                                {/* Transform Group */}
                                <div>
                                    <div className="text-gray-400 mb-2 uppercase text-[10px] font-bold tracking-wider">
                                        Transform
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { label: 'X', field: 'x' },
                                            { label: 'Y', field: 'y' },
                                            { label: 'Rotation', field: 'skewX' },
                                            { label: 'Scale X', field: 'scaleX', step: 0.1 },
                                            { label: 'Scale Y', field: 'scaleY', step: 0.1 },
                                            { label: 'Skew Y', field: 'skewY' },
                                        ].map(({ label, field, step }) => (
                                            <div key={field} className="flex flex-col">
                                                <span className="text-[10px] text-gray-500">{label}</span>
                                                <input
                                                    type="number"
                                                    step={step || 1}
                                                    className="bg-[#222] border border-[#444] rounded px-2 py-1 outline-none focus:border-blue-500 text-xs"
                                                    value={parseFloat((selectedInfo.transform as any)[field].toFixed(2))}
                                                    onChange={(e) => handleTransformChange(field, parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Inheritance (only for bones) */}
                                {selectedInfo.type === 'bone' && (
                                    <div>
                                        <div className="text-gray-400 mb-2 uppercase text-[10px] font-bold tracking-wider">
                                            Inheritance
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="flex items-center gap-2 cursor-pointer text-xs">
                                                <input type="checkbox" defaultChecked className="accent-blue-500" />
                                                <span>Translation</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer text-xs">
                                                <input type="checkbox" defaultChecked className="accent-blue-500" />
                                                <span>Rotation</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer text-xs">
                                                <input type="checkbox" defaultChecked className="accent-blue-500" />
                                                <span>Scale</span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-gray-500 text-xs text-center mt-10">
                                Select a bone or slot to view properties
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
