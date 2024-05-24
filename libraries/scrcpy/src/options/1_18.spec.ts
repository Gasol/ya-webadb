import { describe, expect, it } from "@jest/globals";

import { ScrcpyOptions1_18 } from "./1_18.js";

describe("ScrcpyOptions1_18", () => {
    it("should share `value` with `base`", () => {
        const options = new ScrcpyOptions1_18({});
        // `setListDisplays` is implemented in `ScrcpyOptions1_16`,
        // but it should modify `value` of `ScrcpyOptions1_18`.
        options.setListDisplays();
        expect(options.value.displayId).toBe(-1);
    });
});
