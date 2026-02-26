import * as PIXI from "pixi.js";

export class BoneRenderer {
    static drawBones(
        armature: any,
        getGlobalMatrix: (bone: any) => PIXI.Matrix,
        boneGraphics: PIXI.Graphics,
        boneLayer: PIXI.Container | null,
        boneJoints: Map<string, PIXI.Graphics>,
        selectedBone: string | null | undefined,
        zoom: number,
        onSelectBone: ((name: string) => void) | undefined,
    ) {
        if (!armature?.bones) return;

        // Trace of seen bones to remove leftover joints
        const seenBones = new Set<string>();

        armature.bones.forEach((bone: any) => {
            seenBones.add(bone.name);
            const matrix = getGlobalMatrix(bone);
            const startX = matrix.tx;
            const startY = matrix.ty;
            const length = Math.max(bone.length || 0, 10);
            const endX = startX + matrix.a * length;
            const endY = startY + matrix.b * length;

            const isSelected = selectedBone === bone.name;
            const boneColor = isSelected ? 0xffffff : bone.color || 0x00ffff;
            const boneWidth = (isSelected ? 3 : 2) / zoom;
            const boneAlpha = isSelected ? 1.0 : 0.8;

            boneGraphics.moveTo(startX, startY);
            boneGraphics.lineTo(endX, endY);
            boneGraphics.stroke({ width: boneWidth, color: boneColor, alpha: boneAlpha });

            const jointSize = (isSelected ? 6 : 4) / zoom;
            boneGraphics.circle(startX, startY, jointSize);
            boneGraphics.fill({ color: isSelected ? 0xff4400 : 0xffaa00, alpha: boneAlpha });

            // Reuse or create clickable joint circle
            let joint = boneJoints.get(bone.name);
            if (!joint) {
                joint = new PIXI.Graphics();
                joint.eventMode = "static";
                joint.cursor = "pointer";
                joint.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
                    if (e.button === 0 && onSelectBone) {
                        onSelectBone(bone.name);
                        e.stopPropagation();
                    }
                });
                if (boneLayer) {
                    boneLayer.addChild(joint);
                    boneJoints.set(bone.name, joint);
                }
            }

            // Update joint hit area position
            joint.clear();
            joint.circle(startX, startY, 10 / zoom); // Zoom-adjusted hit area
            joint.fill({ color: 0x000000, alpha: 0.01 });
        });

        // Cleanup stale joints
        boneJoints.forEach((joint, name) => {
            if (!seenBones.has(name)) {
                if (joint.parent) joint.parent.removeChild(joint);
                boneJoints.delete(name);
            }
        });
    }
}
