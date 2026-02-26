import JSZip from "jszip";
import { AMF3 } from "amf3-ts";
import { Buffer } from "buffer";
import { SymbolTypes } from "./DataModel";
import type { ArmatureData, DragonBonesData } from "./DataModel";

const DBPROJ_KEY = "DRAGONBONES_IS_BEST";

/**
 * Parses a .dbproj (which can be a zip OR a native AMF3 binary) into the DragonBones Editor Data Model.
 */
export async function parseDragonBonesProject(fileBlob: File | Blob): Promise<DragonBonesData | null> {
    try {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        let imagesData: Record<string, string> = {}; // filename -> object URL
        let textureAtlasData: any = null;

        // In Electron, File objects no longer expose .path (removed in v32+).
        // Use electron.webUtils.getPathForFile() instead.
        let filePath: string | undefined;
        try {
            if (typeof window !== "undefined" && window.require) {
                const { webUtils } = window.require("electron");
                filePath = webUtils.getPathForFile(fileBlob as File);
            }
        } catch (_e) {
            /* not in Electron or webUtils unavailable */
        }
        console.log("File path from Electron:", filePath, "window.require:", typeof window.require);
        if (filePath && typeof window !== "undefined" && window.require) {
            const fs = window.require("fs");
            const path = window.require("path");

            const libraryDir = path.join(path.dirname(filePath), "library");
            const textureJsonPath = path.join(libraryDir, "texture.json");
            const texturePngPath = path.join(libraryDir, "texture.png");

            console.log("Looking for texture at:", textureJsonPath, texturePngPath);

            if (fs.existsSync(textureJsonPath) && fs.existsSync(texturePngPath)) {
                console.log("Found adjacent library/texture.json and texture.png");
                const jsonContent = fs.readFileSync(textureJsonPath, "utf-8");
                textureAtlasData = JSON.parse(jsonContent);
                console.log(
                    "Texture atlas:",
                    textureAtlasData.name,
                    "SubTextures:",
                    textureAtlasData.SubTexture?.length,
                );

                const pngBuffer = fs.readFileSync(texturePngPath);
                // Convert buffer to Blob URL
                const blob = new Blob([new Uint8Array(pngBuffer)], { type: "image/png" });
                imagesData["texture.png"] = URL.createObjectURL(blob);
                console.log("Created blob URL for texture.png:", imagesData["texture.png"]);
            } else {
                console.warn("Texture files NOT found at:", textureJsonPath, texturePngPath);
            }
        } else {
            console.warn("Cannot load textures: filePath=", filePath, "window.require=", typeof window?.require);
        }

        // Check if native AMF3 DBProj format
        if (bytes[0] === 111) {
            console.log("Detected native .dbproj AMF3 binary format.");
            return parseNativeDBProj(bytes, imagesData, textureAtlasData);
        }

        console.log("Attempting to parse as JSZip archive...");
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(fileBlob);

        let projectJsonData: any = null;

        for (const [filename, fileTarget] of Object.entries(loadedZip.files)) {
            if (fileTarget.dir) continue;

            const lowerName = filename.toLowerCase();

            // Find the main project data (usually JSON)
            if (lowerName.endsWith(".json")) {
                const jsonText = await fileTarget.async("text");
                try {
                    projectJsonData = JSON.parse(jsonText);
                    console.log("Loaded Project JSON:", projectJsonData);
                } catch (e) {
                    console.error("Error parsing JSON file in dbproj:", e);
                }
            }
            // Extract images (textures)
            else if (lowerName.endsWith(".png") || lowerName.endsWith(".jpg")) {
                const blob = await fileTarget.async("blob");
                const url = URL.createObjectURL(blob);
                imagesData[filename] = url;
            }
        }

        if (!projectJsonData) {
            console.error("No JSON data found in the .dbproj archive");
            return null;
        }

        // Attempt to find texture atlas logic inside zip if needed (omitted for now)
        return transformToInternalModel(projectJsonData, imagesData, null);
    } catch (e) {
        console.error("Failed to parse file", e);
        return null;
    }
}

function parseNativeDBProj(
    uint8Array: Uint8Array,
    imagesData: Record<string, string>,
    textureAtlasData: any,
): DragonBonesData | null {
    try {
        const decoded = new Uint8Array(uint8Array.length - 1);
        let keyIndex = 0;
        for (let i = 1; i < uint8Array.length; i++) {
            if (keyIndex >= DBPROJ_KEY.length) keyIndex = 0;
            decoded[i - 1] = (uint8Array[i] - DBPROJ_KEY.charCodeAt(keyIndex)) & 0xff;
            keyIndex++;
        }

        // amf3-ts may fail if the underlying ArrayBuffer is from Node.js Buffer and larger than the view.
        // Or if it expects Node.js Buffer explicitly.
        const cleanBuffer = Buffer.from(decoded);

        const amfData = AMF3.parse(cleanBuffer);
        console.log("Decoded AMF3 object:", amfData);

        let rootData = Array.isArray(amfData) ? amfData[1] : amfData;

        // Native DBProj stores raw data wrapped inside "dragonBones" key
        if (rootData && rootData.dragonBones) {
            rootData = rootData.dragonBones;
        }

        return transformToInternalModel(rootData, imagesData, textureAtlasData);
    } catch (e) {
        console.error("Failed to parse native AMF3 DBProj:", e);
        return null;
    }
}

/**
 * Maps the raw JSON schema (from _101.as) to our internal TypeScript interfaces.
 */
function transformToInternalModel(rawData: any, images: Record<string, string>, textureAtlas: any): DragonBonesData {
    const model: DragonBonesData = {
        name: rawData.name || "Untitled",
        version: rawData.version || "5.5",
        frameRate: rawData.frameRate || 24,
        armatures: [],
        images: images, // Attaching raw images for the previewer
        textureAtlas: textureAtlas,
    };

    if (rawData.armature && Array.isArray(rawData.armature)) {
        for (const rawArmature of rawData.armature) {
            model.armatures.push(parseArmature(rawArmature));
        }
    }

    return model;
}

function parseArmature(rawObj: any): ArmatureData {
    const typeStr = rawObj.type || "armature";
    let mappedType = SymbolTypes.ARMATURE;
    if (typeStr === "movieClip") mappedType = SymbolTypes.MC;
    else if (typeStr === "stage") mappedType = SymbolTypes.STAGE;

    const armature: ArmatureData = {
        name: rawObj.name || "Armature",
        type: mappedType,
        frameRate: rawObj.frameRate || 24,
        bones: [],
        slots: [],
        animations: [],
        skins: [],
        ikConstraints: [],
    };

    // Parse Bones
    if (rawObj.bone && Array.isArray(rawObj.bone)) {
        for (const rawBone of rawObj.bone) {
            armature.bones.push({
                name: rawBone.name,
                parentBoneName: rawBone.parent,
                length: rawBone.length || 0,
                globalTransform: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 },
                localTransform: {
                    x: rawBone.transform?.x || 0,
                    y: rawBone.transform?.y || 0,
                    skewX: rawBone.transform?.skX || 0,
                    skewY: rawBone.transform?.skY || 0,
                    scaleX: rawBone.transform?.scX !== undefined ? rawBone.transform.scX : 1,
                    scaleY: rawBone.transform?.scY !== undefined ? rawBone.transform.scY : 1,
                },
                inheritRotation: rawBone.inheritRotation !== false,
                inheritScale: rawBone.inheritScale !== false,
                color: 0x00ffff, // Default bone visual color
            });
        }
    }

    // Parse Slots
    if (rawObj.slot && Array.isArray(rawObj.slot)) {
        for (const rawSlot of rawObj.slot) {
            armature.slots.push({
                name: rawSlot.name,
                parentBoneName: rawSlot.parent,
                blendMode: rawSlot.blendMode || "normal",
                zOrder: rawSlot.z !== undefined ? rawSlot.z : 0,
                displayIndex: rawSlot.displayIndex !== undefined ? rawSlot.displayIndex : 0,
            });
        }
    }

    // Parse Skins (where Display / Textures are defined)
    if (rawObj.skin && Array.isArray(rawObj.skin)) {
        for (const rawSkin of rawObj.skin) {
            const skinData: any = { name: rawSkin.name || "default", slots: [] };

            if (rawSkin.slot && Array.isArray(rawSkin.slot)) {
                for (const rawSkinSlot of rawSkin.slot) {
                    const skinSlotData: any = { name: rawSkinSlot.name, displays: [] };

                    if (rawSkinSlot.display && Array.isArray(rawSkinSlot.display)) {
                        for (const rawDisplay of rawSkinSlot.display) {
                            skinSlotData.displays.push({
                                name: rawDisplay.name || "",
                                path: rawDisplay.path || rawDisplay.name || "",
                                type: rawDisplay.type || "image",
                                transform: {
                                    x: rawDisplay.transform?.x || 0,
                                    y: rawDisplay.transform?.y || 0,
                                    skewX: rawDisplay.transform?.skX || 0,
                                    skewY: rawDisplay.transform?.skY || 0,
                                    scaleX: rawDisplay.transform?.scX !== undefined ? rawDisplay.transform.scX : 1,
                                    scaleY: rawDisplay.transform?.scY !== undefined ? rawDisplay.transform.scY : 1,
                                },
                            });
                        }
                    }
                    skinData.slots.push(skinSlotData);
                }
            }
            armature.skins.push(skinData);
        }
    }

    // Sort slots by Z-Order initially
    armature.slots.sort((a: any, b: any) => a.zOrder - b.zOrder);

    // Parse Animations
    if (rawObj.animation && Array.isArray(rawObj.animation)) {
        for (const rawAnim of rawObj.animation) {
            const animData: any = {
                name: rawAnim.name || "default",
                duration: rawAnim.duration || 0,
                playTimes: rawAnim.playTimes !== undefined ? rawAnim.playTimes : 0,
                bone: [],
            };

            if (rawAnim.bone && Array.isArray(rawAnim.bone)) {
                for (const rawBoneTimeline of rawAnim.bone) {
                    const boneTimeline: any = {
                        name: rawBoneTimeline.name || "",
                        translateFrame: [],
                        rotateFrame: [],
                        scaleFrame: [],
                    };

                    // Parse translate keyframes
                    if (rawBoneTimeline.translateFrame && Array.isArray(rawBoneTimeline.translateFrame)) {
                        for (const kf of rawBoneTimeline.translateFrame) {
                            boneTimeline.translateFrame.push({
                                duration: kf.duration || 0,
                                x: kf.x || 0,
                                y: kf.y || 0,
                                tweenEasing: kf.tweenEasing !== undefined ? kf.tweenEasing : null,
                                curve:
                                    Array.isArray(kf.curve) && kf.curve.length >= 4
                                        ? { cx1: kf.curve[0], cy1: kf.curve[1], cx2: kf.curve[2], cy2: kf.curve[3] }
                                        : undefined,
                            });
                        }
                    }

                    // Parse rotate keyframes
                    if (rawBoneTimeline.rotateFrame && Array.isArray(rawBoneTimeline.rotateFrame)) {
                        for (const kf of rawBoneTimeline.rotateFrame) {
                            boneTimeline.rotateFrame.push({
                                duration: kf.duration || 0,
                                rotate: kf.rotate || 0,
                                tweenEasing: kf.tweenEasing !== undefined ? kf.tweenEasing : null,
                                curve:
                                    Array.isArray(kf.curve) && kf.curve.length >= 4
                                        ? { cx1: kf.curve[0], cy1: kf.curve[1], cx2: kf.curve[2], cy2: kf.curve[3] }
                                        : undefined,
                            });
                        }
                    }

                    // Parse scale keyframes
                    if (rawBoneTimeline.scaleFrame && Array.isArray(rawBoneTimeline.scaleFrame)) {
                        for (const kf of rawBoneTimeline.scaleFrame) {
                            boneTimeline.scaleFrame.push({
                                duration: kf.duration || 0,
                                x: kf.x !== undefined ? kf.x : 1,
                                y: kf.y !== undefined ? kf.y : 1,
                                tweenEasing: kf.tweenEasing !== undefined ? kf.tweenEasing : null,
                                curve:
                                    Array.isArray(kf.curve) && kf.curve.length >= 4
                                        ? { cx1: kf.curve[0], cy1: kf.curve[1], cx2: kf.curve[2], cy2: kf.curve[3] }
                                        : undefined,
                            });
                        }
                    }

                    animData.bone.push(boneTimeline);
                }
            }

            armature.animations.push(animData);
        }
    }

    console.log(
        "Parsed animations:",
        armature.animations.map((a: any) => `${a.name} (${a.duration} frames)`),
    );

    return armature;
}
