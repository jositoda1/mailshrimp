// services/accounts-service/src/auth/token-config.ts

/**
 * Authentication token policy defaults and limits.
 *
 * I keep the policy constants in one place because access and refresh tokens
 * have different security responsibilities. The environment layer can
 * override the default lifetimes, but it must validate those overrides against
 * the limits defined here before the token service receives them.
 */

/**
 * Access tokens are intentionally short-lived.
 *
 * I use 15 minutes as the default because an access token may be sent with many
 * authenticated API requests. If one is exposed, a short lifetime limits how
 * long that token remains useful.
 *
 * The value is expressed in seconds because JWT expiration claims use seconds.
 */
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Refresh tokens live longer because their purpose is to obtain new access
 * tokens without requiring the user to sign in again.
 *
 * I use seven days as the default. Refresh tokens will later be rotated and
 * backed by server-side state so an old token cannot remain reusable for its
 * entire original lifetime after rotation.
 */
export const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * I enforce a lower bound so a configuration mistake cannot create tokens that
 * expire effectively immediately.
 *
 * One minute is deliberately a validation boundary rather than the recommended
 * production access-token lifetime.
 */
export const MIN_ACCESS_TOKEN_TTL_SECONDS = 60;

/**
 * I cap access-token lifetime at one hour.
 *
 * Access tokens are bearer credentials, so allowing an accidental very long
 * lifetime would weaken the protection provided by short-lived access tokens.
 */
export const MAX_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * I require refresh tokens to live for at least one hour.
 *
 * This is a configuration safety boundary. The normal MailShrimp policy
 * remains the seven-day default above.
 */
export const MIN_REFRESH_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * I cap refresh-token lifetime at 30 days.
 *
 * A deployment can choose a lifetime shorter or longer than the seven-day
 * default, but this upper boundary prevents an accidental configuration from
 * producing extremely long-lived refresh credentials.
 */
export const MAX_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * I use a dedicated cookie name instead of a generic token name so its purpose
 * is explicit when configuring, testing, or clearing authentication cookies.
 *
 * The cookie will later be configured as HttpOnly and Secure in production.
 * Those security attributes belong to the HTTP cookie configuration rather
 * than to this token-policy module.
 */
export const REFRESH_TOKEN_COOKIE_NAME = "mailshrimp_refresh_token";

/**
 * Converts a validated refresh-token lifetime from seconds to the unit expected
 * by cookie maxAge.
 *
 * I derive the browser cookie lifetime from the effective refresh-token
 * lifetime instead of maintaining an independent cookie duration. This keeps
 * the JWT and browser expiration policies synchronized even when a deployment
 * overrides REFRESH_TOKEN_TTL_SECONDS through its environment.
 */
export function getRefreshTokenCookieMaxAgeMs(
  refreshTokenTtlSeconds: number,
): number {
  return refreshTokenTtlSeconds * 1000;
}
