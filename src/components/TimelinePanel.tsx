import { useRef, useCallback, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Circle, Save, X } from 'lucide-react';
import type { AnimationData, BoneTimeline, BezierCurve } from '../DataModel';
import type { SelectedInfo } from './PropertiesPanel';

interface TimelinePanelProps {
    animations: AnimationData[];
    currentAnimation: AnimationData | null;
    selectedAnimIndex: number;
    setSelectedAnimIndex: (index: number) => void;
    currentFrame: number;
    setCurrentFrame: (frame: number) => void;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    isRecording: boolean;
    handleRecordToggle: () => void;
    selectedInfo: SelectedInfo | null;
    handleSetKeyframe: () => void;
    handleSelectBone: (name: string) => void;
}

const ROW_HEIGHT = 28; // px height per bone row
const FRAME_WIDTH = 14; // px width per frame column
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
        [[curve.cx1 * W, (1 - curve.cy1) * H], [curve.cx2 * W, (1 - curve.cy2) * H]].forEach(([x, y]) => {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }, [curve]);

    // Draw whenever curve or ref changes
    useCallback(() => { drawPreview(); }, [drawPreview])();

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
                className="w-full rounded mb-2 border border-[#333]"
            />
            {/* Presets */}
            <div className="flex gap-1 mb-2 flex-wrap">
                {[
                    { label: 'Linear', c: { cx1: 0, cy1: 0, cx2: 1, cy2: 1 } },
                    { label: 'Ease In', c: { cx1: 0.42, cy1: 0, cx2: 1, cy2: 1 } },
                    { label: 'Ease Out', c: { cx1: 0, cy1: 0, cx2: 0.58, cy2: 1 } },
                    { label: 'Ease', c: { cx1: 0.25, cy1: 0.1, cx2: 0.25, cy2: 1 } },
                ].map(({ label, c }) => (
                    <button key={label} onClick={() => onChange(c)}
                        className="text-[9px] px-1.5 py-0.5 bg-[#333] hover:bg-blue-700 rounded">
                        {label}
                    </button>
                ))}
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
    setCurrentFrame,
    isPlaying,
    setIsPlaying,
    isRecording,
    handleRecordToggle,
    selectedInfo,
    handleSetKeyframe,
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

    // Curve editor state
    const [curveEditorState, setCurveEditorState] = useState<{
        bt: BoneTimeline; type: 'translate' | 'rotate' | 'scale'; kfIndex: number;
    } | null>(null);

    const openCurveEditor = (bt: BoneTimeline, kf: KFInfo) => {
        setCurveEditorState({ bt, type: kf.type, kfIndex: kf.kfIndex });
    };

    const handleCurveChange = (newCurve: BezierCurve) => {
        if (!curveEditorState) return;
        const { bt, type, kfIndex } = curveEditorState;
        const frames = type === 'translate' ? bt.translateFrame : type === 'rotate' ? bt.rotateFrame : bt.scaleFrame;
        if (frames[kfIndex]) {
            (frames[kfIndex] as any).curve = newCurve;
        }
    };

    /** Collect all keyframe positions for a bone timeline */
    const getKeyframes = (bt: BoneTimeline): KFInfo[] => {
        const kfs: KFInfo[] = [];
        let pos = 0;
        bt.translateFrame.forEach((kf, i) => {
            kfs.push({ type: 'translate', kfIndex: i, framePos: pos, hasCurve: !!kf.curve, curve: kf.curve });
            pos += kf.duration;
        });
        pos = 0;
        bt.rotateFrame.forEach((kf, i) => {
            kfs.push({ type: 'rotate', kfIndex: i, framePos: pos, hasCurve: !!kf.curve, curve: kf.curve });
            pos += kf.duration;
        });
        pos = 0;
        bt.scaleFrame.forEach((kf, i) => {
            kfs.push({ type: 'scale', kfIndex: i, framePos: pos, hasCurve: !!kf.curve, curve: kf.curve });
            pos += kf.duration;
        });
        return kfs;
    };

    const colorMap = { translate: '#3b82f6', rotate: '#22c55e', scale: '#f59e0b' };

    const totalFrames = currentAnimation?.duration || 0;
    const trackWidth = totalFrames * FRAME_WIDTH;

    return (
        <div className="h-52 bg-[#2a2a2a] border-t border-[#1a1a1a] flex flex-col select-none">
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
                    <span className="text-[10px] text-gray-400 ml-1 tabular-nums">{currentFrame} / {totalFrames}</span>
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
                    {currentAnimation?.bone.map((bt, i) => (
                        <div
                            key={i}
                            style={{ height: ROW_HEIGHT }}
                            className={`flex items-center px-2 border-b border-[#222] text-xs truncate cursor-pointer hover:bg-[#3a3a3a] ${selectedInfo?.name === bt.name ? 'text-blue-400' : 'text-gray-300'}`}
                            onClick={() => handleSelectBone(bt.name)}
                        >
                            {bt.name}
                        </div>
                    ))}
                </div>

                {/* Track area */}
                <div
                    ref={trackScrollRef}
                    className="flex-1 overflow-auto"
                    onScroll={syncScroll('track')}
                >
                    <div style={{ width: Math.max(trackWidth, 400), position: 'relative' }}>
                        {/* Frame ruler */}
                        <div
                            className="flex items-end bg-[#2a2a2a] border-b border-[#222] sticky top-0 z-10"
                            style={{ height: 20 }}
                            onClick={e => {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const frame = Math.floor(x / FRAME_WIDTH);
                                setCurrentFrame(Math.max(0, Math.min(totalFrames - 1, frame)));
                            }}
                        >
                            {totalFrames > 0 && [...Array(totalFrames)].map((_, i) => (
                                <div key={i} className="border-l border-[#3a3a3a] flex-shrink-0 relative"
                                    style={{ width: FRAME_WIDTH, height: '100%' }}>
                                    {i % 5 === 0 && (
                                        <span className="absolute top-0.5 left-0.5 text-[8px] text-gray-500 select-none">{i}</span>
                                    )}
                                </div>
                            ))}
                            {/* Playhead */}
                            {totalFrames > 0 && (
                                <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none z-20"
                                    style={{ left: currentFrame * FRAME_WIDTH + FRAME_WIDTH / 2 - 1 }} />
                            )}
                        </div>

                        {/* Bone track rows */}
                        {currentAnimation?.bone.map((bt, i) => {
                            const kfs = getKeyframes(bt);
                            return (
                                <div key={i} className="border-b border-[#1e1e1e] relative"
                                    style={{ height: ROW_HEIGHT, background: i % 2 === 0 ? '#1c1c1c' : '#1e1e1e' }}>
                                    {/* Frame grid lines */}
                                    {[...Array(totalFrames)].map((_, fi) => (
                                        <div key={fi} className="absolute top-0 bottom-0 border-l border-[#252525]"
                                            style={{ left: fi * FRAME_WIDTH }} />
                                    ))}
                                    {/* Playhead */}
                                    <div className="absolute top-0 bottom-0 w-[2px] bg-red-500/40 pointer-events-none z-10"
                                        style={{ left: currentFrame * FRAME_WIDTH + FRAME_WIDTH / 2 - 1 }} />
                                    {/* Keyframe diamonds */}
                                    {kfs.map((kf, ki) => (
                                        <div
                                            key={ki}
                                            className="absolute w-2.5 h-2.5 rotate-45 cursor-pointer hover:scale-150 transition-transform z-10"
                                            style={{
                                                background: colorMap[kf.type],
                                                // Center on the frame column: frame * width + half width - half diamond
                                                left: kf.framePos * FRAME_WIDTH + FRAME_WIDTH / 2 - 5,
                                                top: ROW_HEIGHT / 2 - 5,
                                                outline: kf.hasCurve ? '2px solid #facc15' : 'none',
                                            }}
                                            title={`${kf.type} @${kf.framePos}${kf.hasCurve ? ' [bezier]' : ''}`}
                                            onContextMenu={e => {
                                                e.preventDefault();
                                                openCurveEditor(bt, kf);
                                            }}
                                            onClick={() => setCurrentFrame(kf.framePos)}
                                        />
                                    ))}
                                </div>
                            );
                        })}
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
