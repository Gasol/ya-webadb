import type { ReadableStream } from "@gasol/stream-extra";
import { PushReadableStream } from "@gasol/stream-extra";
import Struct from "@gasol/struct";

import { AdbSyncRequestId, adbSyncWriteRequest } from "./request.js";
import { AdbSyncResponseId, adbSyncReadResponses } from "./response.js";
import type { AdbSyncSocket } from "./socket.js";

export const AdbSyncDataResponse =
    /* #__PURE__ */
    new Struct({ littleEndian: true })
        .uint32("dataLength")
        .uint8Array("data", { lengthField: "dataLength" });

export type AdbSyncDataResponse =
    (typeof AdbSyncDataResponse)["TDeserializeResult"];

export async function* adbSyncPullGenerator(
    socket: AdbSyncSocket,
    path: string,
): AsyncGenerator<Uint8Array, void, void> {
    const locked = await socket.lock();
    let done = false;
    try {
        await adbSyncWriteRequest(locked, AdbSyncRequestId.Receive, path);
        for await (const packet of adbSyncReadResponses(
            locked,
            AdbSyncResponseId.Data,
            AdbSyncDataResponse,
        )) {
            yield packet.data;
        }
        done = true;
    } catch (e) {
        done = true;
        throw e;
    } finally {
        if (!done) {
            // sync pull can't be cancelled, so we have to read all data
            for await (const packet of adbSyncReadResponses(
                locked,
                AdbSyncResponseId.Data,
                AdbSyncDataResponse,
            )) {
                void packet;
            }
        }
        locked.release();
    }
}

export function adbSyncPull(
    socket: AdbSyncSocket,
    path: string,
): ReadableStream<Uint8Array> {
    // TODO: use `ReadableStream.from` when it's supported
    return new PushReadableStream(async (controller) => {
        for await (const data of adbSyncPullGenerator(socket, path)) {
            await controller.enqueue(data);
        }
    });
}
