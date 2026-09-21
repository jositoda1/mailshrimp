// services/accounts-service/src/middleware/request-context.ts

import { randomUUID } from "node:crypto";

import { type NextFunction, type Request, type Response,} from "express";

/**
 * Header used to expose the correlation identifier associated with a request.
 *
 * I use a dedicated request ID so logs produced while processing the same HTTP
 * request can later be correlated during debugging and security analysis.
 */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Express request extended with MailShrimp's request correlation identifier.
 *
 * I keep this extension local to the middleware for now instead of modifying
 * Express global types. A broader shared request context can be introduced
 * later if multiple parts of the service genuinely require it.
 */
export interface RequestWithId extends Request {
  requestId: string;
}

/**
 * Adds a unique correlation identifier to every HTTP request.
 *
 * I generate the identifier inside the service instead of trusting an
 * arbitrary client-supplied value. This prevents an external caller from
 * controlling the identifier used by internal logs.
 *
 * The identifier is also returned in the response header so an observed
 * client-side failure can be correlated with the corresponding server logs.
 */
export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();

  (request as RequestWithId).requestId = requestId;

  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}