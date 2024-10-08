// cspell: ignore killforward

import { AutoDisposable } from "@gasol/event";
import { BufferedReadableStream } from "@gasol/stream-extra";
import Struct, { ExactReadableEndedError, encodeUtf8 } from "@gasol/struct";

import type { Adb, AdbIncomingSocketHandler } from "../adb.js";
import { hexToNumber, sequenceEqual } from "../utils/index.js";

export interface AdbForwardListener {
    deviceSerial: string;

    localName: string;

    remoteName: string;
}

const AdbReverseStringResponse = new Struct()
    .string("length", { length: 4 })
    .string("content", { lengthField: "length", lengthFieldRadix: 16 });

export class AdbReverseError extends Error {
    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class AdbReverseNotSupportedError extends AdbReverseError {
    constructor() {
        super(
            "ADB reverse tunnel is not supported on this device when connected wirelessly.",
        );
    }
}

const AdbReverseErrorResponse = new Struct()
    .concat(AdbReverseStringResponse)
    .postDeserialize((value) => {
        // https://issuetracker.google.com/issues/37066218
        // ADB on Android <9 can't create reverse tunnels when connected wirelessly (ADB over Wi-Fi),
        // and returns this confusing "more than one device/emulator" error.
        if (value.content === "more than one device/emulator") {
            throw new AdbReverseNotSupportedError();
        } else {
            throw new AdbReverseError(value.content);
        }
    });

// Like `hexToNumber`, it's much faster than first converting `buffer` to a string
function decimalToNumber(buffer: Uint8Array) {
    let value = 0;
    for (const byte of buffer) {
        // Like `parseInt`, return when it encounters a non-digit character
        if (byte < 48 || byte > 57) {
            return value;
        }
        value = value * 10 + byte - 48;
    }
    return value;
}

const OKAY = encodeUtf8("OKAY");

export class AdbReverseCommand extends AutoDisposable {
    protected adb: Adb;

    readonly #deviceAddressToLocalAddress = new Map<string, string>();

    constructor(adb: Adb) {
        super();

        this.adb = adb;
    }

    protected async createBufferedStream(service: string) {
        const socket = await this.adb.createSocket(service);
        return new BufferedReadableStream(socket.readable);
    }

    protected async sendRequest(service: string) {
        const stream = await this.createBufferedStream(service);

        const response = await stream.readExactly(4);
        if (!sequenceEqual(response, OKAY)) {
            await AdbReverseErrorResponse.deserialize(stream);
        }

        return stream;
    }

    async list(): Promise<AdbForwardListener[]> {
        const stream = await this.createBufferedStream("reverse:list-forward");

        const response = await AdbReverseStringResponse.deserialize(stream);
        return response.content
            .split("\n")
            .filter((line) => !!line)
            .map((line) => {
                const [deviceSerial, localName, remoteName] = line.split(
                    " ",
                ) as [string, string, string];
                return { deviceSerial, localName, remoteName };
            });

        // No need to close the stream, device will close it
    }

    /**
     * Add an already existing reverse tunnel. Depends on the transport type, this may not do anything.
     * @param deviceAddress The address to be listened on device by ADB daemon. Or `tcp:0` to choose an available TCP port.
     * @param localAddress The address that listens on the local machine.
     * @returns `tcp:{ACTUAL_LISTENING_PORT}`, If `deviceAddress` is `tcp:0`; otherwise, `deviceAddress`.
     */
    async addExternal(deviceAddress: string, localAddress: string) {
        const stream = await this.sendRequest(
            `reverse:forward:${deviceAddress};${localAddress}`,
        );

        // `tcp:0` tells the device to pick an available port.
        // On Android >=8, device will respond with the selected port for all `tcp:` requests.
        if (deviceAddress.startsWith("tcp:")) {
            const position = stream.position;
            try {
                const length = hexToNumber(await stream.readExactly(4));
                const port = decimalToNumber(await stream.readExactly(length));
                deviceAddress = `tcp:${port}`;
            } catch (e) {
                if (
                    e instanceof ExactReadableEndedError &&
                    stream.position === position
                ) {
                    // Android <8 doesn't have this response.
                    // (the stream is closed now)
                    // Can be safely ignored.
                } else {
                    throw e;
                }
            }
        }

        return deviceAddress;
    }

    /**
     * @param deviceAddress The address to be listened on device by ADB daemon. Or `tcp:0` to choose an available TCP port.
     * @param handler A callback to handle incoming connections.
     * @param localAddressThe The address that listens on the local machine. May be `undefined` to let the transport choose an appropriate one.
     * @returns `tcp:{ACTUAL_LISTENING_PORT}`, If `deviceAddress` is `tcp:0`; otherwise, `deviceAddress`.
     * @throws {AdbReverseNotSupportedError} If ADB reverse tunnel is not supported on this device when connected wirelessly.
     * @throws {AdbReverseError} If ADB daemon returns an error.
     */
    async add(
        deviceAddress: string,
        handler: AdbIncomingSocketHandler,
        localAddress?: string,
    ): Promise<string> {
        localAddress = await this.adb.transport.addReverseTunnel(
            handler,
            localAddress,
        );

        try {
            deviceAddress = await this.addExternal(deviceAddress, localAddress);
            this.#deviceAddressToLocalAddress.set(deviceAddress, localAddress);
            return deviceAddress;
        } catch (e) {
            await this.adb.transport.removeReverseTunnel(localAddress);
            throw e;
        }
    }

    async remove(deviceAddress: string): Promise<void> {
        const localAddress =
            this.#deviceAddressToLocalAddress.get(deviceAddress);
        if (localAddress) {
            await this.adb.transport.removeReverseTunnel(localAddress);
        }

        await this.sendRequest(`reverse:killforward:${deviceAddress}`);

        // No need to close the stream, device will close it
    }

    async removeAll(): Promise<void> {
        await this.adb.transport.clearReverseTunnels();
        this.#deviceAddressToLocalAddress.clear();

        await this.sendRequest(`reverse:killforward-all`);

        // No need to close the stream, device will close it
    }
}
