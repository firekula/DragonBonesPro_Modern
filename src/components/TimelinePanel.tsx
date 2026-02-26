import { Play, Pause, SkipBack, SkipForward, Circle, Save } from 'lucide-react';
import type { AnimationData } from '../DataModel';
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
    return (
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
                                // 保持当前播放状态，不再停止播放
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
                    <button
                        onClick={handleRecordToggle}
                        className={`p-1 hover:bg-[#555] rounded ${isRecording ? 'text-red-500' : ''}`} title={isRecording ? '停止录制' : '开始录制'}
                    >
                        <Circle size={14} />
                    </button>
                    <button
                        onClick={handleSetKeyframe}
                        className="p-1 hover:bg-[#555] rounded" title="保存关键帧"
                        disabled={!selectedInfo || !currentAnimation}
                    >
                        <Save size={14} />
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
                        <div 
                            key={i} 
                            className="py-1 px-2 border-b border-[#222] text-xs truncate cursor-pointer hover:bg-[#444]"
                            onClick={() => handleSelectBone(bt.name)}
                        >
                            {bt.name}
                        </div>
                    ))}
                </div>
                {/* Frame grid */}
                <div className="flex-1 bg-[#1e1e1e] relative overflow-auto">
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
    );
}
