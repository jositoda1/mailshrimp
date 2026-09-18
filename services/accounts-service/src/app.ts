// services/accounts-service/src/app.ts

import express, { type Express, type Request, type Response } from "express";

/**
 * I create the Express application separately from the HTTP server so the
 * application can be tested without opening a real network port.
 */
export function createApp(): Express {
  const app = express();

  // JSON request parsing is configured once for the whole service.
  app.use(express.json());

  /**
   * The health endpoint provides a small, dependency-free check that confirms
   * that the accounts service application is running and accepting requests.
   */
  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json({
      status: "ok",
      service: "accounts-service",
    });
  });

  return app;
}