import fs from "fs";
import { AMF3 } from "amf3-ts";

const DBPROJ_KEY = "DRAGONBONES_IS_BEST";

function decodeTest() {
    const fileBuf = fs.readFileSync("test_project/Dragon/Dragon.dbproj");
    // Buffer acts like Uint8Array in node
    const uint8Array = new Uint8Array(fileBuf);

    console.log("Input Array Length:", uint8Array.length);

    const decoded = new Uint8Array(uint8Array.length - 1);
    let keyIndex = 0;
    for (let i = 1; i < uint8Array.length; i++) {
        if (keyIndex >= DBPROJ_KEY.length) keyIndex = 0;
        decoded[i - 1] = (uint8Array[i] - DBPROJ_KEY.charCodeAt(keyIndex)) & 0xff;
        keyIndex++;
    }

    // Try parsing with just the exact underlying buffer
    console.log("Decoded Array Length:", decoded.length);
    console.log("Buffer byteLength:", decoded.buffer.byteLength);

    try {
        // Warning: ArrayBuffer from Node.js Buffer might be larger than the view!
        // In the browser, the buffer is exactly what we created.
        // Let's ensure we use exactly the correct slice.
        const exactBuffer = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength);
        console.log("Exact Buffer Length:", exactBuffer.byteLength);

        const amfData = AMF3.parse(exactBuffer);
        console.log("Parsed OK. Type:", typeof amfData);
    } catch (e) {
        console.error("AMF3 Parse Error:", e);
    }
}

decodeTest();
