import type { AdbDaemonDevice, AdbPacketData, AdbPacketInit } from "@gasol/adb";
import {
    AdbPacketHeader,
    AdbPacketSerializeStream,
    unreachable,
} from "@gasol/adb";
import type {
    Consumable,
    ReadableWritablePair,
    WritableStream,
} from "@gasol/stream-extra";
import {
    DuplexStreamFactory,
    MaybeConsumable,
    ReadableStream,
    pipeFrom,
} from "@gasol/stream-extra";
import type { ExactReadable } from "@gasol/struct";
import { EMPTY_UINT8_ARRAY } from "@gasol/struct";

import type { UsbInterfaceFilter } from "./utils.js";
import {
    findUsbAlternateInterface,
    findUsbEndpoints,
    getSerialNumber,
    isErrorName,
} from "./utils.js";

/**
 * The default filter for ADB devices, as defined by Google.
 */
export const ADB_DEFAULT_INTERFACE_FILTER = {
    classCode: 0xff,
    subclassCode: 0x42,
    protocolCode: 1,
} as const satisfies UsbInterfaceFilter;

export function toAdbDeviceFilters(
    filters: USBDeviceFilter[] | undefined,
): (USBDeviceFilter & UsbInterfaceFilter)[] {
    if (!filters || filters.length === 0) {
        return [ADB_DEFAULT_INTERFACE_FILTER];
    } else {
        return filters.map((filter) => ({
            ...filter,
            classCode:
                filter.classCode ?? ADB_DEFAULT_INTERFACE_FILTER.classCode,
            subclassCode:
                filter.subclassCode ??
                ADB_DEFAULT_INTERFACE_FILTER.subclassCode,
            protocolCode:
                filter.protocolCode ??
                ADB_DEFAULT_INTERFACE_FILTER.protocolCode,
        }));
    }
}

class Uint8ArrayExactReadable implements ExactReadable {
    #data: Uint8Array;
    #position: number;

    get position() {
        return this.#position;
    }

    constructor(data: Uint8Array) {
        this.#data = data;
        this.#position = 0;
    }

    readExactly(length: number): Uint8Array {
        const result = this.#data.subarray(
            this.#position,
            this.#position + length,
        );
        this.#position += length;
        return result;
    }
}

export class AdbDaemonWebUsbConnection
    implements ReadableWritablePair<AdbPacketData, Consumable<AdbPacketInit>>
{
    #device: AdbDaemonWebUsbDevice;
    get device() {
        return this.#device;
    }

    #inEndpoint: USBEndpoint;
    get inEndpoint() {
        return this.#inEndpoint;
    }

    #outEndpoint: USBEndpoint;
    get outEndpoint() {
        return this.#outEndpoint;
    }

    #readable: ReadableStream<AdbPacketData>;
    get readable() {
        return this.#readable;
    }

    #writable: WritableStream<Consumable<AdbPacketInit>>;
    get writable() {
        return this.#writable;
    }

    constructor(
        device: AdbDaemonWebUsbDevice,
        inEndpoint: USBEndpoint,
        outEndpoint: USBEndpoint,
        usbManager: USB,
    ) {
        this.#device = device;
        this.#inEndpoint = inEndpoint;
        this.#outEndpoint = outEndpoint;

        let closed = false;

        const duplex = new DuplexStreamFactory<
            AdbPacketData,
            Consumable<Uint8Array>
        >({
            close: async () => {
                try {
                    closed = true;
                    await device.raw.close();
                } catch {
                    /* device may have already disconnected */
                }
            },
            dispose: () => {
                closed = true;
                usbManager.removeEventListener(
                    "disconnect",
                    handleUsbDisconnect,
                );
            },
        });

        function handleUsbDisconnect(e: USBConnectionEvent) {
            if (e.device === device.raw) {
                duplex.dispose().catch(unreachable);
            }
        }

        usbManager.addEventListener("disconnect", handleUsbDisconnect);

        this.#readable = duplex.wrapReadable(
            new ReadableStream<AdbPacketData>(
                {
                    pull: async (controller) => {
                        const packet = await this.#transferIn();
                        if (packet) {
                            controller.enqueue(packet);
                        } else {
                            controller.close();
                        }
                    },
                },
                { highWaterMark: 0 },
            ),
        );

        const zeroMask = outEndpoint.packetSize - 1;
        this.#writable = pipeFrom(
            duplex.createWritable(
                new MaybeConsumable.WritableStream({
                    write: async (chunk) => {
                        try {
                            await device.raw.transferOut(
                                outEndpoint.endpointNumber,
                                chunk,
                            );

                            // In USB protocol, a not-full packet indicates the end of a transfer.
                            // If the payload size is a multiple of the packet size,
                            // we need to send an empty packet to indicate the end,
                            // so the OS will send it to the device immediately.
                            if (zeroMask && (chunk.length & zeroMask) === 0) {
                                await device.raw.transferOut(
                                    outEndpoint.endpointNumber,
                                    EMPTY_UINT8_ARRAY,
                                );
                            }
                        } catch (e) {
                            if (closed) {
                                return;
                            }
                            throw e;
                        }
                    },
                }),
            ),
            new AdbPacketSerializeStream(),
        );
    }

    async #transferIn(): Promise<AdbPacketData | undefined> {
        try {
            while (true) {
                // ADB daemon sends each packet in two parts, the 24-byte header and the payload.
                const result = await this.#device.raw.transferIn(
                    this.#inEndpoint.endpointNumber,
                    this.#inEndpoint.packetSize,
                );

                if (result.data!.byteLength !== 24) {
                    continue;
                }

                // Per spec, the `result.data` always covers the whole `buffer`.
                const buffer = new Uint8Array(result.data!.buffer);
                const stream = new Uint8ArrayExactReadable(buffer);

                // Add `payload` field to its type, it's assigned below.
                const packet = AdbPacketHeader.deserialize(
                    stream,
                ) as AdbPacketHeader & { payload: Uint8Array };

                if (packet.magic !== (packet.command ^ 0xffffffff)) {
                    continue;
                }

                if (packet.payloadLength !== 0) {
                    const result = await this.#device.raw.transferIn(
                        this.#inEndpoint.endpointNumber,
                        packet.payloadLength,
                    );
                    packet.payload = new Uint8Array(result.data!.buffer);
                } else {
                    packet.payload = EMPTY_UINT8_ARRAY;
                }

                return packet;
            }
        } catch (e) {
            // On Windows, disconnecting the device will cause `NetworkError` to be thrown,
            // even before the `disconnect` event is fired.
            // Wait a little while and check if the device is still connected.
            // https://github.com/WICG/webusb/issues/219
            if (isErrorName(e, "NetworkError")) {
                await new Promise<void>((resolve) => {
                    setTimeout(() => {
                        resolve();
                    }, 100);
                });

                if (closed) {
                    return undefined;
                }
            }

            throw e;
        }
    }
}

export class AdbDaemonWebUsbDevice implements AdbDaemonDevice {
    #filters: UsbInterfaceFilter[];
    #usbManager: USB;

    #raw: USBDevice;
    get raw() {
        return this.#raw;
    }

    #serial: string;
    get serial(): string {
        return this.#serial;
    }

    get name(): string {
        return this.#raw.productName!;
    }

    /**
     * Create a new instance of `AdbDaemonWebUsbConnection` using a specified `USBDevice` instance
     *
     * @param device The `USBDevice` instance obtained elsewhere.
     * @param filters The filters to use when searching for ADB interface. Defaults to {@link ADB_DEFAULT_DEVICE_FILTER}.
     */
    constructor(
        device: USBDevice,
        filters: UsbInterfaceFilter[],
        usbManager: USB,
    ) {
        this.#raw = device;
        this.#serial = getSerialNumber(device);
        this.#filters = filters;
        this.#usbManager = usbManager;
    }

    async #claimInterface(): Promise<[USBEndpoint, USBEndpoint]> {
        if (!this.#raw.opened) {
            await this.#raw.open();
        }

        const { configuration, interface_, alternate } =
            findUsbAlternateInterface(this.#raw, this.#filters);

        if (
            this.#raw.configuration?.configurationValue !==
            configuration.configurationValue
        ) {
            // Note: Switching configuration is not supported on Windows,
            // but Android devices should always expose ADB function at the first (default) configuration.
            await this.#raw.selectConfiguration(
                configuration.configurationValue,
            );
        }

        if (!interface_.claimed) {
            try {
                await this.#raw.claimInterface(interface_.interfaceNumber);
            } catch (e) {
                if (isErrorName(e, "NetworkError")) {
                    throw new AdbDaemonWebUsbDevice.DeviceBusyError(e);
                }

                throw e;
            }
        }

        if (
            interface_.alternate.alternateSetting !== alternate.alternateSetting
        ) {
            await this.#raw.selectAlternateInterface(
                interface_.interfaceNumber,
                alternate.alternateSetting,
            );
        }

        const { inEndpoint, outEndpoint } = findUsbEndpoints(
            alternate.endpoints,
        );
        return [inEndpoint, outEndpoint];
    }

    /**
     * Open the device and create a new connection to the ADB Daemon.
     *
     * [Online Documentation](https://docs.tangoapp.dev/tango/daemon/usb/create-connection/)
     */
    async connect(): Promise<AdbDaemonWebUsbConnection> {
        const [inEndpoint, outEndpoint] = await this.#claimInterface();
        return new AdbDaemonWebUsbConnection(
            this,
            inEndpoint,
            outEndpoint,
            this.#usbManager,
        );
    }
}

export namespace AdbDaemonWebUsbDevice {
    export class DeviceBusyError extends Error {
        constructor(cause?: Error) {
            super("The device is already in used by another program", {
                cause,
            });
        }
    }
}
