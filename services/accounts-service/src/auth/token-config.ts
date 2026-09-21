// services/accounts-service/src/auth/token-config.ts

/**
 * Authentication token configuration.
 *
 * I keep token lifetimes in one place because access and refresh tokens have
 * different security responsibilities. Scattering these values across token
 * generation, cookies, and tests could cause the server and browser to
 * disagree about when authentication expires.
 */

/**
 * Access tokens are intentionally short-lived.
 *
 * I use 15 minutes as the initial lifetime because an access token may be sent
 * with many authenticated API requests. If one is exposed, a short lifetime
 * limits how long that token remains useful.
 *
 * The value is expressed in seconds because token libraries commonly use
 * seconds for expiration claims and keeping the unit explicit avoids
 * accidental milliseconds/seconds conversions.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Refresh tokens live longer because their purpose is to obtain new access
 * tokens without requiring the user to sign in again.
 *
 * I start with a seven-day lifetime. Refresh tokens will later be rotated and
 * stored using server-side state so an old token cannot simply remain reusable
 * for its entire lifetime after rotation.
 */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * The browser cookie must follow the same lifetime as the refresh token.
 *
 * Cookie APIs express maxAge in milliseconds, while token expiration is
 * represented in seconds. I derive the cookie lifetime from the refresh-token
 * lifetime instead of maintaining two independent values that could drift.
 */
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS =
  REFRESH_TOKEN_TTL_SECONDS * 1000;

/**
 * I use a dedicated cookie name instead of a generic token name so its purpose
 * is explicit when configuring, testing, or clearing authentication cookies.
 *
 * The cookie will later be configured as HttpOnly and Secure in production.
 * Those security attributes belong to the HTTP cookie configuration rather
 * than to this lifetime configuration module.
 */
export const REFRESH_TOKEN_COOKIE_NAME = "mailshrimp_refresh_token";