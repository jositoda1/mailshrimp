/**
 * HTTP status codes shared across MailShrimp applications and services.
 *
 * I keep these protocol-level constants in a shared HTTP package because
 * their meaning is independent from any individual MailShrimp microservice.
 * This prevents each API from defining its own copy of the same HTTP
 * primitives.
 *
 * I include the numeric HTTP code in each enum member name so both the
 * protocol meaning and its numeric value are immediately visible at every
 * call site.
 *
 * I deliberately keep this enum focused on HTTP statuses that MailShrimp
 * currently uses or is expected to use, instead of duplicating the entire
 * HTTP status-code registry without a concrete application need.
 */
export enum HttpStatus {
  /**
   * The request completed successfully.
   */
  OK_200 = 200,

  /**
   * A new resource was successfully created.
   */
  CREATED_201 = 201,

  /**
   * The request succeeded and intentionally returns no response body.
   */
  NO_CONTENT_204 = 204,

  /**
   * The client sent an invalid request.
   */
  BAD_REQUEST_400 = 400,

  /**
   * Authentication is required or the supplied authentication is invalid.
   */
  UNAUTHORIZED_401 = 401,

  /**
   * The authenticated caller is not allowed to perform the operation.
   */
  FORBIDDEN_403 = 403,

  /**
   * The requested resource does not exist.
   */
  NOT_FOUND_404 = 404,

  /**
   * The request conflicts with the current state of a resource.
   */
  CONFLICT_409 = 409,

  /**
   * The caller has exceeded an allowed request rate.
   */
  TOO_MANY_REQUESTS_429 = 429,

  /**
   * The server encountered an unexpected internal failure.
   */
  INTERNAL_SERVER_ERROR_500 = 500,

  /**
   * An upstream service returned an invalid response.
   */
  BAD_GATEWAY_502 = 502,

  /**
   * The service is temporarily unable to handle the request.
   */
  SERVICE_UNAVAILABLE_503 = 503,
}