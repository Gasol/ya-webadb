import { AutoDisposable } from "@gasol/event";

import type { Adb } from "../adb.js";

export class AdbCommandBase extends AutoDisposable {
    protected adb: Adb;

    constructor(adb: Adb) {
        super();
        this.adb = adb;
    }
}
