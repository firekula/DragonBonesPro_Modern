import { Settings, Dot } from 'lucide-react';
import type { Transform } from '../DataModel';

export interface SelectedInfo {
    name: string;
    type: 'bone' | 'slot';
    transform: Transform;
    parent?: string;
}

interface PropertiesPanelProps {
    selectedInfo: SelectedInfo | null;
    onTransformChange: (field: keyof Transform, value: number) => void;
    /** Current editor mode */
    mode?: 'edit' | 'animation';
    /** Whether animation is currently playing */
    isPlaying?: boolean;
    /** Whether recording mode is active */
    isRecording?: boolean;
    /** Whether there are unsaved pending edits (animation mode, not recording) */
    hasPendingEdits?: boolean;
}

export function PropertiesPanel({
    selectedInfo,
    onTransformChange,
    mode = 'edit',
    isPlaying = false,
    isRecording = false,
    hasPendingEdits = false,
}: PropertiesPanelProps) {
    // Fields are read-only when animation is playing
    const isReadOnly = isPlaying;

    return (
        <div className="w-64 bg-[#333333] border-l border-[#1a1a1a] flex flex-col">
            <div className="p-2 bg-[#383838] border-b border-[#222] font-semibold flex items-center gap-2 text-xs">
                <Settings size={14} /> Properties
                {mode === 'animation' && (
                    <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        isRecording ? 'bg-red-600 text-white animate-pulse' :
                        isPlaying   ? 'bg-yellow-600 text-white' :
                        hasPendingEdits ? 'bg-orange-500 text-white' :
                        'bg-blue-700 text-white'
                    }`}>
                        {isRecording ? '● REC' : isPlaying ? '▶ PLAY' : hasPendingEdits ? '✎ 未保存' : 'ANIM'}
                    </span>
                )}
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

                        {/* Animation mode unsaved hint */}
                        {mode === 'animation' && !isPlaying && !isRecording && hasPendingEdits && (
                            <div className="text-[10px] text-orange-400 flex items-center gap-1">
                                <Dot size={12} /> 修改未保存，切换帧/播放后将丢弃
                            </div>
                        )}

                        {/* Transform Group */}
                        <div>
                            <div className="text-gray-400 mb-2 uppercase text-[10px] font-bold tracking-wider">
                                Transform
                            </div>
                            <div className="space-y-2">
                                {[
                                    { label: 'X', field: 'x' as keyof Transform },
                                    { label: 'Y', field: 'y' as keyof Transform },
                                    { label: 'Rotation', field: 'skewX' as keyof Transform },
                                    { label: 'Scale X', field: 'scaleX' as keyof Transform, step: 0.1 },
                                    { label: 'Scale Y', field: 'scaleY' as keyof Transform, step: 0.1 },
                                    { label: 'Skew Y', field: 'skewY' as keyof Transform },
                                ].map(({ label, field, step }) => (
                                    <div key={field} className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-500 w-12">{label}</span>
                                        <div className="flex-1 relative">
                                            <input
                                                type="number"
                                                step={step || 1}
                                                disabled={isReadOnly}
                                                className={`w-full bg-[#222] border rounded px-2 py-1 outline-none text-xs transition-colors ${
                                                    isReadOnly
                                                        ? 'border-[#333] text-gray-600 cursor-not-allowed'
                                                        : 'border-[#444] focus:border-blue-500 cursor-text'
                                                }`}
                                                value={parseFloat((selectedInfo.transform[field]).toFixed(2))}
                                                onChange={(e) => {
                                                    if (isReadOnly) return;
                                                    onTransformChange(field, parseFloat(e.target.value) || 0);
                                                }}
                                                onMouseDown={(e) => {
                                                    if (isReadOnly) return;
                                                    e.preventDefault();
                                                    const startX = e.clientX;
                                                    const startValue = selectedInfo.transform[field];
                                                    const stepValue = step || 1;

                                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                                        const deltaX = moveEvent.clientX - startX;
                                                        const newValue = startValue + deltaX * stepValue * 0.1;
                                                        onTransformChange(field, newValue);
                                                    };

                                                    const handleMouseUp = () => {
                                                        document.removeEventListener('mousemove', handleMouseMove);
                                                        document.removeEventListener('mouseup', handleMouseUp);
                                                    };

                                                    document.addEventListener('mousemove', handleMouseMove);
                                                    document.addEventListener('mouseup', handleMouseUp);
                                                }}
                                            />
                                        </div>
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
    );
}
