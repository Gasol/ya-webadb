import type {
    PushReadableStreamController,
    ReadableStream,
    WritableStreamDefaultWriter,
} from "@gasol/stream-extra";
import {
    MaybeConsumable,
    PushReadableStream,
    StructDeserializeStream,
    WritableStream,
} from "@gasol/stream-extra";
import type { StructValueType } from "@gasol/struct";
import Struct, { placeholder } from "@gasol/struct";
import { PromiseResolver } from "@yume-chan/async";

import type { Adb, AdbSocket } from "../../../adb.js";
import { AdbFeature } from "../../../features.js";
import { encodeUtf8 } from "../../../utils/index.js";

import type { AdbSubprocessProtocol } from "./types.js";

export const AdbShellProtocolId = {
    Stdin: 0,
    Stdout: 1,
    Stderr: 2,
    Exit: 3,
    CloseStdin: 4,
    WindowSizeChange: 5,
} as const;

export type AdbShellProtocolId =
    (typeof AdbShellProtocolId)[keyof typeof AdbShellProtocolId];

// This packet format is used in both directions.
export const AdbShellProtocolPacket =
    /* #__PURE__ */
    new Struct({ littleEndian: true })
        .uint8("id", placeholder<AdbShellProtocolId>())
        .uint32("length")
        .uint8Array("data", { lengthField: "length" });

type AdbShellProtocolPacket = StructValueType<typeof AdbShellProtocolPacket>;

/**
 * Shell v2 a.k.a Shell Protocol
 *
 * Features:
 * * `stderr`: Yes
 * * `exit` exit code: Yes
 * * `resize`: Yes
 */
export class AdbSubprocessShellProtocol implements AdbSubprocessProtocol {
    static isSupported(adb: Adb) {
        return adb.canUseFeature(AdbFeature.ShellV2);
    }

    static async pty(adb: Adb, command: string) {
        // TODO: AdbShellSubprocessProtocol: Support setting `XTERM` environment variable
        return new AdbSubprocessShellProtocol(
            await adb.createSocket(`shell,v2,pty:${command}`),
        );
    }

    static async raw(adb: Adb, command: string) {
        return new AdbSubprocessShellProtocol(
            await adb.createSocket(`shell,v2,raw:${command}`),
        );
    }

    readonly #socket: AdbSocket;
    #writer: WritableStreamDefaultWriter<MaybeConsumable<Uint8Array>>;

    #stdin: WritableStream<MaybeConsumable<Uint8Array>>;
    get stdin() {
        return this.#stdin;
    }

    #stdout: ReadableStream<Uint8Array>;
    get stdout() {
        return this.#stdout;
    }

    #stderr: ReadableStream<Uint8Array>;
    get stderr() {
        return this.#stderr;
    }

    readonly #exit = new PromiseResolver<number>();
    get exit() {
        return this.#exit.promise;
    }

    constructor(socket: AdbSocket) {
        this.#socket = socket;

        let stdoutController!: PushReadableStreamController<Uint8Array>;
        let stderrController!: PushReadableStreamController<Uint8Array>;
        this.#stdout = new PushReadableStream<Uint8Array>((controller) => {
            stdoutController = controller;
        });
        this.#stderr = new PushReadableStream<Uint8Array>((controller) => {
            stderrController = controller;
        });

        socket.readable
            .pipeThrough(new StructDeserializeStream(AdbShellProtocolPacket))
            .pipeTo(
                new WritableStream<AdbShellProtocolPacket>({
                    write: async (chunk) => {
                        switch (chunk.id) {
                            case AdbShellProtocolId.Exit:
                                this.#exit.resolve(chunk.data[0]!);
                                break;
                            case AdbShellProtocolId.Stdout:
                                await stdoutController.enqueue(chunk.data);
                                break;
                            case AdbShellProtocolId.Stderr:
                                await stderrController.enqueue(chunk.data);
                                break;
                        }
                    },
                }),
            )
            .then(
                () => {
                    stdoutController.close();
                    stderrController.close();
                    // If `#exit` has already resolved, this will be a no-op
                    this.#exit.reject(
                        new Error("Socket ended without exit message"),
                    );
                },
                (e) => {
                    stdoutController.error(e);
                    stderrController.error(e);
                    // If `#exit` has already resolved, this will be a no-op
                    this.#exit.reject(e);
                },
            );

        this.#writer = this.#socket.writable.getWriter();

        this.#stdin = new MaybeConsumable.WritableStream<Uint8Array>({
            write: async (chunk) => {
                await this.#writer.write(
                    AdbShellProtocolPacket.serialize({
                        id: AdbShellProtocolId.Stdin,
                        data: chunk,
                    }),
                );
            },
        });
    }

    async resize(rows: number, cols: number) {
        await this.#writer.write(
            AdbShellProtocolPacket.serialize({
                id: AdbShellProtocolId.WindowSizeChange,
                // The "correct" format is `${rows}x${cols},${x_pixels}x${y_pixels}`
                // However, according to https://linux.die.net/man/4/tty_ioctl
                // `x_pixels` and `y_pixels` are unused, so always sending `0` should be fine.
                data: encodeUtf8(`${rows}x${cols},0x0\0`),
            }),
        );
    }

    kill() {
        return this.#socket.close();
    }
}
