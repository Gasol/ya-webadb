import type { ReadableStream } from "@gasol/stream-extra";

import type { ScrcpyOptionValue } from "./types.js";

export enum ScrcpyVideoCodecId {
    H264 = 0x68_32_36_34,
    H265 = 0x68_32_36_35,
    AV1 = 0x00_61_76_31,
}

export interface ScrcpyVideoStreamMetadata {
    deviceName?: string | undefined;
    width?: number | undefined;
    height?: number | undefined;
    codec: ScrcpyVideoCodecId;
}

export interface ScrcpyVideoStream {
    readonly stream: ReadableStream<Uint8Array>;
    readonly metadata: ScrcpyVideoStreamMetadata;
}

export class ScrcpyAudioCodec implements ScrcpyOptionValue {
    static readonly OPUS = new ScrcpyAudioCodec(
        "opus",
        0x6f_70_75_73,
        "audio/opus",
        "opus",
    );
    static readonly AAC = new ScrcpyAudioCodec(
        "aac",
        0x00_61_61_63,
        "audio/aac",
        "mp4a.66",
    );
    static readonly FLAC = new ScrcpyAudioCodec(
        "flac",
        0x66_6c_61_63,
        "audio/flac",
        "flac",
    );
    static readonly RAW = new ScrcpyAudioCodec(
        "raw",
        0x00_72_61_77,
        "audio/raw",
        "",
    );

    readonly optionValue: string;
    readonly metadataValue: number;
    readonly mimeType: string;
    readonly webCodecId: string;

    constructor(
        optionValue: string,
        metadataValue: number,
        mimeType: string,
        webCodecId: string,
    ) {
        this.optionValue = optionValue;
        this.metadataValue = metadataValue;
        this.mimeType = mimeType;
        this.webCodecId = webCodecId;
    }

    toOptionValue(): string {
        return this.optionValue;
    }
}

export interface ScrcpyAudioStreamDisabledMetadata {
    readonly type: "disabled";
}

export interface ScrcpyAudioStreamErroredMetadata {
    readonly type: "errored";
}

export interface ScrcpyAudioStreamSuccessMetadata {
    readonly type: "success";
    readonly codec: ScrcpyAudioCodec;
    readonly stream: ReadableStream<Uint8Array>;
}

export type ScrcpyAudioStreamMetadata =
    | ScrcpyAudioStreamDisabledMetadata
    | ScrcpyAudioStreamErroredMetadata
    | ScrcpyAudioStreamSuccessMetadata;

export interface ScrcpyMediaStreamConfigurationPacket {
    type: "configuration";
    data: Uint8Array;
}

export interface ScrcpyMediaStreamDataPacket {
    type: "data";
    keyframe?: boolean;
    pts?: bigint;
    data: Uint8Array;
}

export type ScrcpyMediaStreamPacket =
    | ScrcpyMediaStreamConfigurationPacket
    | ScrcpyMediaStreamDataPacket;
