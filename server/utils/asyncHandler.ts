import { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 does not catch rejected promises from async route handlers — an unhandled rejection
// there crashes the whole process instead of just failing that one request. Wrapping every handler
// with this forwards the error to Express's error-handling middleware (see server/index.ts) instead.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
