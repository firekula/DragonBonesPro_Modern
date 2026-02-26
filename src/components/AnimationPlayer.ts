import type { AnimationData, BoneTimeline, BezierCurve, Transform } from "../DataModel";

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

// ─── Bezier Curve Interpolation ───────────────────────────────────────────────

/**
 * Solve for the parameter t on the x-axis of a cubic Bezier curve
 * using Newton-Raphson iteration, then return the y value at that t.
 *
 * The curve is defined in [0,1]×[0,1] space where:
 *   P0=(0,0), P1=(cx1,cy1), P2=(cx2,cy2), P3=(1,1)
 */
function bezierInterpolate(normalizedTime: number, curve: BezierCurve): number {
    const { cx1, cy1, cx2, cy2 } = curve;

    // Cubic Bezier x(t) = 3*(1-t)^2*t*cx1 + 3*(1-t)*t^2*cx2 + t^3
    const getBezierX = (t: number) => {
        const mt = 1 - t;
        return 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t;
    };

    const getBezierY = (t: number) => {
        const mt = 1 - t;
        const cy = 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t;
        return cy;
    };

    if (normalizedTime <= 0) return 0;
    if (normalizedTime >= 1) return 1;

    // Use binary search (bisection) for a robust result.
    let lower = 0;
    let upper = 1;
    let t = 0.5;

    for (let i = 0; i < 12; i++) {
        const x = getBezierX(t);
        if (x < normalizedTime) {
            lower = t;
        } else {
            upper = t;
        }
        t = (lower + upper) / 2;
    }

    return getBezierY(t);
}

/**
 * Interpolate between two values.
 * @param curve  - Use bezier curve if provided
 * @param tweenEasing - null = hold (no interpolation), 0 = linear
 */
function lerpWithCurve(a: number, b: number, t: number, tweenEasing: number | null, curve?: BezierCurve): number {
    if (tweenEasing === null && !curve) return a; // Hold frame
    const easedT = curve ? bezierInterpolate(t, curve) : t;
    return a + (b - a) * easedT;
}

// ─── Keyframe Finding ─────────────────────────────────────────────────────────

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

// ─── Per-Bone Timeline Evaluation ─────────────────────────────────────────────

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
            if (next && (kf.tweenEasing !== null || kf.curve)) {
                result.x = lerpWithCurve(kf.x, next.x, t, kf.tweenEasing, kf.curve);
                result.y = lerpWithCurve(kf.y, next.y, t, kf.tweenEasing, kf.curve);
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
            if (next && (kf.tweenEasing !== null || kf.curve)) {
                result.rotate = lerpWithCurve(kf.rotate, next.rotate, t, kf.tweenEasing, kf.curve);
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
            if (next && (kf.tweenEasing !== null || kf.curve)) {
                result.scaleX = lerpWithCurve(kf.x, next.x, t, kf.tweenEasing, kf.curve);
                result.scaleY = lerpWithCurve(kf.y, next.y, t, kf.tweenEasing, kf.curve);
            } else {
                result.scaleX = kf.x;
                result.scaleY = kf.y;
            }
        }
    }

    return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

    if (animation.bone.length === 0) {
        console.warn(`[AnimationPlayer] Animation ${animation.name} has no bone timelines`);
    }

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
