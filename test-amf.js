const fs = require("fs");
const { AMF3 } = require("amf3-ts");

const KEY = "DRAGONBONES_IS_BEST";

function decode() {
    const data = fs.readFileSync("C:\\Users\\Firekula\\Documents\\DBProjects\\Dragon\\Dragon.dbproj");
    if (data[0] === 111) {
        const decoded = Buffer.alloc(data.length - 1);
        let keyIndex = 0;
        for (let i = 1; i < data.length; i++) {
            if (keyIndex >= KEY.length) keyIndex = 0;
            decoded[i - 1] = (data[i] - KEY.charCodeAt(keyIndex)) & 0xff;
            keyIndex++;
        }
        console.log("Decoding complete, first few bytes:", decoded.slice(0, 20));

        try {
            // Read AMF3 from decoded bytes
            const amf3 = new AMF3(decoded);
            const result = amf3.read();
            console.log("Successfully parsed AMF3 object!");
            fs.writeFileSync("test_output.json", JSON.stringify(result, null, 2));
        } catch (e) {
            console.log("AMF3 parse error:", e);
        }
    } else {
        console.log("Normal JSON file");
    }
}

decode();
