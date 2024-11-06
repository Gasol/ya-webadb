import type { ReadableStream } from "@gasol/stream-extra";
import type { ValueOrPromise } from "@gasol/struct";

import { ScrcpyOptions1_21 } from "./1_21.js";
import { ScrcpyOptions2_0 } from "./2_0.js";
import type { ScrcpyOptionsInit2_2 } from "./2_2.js";
import { ScrcpyOptions2_2 } from "./2_2.js";
import type { ScrcpyAudioStreamMetadata } from "./codec.js";
import { ScrcpyAudioCodec } from "./codec.js";
import { ScrcpyOptions } from "./types.js";

// https://github.com/Genymobile/scrcpy/pull/4441
export enum ScrcpyDisplayOrientation2_3 {
    Zero = "0",
    Ninety = "90",
    OneEighty = "180",
    TwoSeventy = "270",
    Flip0 = "flip0",
    Flip90 = "flip90",
    Flip180 = "flip180",
    Flip270 = "flip270",
}

export interface ScrcpyOptionsInit2_3
    extends Omit<ScrcpyOptionsInit2_2, "audioCodec"> {
    audioCodec?: "raw" | "opus" | "aac" | "flac";
    displayOrientation?: ScrcpyDisplayOrientation2_3 | undefined;
}

export class ScrcpyOptions2_3 extends ScrcpyOptions<ScrcpyOptionsInit2_3> {
    static readonly DEFAULTS = {
        ...ScrcpyOptions2_2.DEFAULTS,
        displayOrientation: undefined,
    } as const satisfies Required<ScrcpyOptionsInit2_3>;

    override get defaults(): Required<ScrcpyOptionsInit2_3> {
        return ScrcpyOptions2_3.DEFAULTS;
    }

    constructor(init: ScrcpyOptionsInit2_3) {
        super(ScrcpyOptions2_2, init, ScrcpyOptions2_3.DEFAULTS);
    }

    override serialize(): string[] {
        return ScrcpyOptions1_21.serialize(this.value, this.defaults);
    }

    override parseAudioStreamMetadata(
        stream: ReadableStream<Uint8Array>,
    ): ValueOrPromise<ScrcpyAudioStreamMetadata> {
        return ScrcpyOptions2_0.parseAudioMetadata(
            stream,
            this.value.sendCodecMeta,
            (value) => {
                switch (value) {
                    case ScrcpyAudioCodec.RAW.metadataValue:
                        return ScrcpyAudioCodec.RAW;
                    case ScrcpyAudioCodec.OPUS.metadataValue:
                        return ScrcpyAudioCodec.OPUS;
                    case ScrcpyAudioCodec.AAC.metadataValue:
                        return ScrcpyAudioCodec.AAC;
                    case ScrcpyAudioCodec.FLAC.metadataValue:
                        return ScrcpyAudioCodec.FLAC;
                    default:
                        throw new Error(
                            `Unknown audio codec metadata value: ${value}`,
                        );
                }
            },
            () => {
                switch (this.value.audioCodec) {
                    case "raw":
                        return ScrcpyAudioCodec.RAW;
                    case "opus":
                        return ScrcpyAudioCodec.OPUS;
                    case "aac":
                        return ScrcpyAudioCodec.AAC;
                    case "flac":
                        return ScrcpyAudioCodec.FLAC;
                }
            },
        );
    }
}
