import React, { useRef, useCallback, useState, memo, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Circle, Save, X } from 'lucide-react';
import type { AnimationData, BoneTimeline, BezierCurve } from '../DataModel';
import type { SelectedInfo } from './PropertiesPanel';

interface TimelinePanelProps {
    animations: AnimationData[];
    currentAnimation: AnimationData | null;
    selectedAnimIndex: number;
    setSelectedAnimIndex: (index: number) => void;
    currentFrame: number;
    currentFrameRef?: React.MutableRefObject<number>;
    frameEmitter?: EventTarget;
    setCurrentFrame: (frame: number) => void;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    isRecording: boolean;
    handleRecordToggle: () => void;
    selectedInfo: SelectedInfo | null;
    handleSetKeyframe: () => void;
    handleDeleteKeyframe: (bt: BoneTimeline, kf: KFInfo) => void;
    handleSelectBone: (name: string) => void;
}

const ROW_HEIGHT = 28; // px height per bone row
const DEFAULT_FRAME_WIDTH = 14; // default px width per frame column
const LABEL_WIDTH = 160; // px width of bone label column

/** Bezier curve mini-editor shown in a popover */
function CurveEditor({ curve, onChange, onClose }: {
    curve: BezierCurve;
    onChange: (c: BezierCurve) => void;
    onClose: () => void;
}) {
    // Simple numeric input editor — visual canvas editor would be Phase 2
    const fields: { label: string; key: keyof BezierCurve }[] = [
        { label: 'CP1 X', key: 'cx1' }, { label: 'CP1 Y', key: 'cy1' },
        { label: 'CP2 X', key: 'cx2' }, { label: 'CP2 Y', key: 'cy2' },
    ];

    // Canvas interaction state
    const [draggingPoint, setDraggingPoint] = useState<0 | 1 | null>(null);

    // Draw curve preview in a small canvas
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawPreview = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        // Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);
        // Grid
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1;
        [0.25, 0.5, 0.75].forEach(t => {
            ctx.beginPath(); ctx.moveTo(t * W, 0); ctx.lineTo(t * W, H); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, t * H); ctx.lineTo(W, t * H); ctx.stroke();
        });
        // Control point lines
        ctx.strokeStyle = '#555';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(curve.cx1 * W, (1 - curve.cy1) * H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(curve.cx2 * W, (1 - curve.cy2) * H); ctx.stroke();
        ctx.setLineDash([]);
        // Curve
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.bezierCurveTo(
            curve.cx1 * W, (1 - curve.cy1) * H,
            curve.cx2 * W, (1 - curve.cy2) * H,
            W, 0
        );
        ctx.stroke();
        // Control points
        [[curve.cx1 * W, (1 - curve.cy1) * H], [curve.cx2 * W, (1 - curve.cy2) * H]].forEach(([x, y], index) => {
            ctx.fillStyle = draggingPoint === index ? '#f97316' : '#facc15';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }, [curve, draggingPoint]);

    // Draw whenever curve or ref changes
    useCallback(() => { drawPreview(); }, [drawPreview])();

    // Handle canvas mouse events for dragging control points
    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const W = canvas.width, H = canvas.height;
        
        // Check if clicked on a control point
        const points = [
            { x: curve.cx1 * W, y: (1 - curve.cy1) * H },
            { x: curve.cx2 * W, y: (1 - curve.cy2) * H }
        ];
        
        for (let i = 0; i < points.length; i++) {
            const dx = x - points[i].x;
            const dy = y - points[i].y;
            if (Math.sqrt(dx * dx + dy * dy) <= 8) {
                setDraggingPoint(i as 0 | 1);
                break;
            }
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (draggingPoint === null) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const W = canvas.width, H = canvas.height;
        
        // Clamp values between 0 and 1
        const newX = Math.max(0, Math.min(1, x / W));
        const newY = Math.max(0, Math.min(1, 1 - (y / H)));
        
        if (draggingPoint === 0) {
            onChange({ ...curve, cx1: newX, cy1: newY });
        } else {
            onChange({ ...curve, cx2: newX, cy2: newY });
        }
    };

    const handleCanvasMouseUp = () => {
        setDraggingPoint(null);
    };

    const handleCanvasMouseLeave = () => {
        setDraggingPoint(null);
    };

    return (
        <div className="absolute z-50 bottom-full mb-1 right-0 bg-[#282828] border border-[#444] rounded shadow-xl p-3 w-64">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-blue-300">贝塞尔曲线编辑</span>
                <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={12} /></button>
            </div>
            {/* Preview canvas */}
            <canvas
                ref={r => { (canvasRef as any).current = r; if (r) { drawPreview(); } }}
                width={220} height={80}
                className="w-full rounded mb-2 border border-[#333] cursor-crosshair"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseLeave}
            />
            {/* Presets */}
            <div className="flex gap-1 mb-2 flex-wrap">
                {
                    [
                        { label: 'Linear', c: { cx1: 0, cy1: 0, cx2: 1, cy2: 1 } },
                        { label: 'Ease In', c: { cx1: 0.42, cy1: 0, cx2: 1, cy2: 1 } },
                        { label: 'Ease Out', c: { cx1: 0, cy1: 0, cx2: 0.58, cy2: 1 } },
                        { label: 'Ease', c: { cx1: 0.25, cy1: 0.1, cx2: 0.25, cy2: 1 } },
                        { label: 'Ease In Out', c: { cx1: 0.42, cy1: 0, cx2: 0.58, cy2: 1 } },
                        { label: 'Elastic', c: { cx1: 0.68, cy1: -0.6, cx2: 0.34, cy2: 1.6 } },
                        { label: 'Bounce', c: { cx1: 0.68, cy1: 1.55, cx2: 0.26, cy2: 1 } },
                        { label: 'Back', c: { cx1: 0.17, cy1: -0.4, cx2: 0.88, cy2: 1.4 } },
                    ].map(({ label, c }) => (
                        <button key={label} onClick={() => onChange(c)}
                            className="text-[9px] px-1.5 py-0.5 bg-[#333] hover:bg-blue-700 rounded">
                            {label}
                        </button>
                    ))
                }
            </div>
            {/* Numeric fields */}
            <div className="grid grid-cols-2 gap-1.5">
                {fields.map(({ label, key }) => (
                    <div key={key} className="flex flex-col gap-0.5">
                        <label className="text-[9px] text-gray-400">{label}</label>
                        <input
                            type="number" step={0.01} min={0} max={1}
                            value={parseFloat(curve[key].toFixed(3))}
                            onChange={e => onChange({ ...curve, [key]: parseFloat(e.target.value) || 0 })}
                            className="bg-[#1a1a1a] border border-[#444] rounded px-1 py-0.5 text-[10px] outline-none focus:border-blue-500 w-full"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

type KFInfo = { type: 'translate' | 'rotate' | 'scale'; kfIndex: number; framePos: number; hasCurve: boolean; curve?: BezierCurve };

export function TimelinePanel({
    animations,
    currentAnimation,
    selectedAnimIndex,
    setSelectedAnimIndex,
    currentFrame,
    currentFrameRef,
    frameEmitter,
    setCurrentFrame,
    isPlaying,
    setIsPlaying,
    isRecording,
    handleRecordToggle,
    selectedInfo,
    handleSetKeyframe,
    handleDeleteKeyframe,
    handleSelectBone,
}: TimelinePanelProps) {
    // Synchronized scrolling between bone list and track area
    const labelScrollRef = useRef<HTMLDivElement>(null);
    const trackScrollRef = useRef<HTMLDivElement>(null);

    const syncScroll = (from: 'label' | 'track') => (e: React.UIEvent<HTMLDivElement>) => {
        const scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
        if (from === 'label' && trackScrollRef.current) trackScrollRef.current.scrollTop = scrollTop;
        if (from === 'track' && labelScrollRef.current) labelScrollRef.current.scrollTop = scrollTop;
    };

    // Timeline horizontal zoom
    const [timelineZoom, setTimelineZoom] = useState(1.0);
    const frameWidth = DEFAULT_FRAME_WIDTH * timelineZoom;

    // Curve editor state
    const [curveEditorState, setCurveEditorState] = useState<{
        bt: BoneTimeline; type: 'translate' | 'rotate' | 'scale'; kfIndex: number;
    } | null>(null);

    const openCurveEditor = (bt: BoneTimeline, kf: KFInfo) => {
        setCurveEditorState({ bt, type: kf.type, kfIndex: kf.kfIndex });
    };

    // Low-latency playhead sync
    const playheadRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!frameEmitter || !playheadRef.current) return;
        const handler = (e: any) => {
            if (playheadRef.current) {
                playheadRef.current.style.left = `${e.detail * frameWidth}px`;
            }
        };
        frameEmitter.addEventListener('frameChange', handler);
        return () => frameEmitter.removeEventListener('frameChange', handler);
    }, [frameEmitter, frameWidth]);

    const handleCurveChange = (newCurve: BezierCurve) => {
        if (!curveEditorState) return;
        const { bt, type, kfIndex } = curveEditorState;
        const frames = type === 'translate' ? bt.translateFrame : type === 'rotate' ? bt.rotateFrame : bt.scaleFrame;
        if (frames[kfIndex]) {
            (frames[kfIndex] as any).curve = newCurve;
        }
    };

    const totalFrames = currentAnimation?.duration || 0;
    const trackWidth = totalFrames * frameWidth;

    return (
        <div className={`h-52 bg-[#2a2a2a] border-t flex flex-col select-none transition-colors duration-300 ${isRecording ? 'border-red-600/80 shadow-[0_0_10px_rgba(220,38,38,0.2)]' : 'border-[#1a1a1a]'}`}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-2 py-1 bg-[#383838] border-b border-[#222] flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs">Timeline</span>
                    {animations.length > 0 && (
                        <select
                            className="bg-[#222] text-white text-xs border border-[#555] rounded px-1 py-0.5 outline-none"
                            value={selectedAnimIndex}
                            onChange={(e) => { setSelectedAnimIndex(Number(e.target.value)); setCurrentFrame(0); }}
                        >
                            {animations.map((anim: AnimationData, i: number) => (
                                <option key={i} value={i}>{anim.name} ({anim.duration}f)</option>
                            ))}
                        </select>
                    )}
                    <div className="flex items-center gap-1 ml-4 bg-[#222] px-2 py-0.5 rounded border border-[#444]">
                        <span className="text-[10px] text-gray-400">Zoom</span>
                        <input
                            type="range" min={0.5} max={5} step={0.1}
                            value={timelineZoom}
                            onChange={e => setTimelineZoom(parseFloat(e.target.value))}
                            className="w-20 h-1 accent-blue-500 cursor-pointer"
                        />
                        <span className="text-[10px] text-gray-400 w-6">{timelineZoom.toFixed(1)}x</span>
                    </div>
                </div>
                <div className="flex gap-1 items-center">
                    <button onClick={() => { setCurrentFrame(0); setIsPlaying(false); }} className="p-1 hover:bg-[#555] rounded" title="Reset">
                        <SkipBack size={13} />
                    </button>
                    <button onClick={() => setIsPlaying(!isPlaying)} className="p-1 hover:bg-[#555] rounded"
                        disabled={!currentAnimation || currentAnimation.duration <= 0}>
                        {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button onClick={() => { if (currentAnimation) setCurrentFrame(Math.min(currentFrame + 1, currentAnimation.duration - 1)); }}
                        className="p-1 hover:bg-[#555] rounded"><SkipForward size={13} /></button>
                    <button onClick={handleRecordToggle}
                        className={`p-1 hover:bg-[#555] rounded ${isRecording ? 'text-red-500' : ''}`}>
                        <Circle size={13} />
                    </button>
                    <button onClick={handleSetKeyframe} className="p-1 hover:bg-[#555] rounded"
                        disabled={!selectedInfo || !currentAnimation} title="Set Keyframe">
                        <Save size={13} />
                    </button>
                    {currentAnimation && (
                        <div className="ml-2 flex items-center gap-1 bg-[#222] px-2 py-0.5 rounded border border-[#444]">
                            <span className="text-[10px] text-gray-400">Loop:</span>
                            <select
                                className="bg-[#1a1a1a] text-white text-xs border border-[#444] rounded px-1 py-0.5 outline-none w-20"
                                value={currentAnimation.playTimes === 0 ? 'loop' : currentAnimation.playTimes.toString()}
                                onChange={(e) => {
                                    if (e.target.value === 'loop') {
                                        currentAnimation.playTimes = 0;
                                    } else {
                                        currentAnimation.playTimes = parseInt(e.target.value) || 1;
                                    }
                                }}
                            >
                                <option value="loop">Loop</option>
                                <option value="1">1x</option>
                                <option value="2">2x</option>
                                <option value="3">3x</option>
                                <option value="5">5x</option>
                            </select>
                        </div>
                    )}
                    <span className="text-[10px] text-gray-400 ml-1 tabular-nums">
                        {isPlaying ? (currentFrameRef?.current || 0) : currentFrame} / {totalFrames}
                    </span>
                </div>
            </div>

            {/* Main timeline body */}
            <div className="flex-1 flex overflow-hidden">
                {/* Bone label column */}
                <div
                    ref={labelScrollRef}
                    className="bg-[#333] border-r border-[#1a1a1a] overflow-y-scroll overflow-x-hidden flex-shrink-0"
                    style={{ width: LABEL_WIDTH }}
                    onScroll={syncScroll('label')}
                >
                    {/* Header spacer matching frame ruler height */}
                    <div style={{ height: 20 }} className="border-b border-[#222] bg-[#2a2a2a] flex-shrink-0" />
                    {currentAnimation?.layers[0]?.bone.map((bt: any, i: number) => (
                        <BoneLabel 
                            key={i} 
                            name={bt.name} 
                            isSelected={selectedInfo?.name === bt.name} 
                            onClick={() => handleSelectBone(bt.name)} 
                        />
                    ))}
                </div>

                {/* Track area */}
                <div
                    ref={trackScrollRef}
                    className="flex-1 overflow-auto"
                    onScroll={syncScroll('track')}
                >
                    <div style={{ width: Math.max(trackWidth + frameWidth, 400), position: 'relative', minHeight: '100%', minWidth: '100%' }}>
                        {/* Frame ruler */}
                        <div
                            className="flex items-end bg-[#2a2a2a] border-b border-[#222] sticky top-0 z-30"
                            style={{ 
                                height: 20,
                                backgroundImage: `linear-gradient(to right, #3a3a3a 1px, transparent 1px)`,
                                backgroundSize: `${frameWidth}px 100%`
                            }}
                            onClick={e => {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const frame = Math.floor(x / frameWidth);
                                setCurrentFrame(Math.max(0, Math.min(totalFrames - 1, frame)));
                            }}
                        >
                            {/* Static frame markers (only every 5 frames to keep DOM light) */}
                            {totalFrames > 0 && Array.from({ length: Math.ceil(totalFrames / 5) }).map((_, i) => (
                                <div key={i*5} className="absolute h-2 border-l border-gray-600"
                                    style={{ left: i * 5 * frameWidth }}>
                                    <span className="absolute -top-3 left-0.5 text-[8px] text-gray-500">{i*5}</span>
                                </div>
                            ))}
                        </div>

                        {/* Full-height vertical playhead overlay */}
                        {totalFrames > 0 && (
                            <div 
                                ref={playheadRef}
                                className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none z-20"
                                style={{ left: currentFrame * frameWidth }} 
                            />
                        )}

                        {/* Animation clips */}
                        {currentAnimation && (
                            <div className="border-b border-[#2a2a2a]">
                                {/* Clips header */}
                                <div className="flex items-center px-2 py-1 bg-[#2a2a2a] border-b border-[#1a1a1a]">
                                    <span className="font-semibold text-xs mr-2">动画片段</span>
                                    <button
                                        onClick={() => {
                                            // Add new clip
                                            if (currentAnimation) {
                                                currentAnimation.clips.push({
                                                    name: `Clip ${currentAnimation.clips.length + 1}`,
                                                    startTime: 0,
                                                    endTime: currentAnimation.duration - 1,
                                                    loop: false
                                                });
                                            }
                                        }}
                                        className="p-1 hover:bg-[#555] rounded ml-1"
                                        title="Add Clip"
                                    >
                                        +
                                    </button>
                                </div>
                                {/* Clips list */}
                                {currentAnimation.clips.map((clip, clipIndex) => (
                                    <div key={clipIndex} className="flex items-center px-4 py-1 border-b border-[#1e1e1e]">
                                        <input
                                            type="text"
                                            value={clip.name}
                                            onChange={(e) => {
                                                clip.name = e.target.value;
                                            }}
                                            className="bg-[#1a1a1a] border border-[#444] rounded px-1 py-0.5 text-xs outline-none focus:border-blue-500 flex-1 mr-2"
                                        />
                                        <div className="flex items-center gap-2 text-xs">
                                            <span>Start:</span>
                                            <input
                                                type="number"
                                                value={clip.startTime}
                                                onChange={(e) => {
                                                    clip.startTime = parseInt(e.target.value) || 0;
                                                    clip.startTime = Math.max(0, Math.min(clip.startTime, clip.endTime - 1));
                                                }}
                                                className="bg-[#1a1a1a] border border-[#444] rounded px-1 py-0.5 text-xs outline-none focus:border-blue-500 w-12"
                                            />
                                            <span>End:</span>
                                            <input
                                                type="number"
                                                value={clip.endTime}
                                                onChange={(e) => {
                                                    clip.endTime = parseInt(e.target.value) || 0;
                                                    clip.endTime = Math.max(clip.startTime + 1, Math.min(clip.endTime, currentAnimation.duration - 1));
                                                }}
                                                className="bg-[#1a1a1a] border border-[#444] rounded px-1 py-0.5 text-xs outline-none focus:border-blue-500 w-12"
                                            />
                                            <input
                                                type="checkbox"
                                                checked={clip.loop}
                                                onChange={(e) => {
                                                    clip.loop = e.target.checked;
                                                }}
                                                className="h-3 w-3"
                                                title="Loop"
                                            />
                                            <button
                                                onClick={() => {
                                                    // Preview clip
                                                    setCurrentFrame(clip.startTime);
                                                    // TODO: Play only the clip range
                                                }}
                                                className="p-1 hover:bg-[#555] rounded"
                                                title="Preview"
                                            >
                                                ▶
                                            </button>
                                            <button
                                                onClick={() => {
                                                    // Delete clip
                                                    currentAnimation.clips.splice(clipIndex, 1);
                                                }}
                                                className="p-1 hover:bg-[#555] rounded text-red-400"
                                                title="Delete"
                                            >
                                                -
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Layer rows */}
                        {currentAnimation?.layers.map((layer, layerIndex) => (
                            <div key={layerIndex} className="border-b border-[#2a2a2a]">
                                {/* Layer header */}
                                <div className="flex items-center px-2 py-1 bg-[#2a2a2a] border-b border-[#1a1a1a]">
                                    <input
                                        type="checkbox"
                                        checked={layer.visible}
                                        onChange={(e) => {
                                            layer.visible = e.target.checked;
                                        }}
                                        className="mr-2 h-3 w-3"
                                    />
                                    <input
                                        type="text"
                                        value={layer.name}
                                        onChange={(e) => {
                                            layer.name = e.target.value;
                                        }}
                                        className="bg-[#1a1a1a] border border-[#444] rounded px-1 py-0.5 text-xs outline-none focus:border-blue-500 flex-1"
                                    />
                                    <button
                                        onClick={() => {
                                            // Add new layer
                                            currentAnimation?.layers.push({
                                                name: `Layer ${currentAnimation.layers.length + 1}`,
                                                visible: true,
                                                bone: []
                                            });
                                        }}
                                        className="p-1 hover:bg-[#555] rounded ml-1"
                                        title="Add Layer"
                                    >
                                        +
                                    </button>
                                    {currentAnimation?.layers.length > 1 && (
                                        <button
                                            onClick={() => {
                                                // Delete layer
                                                currentAnimation?.layers.splice(layerIndex, 1);
                                            }}
                                            className="p-1 hover:bg-[#555] rounded ml-1 text-red-400"
                                            title="Delete Layer"
                                        >
                                            -
                                        </button>
                                    )}
                                </div>
                                {/* Bone tracks for this layer */}
                                {layer.bone.map((bt, boneIndex) => (
                                    <BoneRow 
                                        key={boneIndex}
                                        index={boneIndex}
                                        bt={bt}
                                        frameWidth={frameWidth}
                                        onOpenCurveEditor={openCurveEditor}
                                        onSetFrame={setCurrentFrame}
                                        onDeleteKeyframe={handleDeleteKeyframe}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {/* Curve editor popover */}
            {curveEditorState && (() => {
                const { bt, type, kfIndex } = curveEditorState;
                const frames = type === 'translate' ? bt.translateFrame : type === 'rotate' ? bt.rotateFrame : bt.scaleFrame;
                const kf = frames[kfIndex];
                const existingCurve: BezierCurve = (kf as any)?.curve || { cx1: 0, cy1: 0, cx2: 1, cy2: 1 };
                return (
                    <div className="absolute bottom-52 right-4 z-50">
                        <CurveEditor
                            curve={existingCurve}
                            onChange={handleCurveChange}
                            onClose={() => setCurveEditorState(null)}
                        />
                    </div>
                );
            })()}
        </div>
    );
}

const BoneLabel = memo(({ name, isSelected, onClick }: { name: string, isSelected: boolean, onClick: () => void }) => (
    <div
        style={{ height: ROW_HEIGHT }}
        className={`flex items-center px-2 border-b border-[#222] text-xs truncate cursor-pointer hover:bg-[#3a3a3a] ${isSelected ? 'text-blue-400' : 'text-gray-300'}`}
        onClick={onClick}
    >
        {name}
    </div>
));

const BoneRow = memo(({ index, bt, frameWidth, onOpenCurveEditor, onSetFrame, onDeleteKeyframe }: {
    index: number, 
    bt: BoneTimeline, 
    frameWidth: number, 
    onOpenCurveEditor: (bt: BoneTimeline, kf: KFInfo) => void, 
    onSetFrame: (f: number) => void,
    onDeleteKeyframe: (bt: BoneTimeline, kf: KFInfo) => void
}) => {
    const kfs = React.useMemo(() => {
        const result: KFInfo[] = [];
        let pos = 0;
        bt.translateFrame.forEach((kf, i) => { result.push({ type: 'translate', kfIndex: i, framePos: pos, hasCurve: !!kf.curve, curve: kf.curve }); pos += kf.duration; });
        pos = 0;
        bt.rotateFrame.forEach((kf, i) => { result.push({ type: 'rotate', kfIndex: i, framePos: pos, hasCurve: !!kf.curve, curve: kf.curve }); pos += kf.duration; });
        pos = 0;
        bt.scaleFrame.forEach((kf, i) => { result.push({ type: 'scale', kfIndex: i, framePos: pos, hasCurve: !!kf.curve, curve: kf.curve }); pos += kf.duration; });
        return result;
    }, [bt]);

    const colorMap = { translate: '#3b82f6', rotate: '#22c55e', scale: '#f59e0b' };

    return (
            <div className="border-b border-[#1e1e1e] relative min-w-full"
            style={{ height: ROW_HEIGHT, background: index % 2 === 0 ? '#1c1c1c' : '#1e1e1e' }}>
            {/* Grid rendered via CSS pattern for performance */}
            <div className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(to right, #252525 1px, transparent 1px)`,
                    backgroundSize: `${frameWidth}px 100%`
                }}
            />
            {/* Keyframe diamonds */}
            {kfs.map((kf, ki) => (
                <div
                    key={ki}
                    className="absolute w-2.5 h-2.5 rotate-45 cursor-pointer hover:scale-150 transition-transform z-10"
                    style={{
                        background: colorMap[kf.type],
                        left: kf.framePos * frameWidth - 5,
                        top: ROW_HEIGHT / 2 - 5,
                        outline: kf.hasCurve ? '2px solid #facc15' : 'none',
                    }}
                    onContextMenu={e => {
                        e.preventDefault();
                        // Show context menu with options
                        const menu = document.createElement('div');
                        menu.className = 'absolute z-50 bg-[#282828] border border-[#444] rounded shadow-xl p-1 text-xs';
                        menu.style.left = `${e.clientX}px`;
                        menu.style.top = `${e.clientY}px`;
                        menu.style.position = 'fixed';
                        
                        // Curve editor option
                        const curveOption = document.createElement('div');
                        curveOption.className = 'px-2 py-1 hover:bg-[#333] cursor-pointer';
                        curveOption.textContent = '编辑曲线';
                        curveOption.onclick = () => {
                            onOpenCurveEditor(bt, kf);
                            document.body.removeChild(menu);
                        };
                        menu.appendChild(curveOption);
                        
                        // Delete option
                        const deleteOption = document.createElement('div');
                        deleteOption.className = 'px-2 py-1 hover:bg-[#333] cursor-pointer text-red-400';
                        deleteOption.textContent = '删除关键帧';
                        deleteOption.onclick = () => {
                            onDeleteKeyframe(bt, kf);
                            document.body.removeChild(menu);
                        };
                        menu.appendChild(deleteOption);
                        
                        document.body.appendChild(menu);
                        
                        // Close menu when clicking elsewhere
                        const closeMenu = () => {
                            if (document.body.contains(menu)) {
                                document.body.removeChild(menu);
                            }
                            document.removeEventListener('click', closeMenu);
                        };
                        
                        setTimeout(() => {
                            document.addEventListener('click', closeMenu);
                        }, 100);
                    }}
                    onClick={() => onSetFrame(kf.framePos)}
                />
            ))}
        </div>
    );
});
