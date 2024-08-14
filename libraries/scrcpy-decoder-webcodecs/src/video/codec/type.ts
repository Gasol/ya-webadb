import type { ScrcpyMediaStreamPacket } from "@gasol/scrcpy";

export interface CodecDecoder {
    decode(packet: ScrcpyMediaStreamPacket): void;
}

export interface CodecDecoderConstructor {
    new(
        decoder: VideoDecoder,
        updateSize: (width: number, height: number) => void,
    ): CodecDecoder;
}
