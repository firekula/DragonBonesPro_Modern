export interface DragonBonesData {
    name: string;
    version: string;
    frameRate: number;
    armatures: ArmatureData[];
    images: Record<string, string>; // Blob Object URLs mapped to internal filenames
    textureAtlas?: any; // The parsed JSON of library/texture.json
}

export type SymbolType = 1 | 2 | 3 | 4 | 5;

export const SymbolTypes = {
    ARMATURE: 1 as SymbolType,
    MC: 2 as SymbolType,
    STAGE: 3 as SymbolType,
    COMIC: 4 as SymbolType,
    SHEET: 5 as SymbolType,
} as const;

export interface Transform {
    x: number;
    y: number;
    skewX: number;
    skewY: number;
    scaleX: number;
    scaleY: number;
}

export interface BoneData {
    name: string;
    parentBoneName?: string;
    length: number;
    globalTransform: Transform;
    localTransform: Transform;
    inheritRotation: boolean;
    inheritScale: boolean;
    color: number; // Hex code for editor display
}

export interface SlotData {
    name: string;
    parentBoneName: string;
    blendMode: string;
    zOrder: number;
    displayIndex: number;
}

export interface DisplayData {
    name: string;
    path: string;
    type: string;
    transform: Transform;
}

export interface SkinSlotData {
    name: string;
    displays: DisplayData[];
}

export interface SkinData {
    name: string;
    slots: SkinSlotData[];
}

/**
 * Cubic Bezier curve control points for keyframe easing.
 * Defines a curve in the normalized [0,1] x [0,1] space,
 * matching the DragonBones "curve" array format: [cx1, cy1, cx2, cy2]
 */
export interface BezierCurve {
    cx1: number; // Control point 1 x
    cy1: number; // Control point 1 y
    cx2: number; // Control point 2 x
    cy2: number; // Control point 2 y
}

// Animation keyframe types
export interface TranslateKeyframe {
    duration: number;
    x: number;
    y: number;
    tweenEasing: number | null; // null = no tween, 0 = linear, other = easing
    curve?: BezierCurve; // Bezier curve (overrides tweenEasing if present)
}

export interface RotateKeyframe {
    duration: number;
    rotate: number; // Degrees
    tweenEasing: number | null;
    curve?: BezierCurve;
}

export interface ScaleKeyframe {
    duration: number;
    x: number; // scaleX
    y: number; // scaleY
    tweenEasing: number | null;
    curve?: BezierCurve;
}

export interface BoneTimeline {
    name: string; // Bone name
    translateFrame: TranslateKeyframe[];
    rotateFrame: RotateKeyframe[];
    scaleFrame: ScaleKeyframe[];
}

export interface AnimationLayer {
    name: string;
    visible: boolean;
    bone: BoneTimeline[];
}

export interface AnimationClip {
    name: string;
    startTime: number; // Start frame
    endTime: number; // End frame
    loop: boolean;
}

export interface AnimationData {
    name: string;
    duration: number; // Total frames
    playTimes: number; // 0 = loop forever
    layers: AnimationLayer[];
    clips: AnimationClip[];
}

export interface IKConstraintData {}

export interface ArmatureData {
    name: string;
    type: SymbolType;
    frameRate: number;
    bones: BoneData[];
    slots: SlotData[];
    animations: AnimationData[];
    skins: SkinData[];
    ikConstraints: IKConstraintData[];
}
