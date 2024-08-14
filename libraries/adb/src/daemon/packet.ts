import { Consumable, TransformStream } from "@gasol/stream-extra";
import Struct from "@gasol/struct";

export enum AdbCommand {
    Auth = 0x48545541, // 'AUTH'
    Close = 0x45534c43, // 'CLSE'
    Connect = 0x4e584e43, // 'CNXN'
    Okay = 0x59414b4f, // 'OKAY'
    Open = 0x4e45504f, // 'OPEN'
    Write = 0x45545257, // 'WRTE'
}

export const AdbPacketHeader = new Struct({ littleEndian: true })
    .uint32("command")
    .uint32("arg0")
    .uint32("arg1")
    .uint32("payloadLength")
    .uint32("checksum")
    .int32("magic");

export type AdbPacketHeader = (typeof AdbPacketHeader)["TDeserializeResult"];

type AdbPacketHeaderInit = (typeof AdbPacketHeader)["TInit"];

export const AdbPacket = new Struct({ littleEndian: true })
    .concat(AdbPacketHeader)
    .uint8Array("payload", { lengthField: "payloadLength" });

export type AdbPacket = (typeof AdbPacket)["TDeserializeResult"];

/**
 * `AdbPacketData` contains all the useful fields of `AdbPacket`.
 *
 * `AdvDaemonConnection#connect` will return a `ReadableStream<AdbPacketData>`,
 * allow each connection to encode `AdbPacket` in different methods.
 *
 * `AdbDaemonConnection#connect` will return a `WritableStream<AdbPacketInit>`,
 * however, `AdbDaemonTransport` will transform `AdbPacketData` to `AdbPacketInit` for you,
 * so `AdbSocket#writable#write` only needs `AdbPacketData`.
 */
export type AdbPacketData = Omit<
    (typeof AdbPacket)["TInit"],
    "checksum" | "magic"
>;

export type AdbPacketInit = (typeof AdbPacket)["TInit"];

export function calculateChecksum(payload: Uint8Array): number {
    return payload.reduce((result, item) => result + item, 0);
}

export class AdbPacketSerializeStream extends TransformStream<
    Consumable<AdbPacketInit>,
    Consumable<Uint8Array>
> {
    constructor() {
        const headerBuffer = new Uint8Array(AdbPacketHeader.size);
        super({
            transform: async (chunk, controller) => {
                await chunk.tryConsume(async (chunk) => {
                    const init = chunk as AdbPacketInit & AdbPacketHeaderInit;
                    init.payloadLength = init.payload.length;

                    await Consumable.ReadableStream.enqueue(
                        controller,
                        AdbPacketHeader.serialize(init, headerBuffer),
                    );

                    if (init.payloadLength) {
                        // USB protocol preserves packet boundaries,
                        // so we must write payload separately as native ADB does,
                        // otherwise the read operation on device will fail.
                        await Consumable.ReadableStream.enqueue(
                            controller,
                            init.payload,
                        );
                    }
                });
            },
        });
    }
}
