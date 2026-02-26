import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { SlotData } from '../DataModel';

interface LayerPanelProps {
    slots: SlotData[];
    selectedSlot: string | null;
    onSelectSlot: (name: string) => void;
    onMoveSlot: (name: string, direction: 'up' | 'down') => void;
}

export function LayerPanel({ slots, selectedSlot, onSelectSlot, onMoveSlot }: LayerPanelProps) {
    // Sort by Z-order descending (highest Z = top of visual stack = top of list)
    const sortedSlots = [...slots].sort((a, b) => b.zOrder - a.zOrder);

    return (
        <div className="text-[12px]">
            {/* Header with reorder controls */}
            <div className="flex items-center justify-end gap-1 px-2 py-1 border-b border-[#222]">
                <button
                    className="p-1 hover:bg-[#555] rounded disabled:opacity-30"
                    title="上移 (Move Up)"
                    disabled={!selectedSlot}
                    onClick={() => selectedSlot && onMoveSlot(selectedSlot, 'up')}
                >
                    <ChevronUp size={14} />
                </button>
                <button
                    className="p-1 hover:bg-[#555] rounded disabled:opacity-30"
                    title="下移 (Move Down)"
                    disabled={!selectedSlot}
                    onClick={() => selectedSlot && onMoveSlot(selectedSlot, 'down')}
                >
                    <ChevronDown size={14} />
                </button>
            </div>

            {/* Slot List */}
            {sortedSlots.map((slot) => (
                <div
                    key={slot.name}
                    className={`flex items-center gap-2 cursor-pointer py-[3px] px-3 ${
                        selectedSlot === slot.name
                            ? 'bg-[#2563eb33] text-white'
                            : 'hover:bg-[#444] text-gray-300'
                    }`}
                    onClick={() => onSelectSlot(slot.name)}
                >
                    <span className="text-[11px] text-yellow-500 flex-shrink-0">🖼</span>
                    <span className={`truncate ${selectedSlot === slot.name ? 'font-medium' : ''}`}>
                        {slot.name}
                    </span>
                </div>
            ))}
        </div>
    );
}
