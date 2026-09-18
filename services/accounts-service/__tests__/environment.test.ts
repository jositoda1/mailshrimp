// services/accounts-service/__tests__/environment.test.ts

import {
  DEFAULT_PORT,
  getPort,
} from "../src/config/environment.js";

describe("HTTP port configuration", () => {
  /**
   * I verify the default explicitly because port 3111 is part of the current
   * deployment architecture of the accounts service.
   */
  it("uses port 3111 when PORT is not configured", () => {
    expect(getPort(undefined)).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(3111);
  });

  /**
   * Deployment environments must be able to override the default port without
   * requiring a source-code change.
   */
  it("uses a valid port provided by the environment", () => {
    expect(getPort("4000")).toBe(4000);
  });

  /**
   * I test several invalid representations because accepting any of these
   * values could leave the service incorrectly configured or unreachable.
   */
  it.each([
    "",
    "abc",
    "0",
    "-1",
    "65536",
    "3111.5",
  ])("rejects invalid PORT value %j", (configuredPort) => {
    expect(() => getPort(configuredPort)).toThrow(
      `Invalid PORT environment variable: "${configuredPort}". Expected an integer between 1 and 65535.`,
    );
  });

  /**
   * Ports 1 and 65535 are valid boundary values, so I explicitly protect
   * against accidentally rejecting either end of the valid TCP port range.
   */
  it("accepts the lowest valid TCP port", () => {
    expect(getPort("1")).toBe(1);
  });

  it("accepts the highest valid TCP port", () => {
    expect(getPort("65535")).toBe(65535);
  });
});