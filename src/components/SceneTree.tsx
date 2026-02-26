import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { ArmatureData, BoneData, SlotData } from '../DataModel';

interface SceneTreeProps {
    armature: ArmatureData;
    selectedBone: string | null;
    selectedSlot: string | null;
    onSelectBone: (name: string) => void;
    onSelectSlot: (name: string) => void;
}

// Build a map: boneName -> child bones
function buildBoneTree(bones: BoneData[]) {
    const childrenMap: Record<string, BoneData[]> = {};
    const roots: BoneData[] = [];

    for (const bone of bones) {
        if (!bone.parentBoneName) {
            roots.push(bone);
        } else {
            if (!childrenMap[bone.parentBoneName]) {
                childrenMap[bone.parentBoneName] = [];
            }
            childrenMap[bone.parentBoneName].push(bone);
        }
    }

    return { roots, childrenMap };
}

// Build a map: boneName -> child slots
function buildSlotMap(slots: SlotData[]) {
    const map: Record<string, SlotData[]> = {};
    for (const slot of slots) {
        if (!map[slot.parentBoneName]) {
            map[slot.parentBoneName] = [];
        }
        map[slot.parentBoneName].push(slot);
    }
    return map;
}

interface BoneNodeProps {
    bone: BoneData;
    childrenMap: Record<string, BoneData[]>;
    slotMap: Record<string, SlotData[]>;
    depth: number;
    selectedBone: string | null;
    selectedSlot: string | null;
    onSelectBone: (name: string) => void;
    onSelectSlot: (name: string) => void;
}

function BoneNode({
    bone,
    childrenMap,
    slotMap,
    depth,
    selectedBone,
    selectedSlot,
    onSelectBone,
    onSelectSlot,
}: BoneNodeProps) {
    const [expanded, setExpanded] = useState(true);
    const childBones = childrenMap[bone.name] || [];
    const childSlots = slotMap[bone.name] || [];
    const hasChildren = childBones.length > 0 || childSlots.length > 0;
    const isSelected = selectedBone === bone.name;

    return (
        <div>
            {/* Bone Row */}
            <div
                className={`flex items-center gap-1 cursor-pointer py-[2px] px-1 rounded ${
                    isSelected ? 'bg-[#2563eb33] text-white' : 'hover:bg-[#444]'
                }`}
                style={{ paddingLeft: `${depth * 16 + 4}px` }}
                onClick={() => onSelectBone(bone.name)}
            >
                {hasChildren ? (
                    <span
                        className="w-4 h-4 flex items-center justify-center flex-shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }}
                    >
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                ) : (
                    <span className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="text-[11px] flex-shrink-0">✓</span>
                <span className={`text-[12px] truncate ${isSelected ? 'text-white font-medium' : 'text-blue-300'}`}>
                    {bone.name}
                </span>
            </div>

            {/* Children */}
            {expanded && (
                <>
                    {/* Child Slots */}
                    {childSlots.map((slot) => (
                        <div
                            key={`slot-${slot.name}`}
                            className={`flex items-center gap-1 cursor-pointer py-[2px] px-1 rounded ${
                                selectedSlot === slot.name ? 'bg-[#2563eb33] text-white' : 'hover:bg-[#444]'
                            }`}
                            style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
                            onClick={() => onSelectSlot(slot.name)}
                        >
                            <span className="w-4 h-4 flex-shrink-0" />
                            <span className="text-[11px] text-yellow-500 flex-shrink-0">🖼</span>
                            <span
                                className={`text-[12px] truncate ${
                                    selectedSlot === slot.name ? 'text-white font-medium' : 'text-gray-300'
                                }`}
                            >
                                {slot.name}
                            </span>
                        </div>
                    ))}

                    {/* Child Bones (recursive) */}
                    {childBones.map((childBone) => (
                        <BoneNode
                            key={childBone.name}
                            bone={childBone}
                            childrenMap={childrenMap}
                            slotMap={slotMap}
                            depth={depth + 1}
                            selectedBone={selectedBone}
                            selectedSlot={selectedSlot}
                            onSelectBone={onSelectBone}
                            onSelectSlot={onSelectSlot}
                        />
                    ))}
                </>
            )}
        </div>
    );
}

export function SceneTree({ armature, selectedBone, selectedSlot, onSelectBone, onSelectSlot }: SceneTreeProps) {
    const { roots, childrenMap } = buildBoneTree(armature.bones);
    const slotMap = buildSlotMap(armature.slots);

    return (
        <div className="text-[12px]">
            {/* Armature Name */}
            <div className="flex items-center gap-1 py-[2px] px-1 text-yellow-400 font-medium">
                <span>⊕</span>
                <span>{armature.name}</span>
            </div>

            {/* Bone Tree */}
            {roots.map((rootBone) => (
                <BoneNode
                    key={rootBone.name}
                    bone={rootBone}
                    childrenMap={childrenMap}
                    slotMap={slotMap}
                    depth={1}
                    selectedBone={selectedBone}
                    selectedSlot={selectedSlot}
                    onSelectBone={onSelectBone}
                    onSelectSlot={onSelectSlot}
                />
            ))}
        </div>
    );
}
