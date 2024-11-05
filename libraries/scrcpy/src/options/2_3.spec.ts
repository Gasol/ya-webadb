import * as assert from "node:assert";
import { describe, it } from "node:test";

import { ScrcpyDisplayOrientation2_3, ScrcpyOptions2_3 } from "./2_3.js";

describe("ScrcpyOptions2_3", () => {
    describe("displayOrientation", () => {
        it("should set `displayOrientation` to `flip180`", () => {
            const options = new ScrcpyOptions2_3({
                displayOrientation: ScrcpyDisplayOrientation2_3.Flip180,
            });
            assert.strictEqual(options.value.displayOrientation, "flip180");
        });
    });
});
