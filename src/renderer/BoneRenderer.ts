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
        // Clear existing joints first
        boneJoints.forEach((joint) => {
            if (joint.parent) {
                joint.parent.removeChild(joint);
            }
        });
        boneJoints.clear();

        if (!armature?.bones) return;

        armature.bones.forEach((bone: any) => {
            const matrix = getGlobalMatrix(bone);
            const startX = matrix.tx;
            const startY = matrix.ty;
            const length = Math.max(bone.length || 0, 10);
            const endX = startX + matrix.a * length;
            const endY = startY + matrix.b * length;

            const isSelected = selectedBone === bone.name;
            const boneColor = isSelected ? 0xffffff : bone.color || 0x00ffff;
            const boneWidth = (isSelected ? 3 : 2) / zoom; // Zoom-independent
            const boneAlpha = isSelected ? 1.0 : 0.8;

            boneGraphics.moveTo(startX, startY);
            boneGraphics.lineTo(endX, endY);
            boneGraphics.stroke({ width: boneWidth, color: boneColor, alpha: boneAlpha });

            const jointSize = (isSelected ? 6 : 4) / zoom; // Zoom-independent
            boneGraphics.circle(startX, startY, jointSize);
            boneGraphics.fill({ color: isSelected ? 0xff4400 : 0xffaa00, alpha: boneAlpha });

            // Clickable joint circle for bone selection
            const joint = new PIXI.Graphics();
            joint.circle(startX, startY, 8);
            joint.fill({ color: 0x000000, alpha: 0.01 }); // Nearly invisible hit area
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
        });
    }
}
