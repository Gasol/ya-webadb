import { getInt16, setInt16 } from "@gasol/no-data-view";
import type { NumberFieldVariant } from "@gasol/struct";
import Struct, { NumberFieldDefinition } from "@gasol/struct";

import type { ScrcpyInjectScrollControlMessage } from "../../control/index.js";
import { ScrcpyControlMessageType } from "../../control/index.js";
import type { ScrcpyScrollController } from "../1_16/index.js";
import { clamp } from "../1_16/index.js";

export const ScrcpySignedFloatNumberVariant: NumberFieldVariant = {
    size: 2,
    signed: true,
    deserialize(array, littleEndian) {
        const value = getInt16(array, 0, littleEndian);
        // https://github.com/Genymobile/scrcpy/blob/1f138aef41de651668043b32c4effc2d4adbfc44/server/src/main/java/com/genymobile/scrcpy/Binary.java#L34
        return value === 0x7fff ? 1 : value / 0x8000;
    },
    serialize(array, offset, value, littleEndian) {
        // https://github.com/Genymobile/scrcpy/blob/1f138aef41de651668043b32c4effc2d4adbfc44/app/src/util/binary.h#L65
        value = clamp(value, -1, 1);
        value = value === 1 ? 0x7fff : value * 0x8000;
        setInt16(array, offset, value, littleEndian);
    },
};

const ScrcpySignedFloatFieldDefinition = new NumberFieldDefinition(
    ScrcpySignedFloatNumberVariant,
);

export const ScrcpyInjectScrollControlMessage1_25 = new Struct()
    .uint8("type", ScrcpyControlMessageType.InjectScroll as const)
    .uint32("pointerX")
    .uint32("pointerY")
    .uint16("screenWidth")
    .uint16("screenHeight")
    .field("scrollX", ScrcpySignedFloatFieldDefinition)
    .field("scrollY", ScrcpySignedFloatFieldDefinition)
    .int32("buttons");

export type ScrcpyInjectScrollControlMessage1_25 =
    (typeof ScrcpyInjectScrollControlMessage1_25)["TInit"];

export class ScrcpyScrollController1_25 implements ScrcpyScrollController {
    serializeScrollMessage(
        message: ScrcpyInjectScrollControlMessage,
    ): Uint8Array | undefined {
        return ScrcpyInjectScrollControlMessage1_25.serialize(message);
    }
}
