import type { AnimationData, BoneTimeline, Transform } from "../DataModel";

/**
 * Evaluates animation keyframes to produce per-bone transform deltas at the given frame.
 */

interface BoneAnimTransform {
    x: number;
    y: number;
    rotate: number; // Degrees
    scaleX: number;
    scaleY: number;
}

/**
 * Interpolate between two values using linear easing.
 * tweenEasing: null = no interpolation (hold), 0 = linear, other values reserved for curves.
 */
function lerp(a: number, b: number, t: number, tweenEasing: number | null): number {
    if (tweenEasing === null) return a; // No tween = hold value
    return a + (b - a) * t;
}

/**
 * Find the current keyframe and interpolation factor for a given frame position.
 * Returns [keyframeIndex, localT] where localT is 0..1 within that keyframe's duration.
 */
function findKeyframe<T extends { duration: number; tweenEasing: number | null }>(
    frames: T[],
    currentFrame: number,
): [number, number] {
    if (frames.length === 0) return [-1, 0];

    let elapsed = 0;
    for (let i = 0; i < frames.length; i++) {
        const kf = frames[i];
        if (currentFrame < elapsed + kf.duration || i === frames.length - 1) {
            const localT = kf.duration > 0 ? Math.min(1, (currentFrame - elapsed) / kf.duration) : 0;
            return [i, localT];
        }
        elapsed += kf.duration;
    }
    return [frames.length - 1, 1];
}

/**
 * Evaluate a bone's animation transform at a given frame.
 */
function evaluateBoneTimeline(timeline: BoneTimeline, currentFrame: number): BoneAnimTransform {
    const result: BoneAnimTransform = { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 };

    // Translate
    if (timeline.translateFrame.length > 0) {
        const [idx, t] = findKeyframe(timeline.translateFrame, currentFrame);
        if (idx >= 0) {
            const kf = timeline.translateFrame[idx];
            const next = timeline.translateFrame[idx + 1];
            if (next && kf.tweenEasing !== null) {
                result.x = lerp(kf.x, next.x, t, kf.tweenEasing);
                result.y = lerp(kf.y, next.y, t, kf.tweenEasing);
            } else {
                result.x = kf.x;
                result.y = kf.y;
            }
        }
    }

    // Rotate
    if (timeline.rotateFrame.length > 0) {
        const [idx, t] = findKeyframe(timeline.rotateFrame, currentFrame);
        if (idx >= 0) {
            const kf = timeline.rotateFrame[idx];
            const next = timeline.rotateFrame[idx + 1];
            if (next && kf.tweenEasing !== null) {
                result.rotate = lerp(kf.rotate, next.rotate, t, kf.tweenEasing);
            } else {
                result.rotate = kf.rotate;
            }
        }
    }

    // Scale
    if (timeline.scaleFrame.length > 0) {
        const [idx, t] = findKeyframe(timeline.scaleFrame, currentFrame);
        if (idx >= 0) {
            const kf = timeline.scaleFrame[idx];
            const next = timeline.scaleFrame[idx + 1];
            if (next && kf.tweenEasing !== null) {
                result.scaleX = lerp(kf.x, next.x, t, kf.tweenEasing);
                result.scaleY = lerp(kf.y, next.y, t, kf.tweenEasing);
            } else {
                result.scaleX = kf.x;
                result.scaleY = kf.y;
            }
        }
    }

    return result;
}

/**
 * Get all bone transforms for a given animation at a specific frame.
 * Returns a map of boneName -> animated transform delta.
 * The delta is ADDED to the bone's base (rest pose) transform.
 */
export function getAnimatedBoneTransforms(
    animation: AnimationData,
    currentFrame: number,
): Map<string, BoneAnimTransform> {
    const result = new Map<string, BoneAnimTransform>();

    for (const boneTimeline of animation.bone) {
        const animTransform = evaluateBoneTimeline(boneTimeline, currentFrame);
        result.set(boneTimeline.name, animTransform);
    }

    return result;
}

/**
 * Apply animation delta to a rest-pose transform.
 * DragonBones animation keyframes store DELTA values that are added to the base pose.
 */
export function applyAnimationToTransform(baseTransform: Transform, animDelta: BoneAnimTransform): Transform {
    return {
        x: baseTransform.x + animDelta.x,
        y: baseTransform.y + animDelta.y,
        skewX: baseTransform.skewX + animDelta.rotate,
        skewY: baseTransform.skewY + animDelta.rotate,
        scaleX: baseTransform.scaleX * animDelta.scaleX,
        scaleY: baseTransform.scaleY * animDelta.scaleY,
    };
}
