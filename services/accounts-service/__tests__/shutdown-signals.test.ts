// services/accounts-service/__tests__/shutdown-signals.test.ts

import { jest } from "@jest/globals";

import type { ShutdownSignal } from "../src/service-shutdown.js";
import {
    registerShutdownSignals,
    type ShutdownHandler,
} from "../src/shutdown-signals.js";

/**
 * Represents the callback shape registered through process.once() for the two
 * termination signals supported by the accounts service.
 *
 * I store these callbacks instead of emitting real operating-system signals.
 * Sending SIGINT or SIGTERM to the Jest process would make the unit test
 * interfere with the test runner itself.
 */
type SignalListener = () => void;

describe("registerShutdownSignals", () => {
    /**
     * process.once() is global process behavior, so I restore the original Jest
     * spy after every test to prevent this suite from leaking mocked signal
     * registration into unrelated tests.
     */
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("registers SIGTERM and SIGINT handlers", () => {
        const shutdownHandler = jest.fn<ShutdownHandler>();

        shutdownHandler.mockResolvedValue();

        const onceSpy = jest.spyOn(process, "once").mockImplementation(((
            signal: string,
            listener: SignalListener,
        ) => {
            /**
             * The production function only registers listeners in this test.
             * I deliberately do not execute them because this case verifies the
             * supported signal registrations themselves.
             */
            void signal;
            void listener;

            return process;
        }) as typeof process.once);

        registerShutdownSignals(shutdownHandler);

        expect(onceSpy).toHaveBeenCalledTimes(2);

        expect(onceSpy).toHaveBeenNthCalledWith(
            1,
            "SIGTERM",
            expect.any(Function),
        );

        expect(onceSpy).toHaveBeenNthCalledWith(
            2,
            "SIGINT",
            expect.any(Function),
        );

        expect(shutdownHandler).not.toHaveBeenCalled();
    });

    it("starts shutdown only once when multiple signals are received", () => {
        const shutdownHandler = jest.fn<ShutdownHandler>();
        const listeners = new Map<ShutdownSignal, SignalListener>();

        /**
         * I keep the shutdown Promise pending so the second signal is simulated
         * while the first asynchronous shutdown is still in progress.
         *
         * The production guard must already be active at that point.
         */
        shutdownHandler.mockImplementation(
            () =>
                new Promise<void>(() => {
                    // Intentionally pending for the duration of this unit test.
                }),
        );

        jest.spyOn(process, "once").mockImplementation(((
            signal: string,
            listener: SignalListener,
        ) => {
            if (signal === "SIGTERM" || signal === "SIGINT") {
                listeners.set(signal, listener);
            }

            return process;
        }) as typeof process.once);

        registerShutdownSignals(shutdownHandler);

        const sigtermListener = listeners.get("SIGTERM");
        const sigintListener = listeners.get("SIGINT");

        if (sigtermListener === undefined || sigintListener === undefined) {
            throw new Error(
                "Expected SIGTERM and SIGINT listeners to be registered.",
            );
        }

        /**
         * I invoke the captured callbacks directly instead of sending real process
         * signals. This exercises the production guard without terminating Jest.
         */
        sigtermListener();
        sigintListener();

        expect(shutdownHandler).toHaveBeenCalledTimes(1);
        expect(shutdownHandler).toHaveBeenCalledWith("SIGTERM");
    });

    it("passes SIGINT to the shutdown handler when SIGINT arrives first", () => {
        const shutdownHandler = jest.fn<ShutdownHandler>();
        const listeners = new Map<ShutdownSignal, SignalListener>();

        shutdownHandler.mockResolvedValue();

        jest.spyOn(process, "once").mockImplementation(((
            signal: string,
            listener: SignalListener,
        ) => {
            if (signal === "SIGTERM" || signal === "SIGINT") {
                listeners.set(signal, listener);
            }

            return process;
        }) as typeof process.once);

        registerShutdownSignals(shutdownHandler);

        const sigintListener = listeners.get("SIGINT");

        if (sigintListener === undefined) {
            throw new Error("Expected SIGINT listener to be registered.");
        }

        sigintListener();

        expect(shutdownHandler).toHaveBeenCalledTimes(1);
        expect(shutdownHandler).toHaveBeenCalledWith("SIGINT");
    });
});
