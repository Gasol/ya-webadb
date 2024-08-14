import type { Disposable, Event } from "@gasol/event";
import type {
    ScrcpyMediaStreamPacket,
    ScrcpyVideoCodecId,
} from "@gasol/scrcpy";
import type { WritableStream } from "@gasol/stream-extra";

export interface ScrcpyVideoDecoderCapability {
    maxProfile?: number;
    maxLevel?: number;
}

export interface ScrcpyVideoDecoder extends Disposable {
    readonly sizeChanged: Event<{ width: number; height: number; }>;
    readonly framesRendered: number;
    readonly framesSkipped: number;
    readonly writable: WritableStream<ScrcpyMediaStreamPacket>;
}

export interface ScrcpyVideoDecoderConstructor {
    readonly capabilities: Record<string, ScrcpyVideoDecoderCapability>;

    new(codec: ScrcpyVideoCodecId): ScrcpyVideoDecoder;
}
