declare module "amf3-ts" {
    export class AMF3 {
        static parse(buffer: ArrayBuffer | Uint8Array): any;
        static stringify(obj: any): Uint8Array;
    }
}
