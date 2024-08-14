import type Struct from "@gasol/struct";
import type { StructValueType } from "@gasol/struct";

import { BufferedTransformStream } from "./buffered-transform.js";

export class StructDeserializeStream<
    T extends Struct<object, PropertyKey, object, unknown>,
> extends BufferedTransformStream<StructValueType<T>> {
    constructor(struct: T) {
        super((stream) => {
            return struct.deserialize(stream) as never;
        });
    }
}
