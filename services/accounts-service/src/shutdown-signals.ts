// services/accounts-service/src/shutdown-signals.ts

import type { ShutdownSignal } from "./service-shutdown.js";

/**
 * Represents the asynchronous operation that performs one service shutdown.
 *
 * I inject this function instead of importing process-level shutdown behavior
 * so signal registration remains independently testable without sending real
 * operating-system signals to the Jest process.
 */
export type ShutdownHandler = (signal: ShutdownSignal) => Promise<void>;

/**
 * Registers the operating-system signals supported by the accounts service.
 *
 * I keep signal registration separate from resource cleanup because process
 * events belong to the executable boundary while HTTP/MySQL cleanup has its
 * own independently testable lifecycle.
 *
 * Only the first received termination signal starts shutdown. A second signal
 * can arrive while asynchronous cleanup is still running, so the guard is set
 * before awaiting the shutdown handler.
 */
export function registerShutdownSignals(
    shutdownHandler: ShutdownHandler,
): void {
    let isShuttingDown = false;

    /**
     * Starts shutdown at most once for this registration.
     *
     * I deliberately do not reset the guard after success or failure. Once
     * termination has started, this process should continue toward termination
     * rather than attempt to resume normal operation or run cleanup again.
     */
    const handleSignal = (signal: ShutdownSignal): void => {
        if (isShuttingDown) {
            return;
        }

        isShuttingDown = true;

        /**
         * EventEmitter callbacks cannot await this asynchronous operation.
         *
         * The executable shutdown handler owns error handling, so this registration
         * layer only starts the operation and intentionally discards the returned
         * Promise after that responsibility has been established.
         */
        void shutdownHandler(signal);
    };

    /**
     * SIGTERM is commonly used by process managers and deployment environments.
     * SIGINT supports interactive local shutdown such as Ctrl+C.
     *
     * I use process.once() for each individual signal and retain the shared guard
     * because SIGTERM and SIGINT are separate events: receiving one does not
     * remove the listener registered for the other.
     */
    process.once("SIGTERM", () => {
        handleSignal("SIGTERM");
    });

    process.once("SIGINT", () => {
        handleSignal("SIGINT");
    });
}
