import type { Consumable, ReadableWritablePair } from "@gasol/stream-extra";
import type { ValueOrPromise } from "@gasol/struct";

import type { AdbPacketData, AdbPacketInit } from "./packet.js";

export interface AdbDaemonDevice {
    readonly serial: string;

    readonly name: string | undefined;

    connect(): ValueOrPromise<
        ReadableWritablePair<AdbPacketData, Consumable<AdbPacketInit>>
    >;
}
