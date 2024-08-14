import type { ReadableStream } from "@gasol/stream-extra";
import type { ValueOrPromise } from "@gasol/struct";

import type { ScrcpyScrollController } from "../1_16/index.js";
import { ScrcpyOptions1_21 } from "../1_21.js";
import type { ScrcpyVideoStream } from "../codec.js";
import { ScrcpyVideoCodecId } from "../codec.js";
import { ScrcpyOptions } from "../types.js";

import type { ScrcpyOptionsInit1_22 } from "./init.js";
import { ScrcpyScrollController1_22 } from "./scroll.js";

export class ScrcpyOptions1_22 extends ScrcpyOptions<ScrcpyOptionsInit1_22> {
    static readonly DEFAULTS = {
        ...ScrcpyOptions1_21.DEFAULTS,
        downsizeOnError: true,
        sendDeviceMeta: true,
        sendDummyByte: true,
    } as const satisfies Required<ScrcpyOptionsInit1_22>;

    override get defaults(): Required<ScrcpyOptionsInit1_22> {
        return ScrcpyOptions1_22.DEFAULTS;
    }

    constructor(init: ScrcpyOptionsInit1_22) {
        super(ScrcpyOptions1_21, init, ScrcpyOptions1_22.DEFAULTS);
    }

    override parseVideoStreamMetadata(
        stream: ReadableStream<Uint8Array>,
    ): ValueOrPromise<ScrcpyVideoStream> {
        if (!this.value.sendDeviceMeta) {
            return { stream, metadata: { codec: ScrcpyVideoCodecId.H264 } };
        } else {
            return super.parseVideoStreamMetadata(stream);
        }
    }

    override serialize(): string[] {
        return ScrcpyOptions1_21.serialize(this.value, this.defaults);
    }

    override createScrollController(): ScrcpyScrollController {
        return new ScrcpyScrollController1_22();
    }
}
