import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { z } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, "Too many requests. Please try again later.");
    this.name = "RateLimitError";
  }
}

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error(`[ERROR] ${err.name}: ${err.message}`);
  
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: "Validation Error",
      message: err.errors[0]?.message || "Invalid input",
      details: err.errors
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message
    });
    return;
  }

  if (err.message?.includes("duplicate key")) {
    res.status(409).json({
      error: "Conflict",
      message: "A record with this value already exists"
    });
    return;
  }

  if (err.message?.includes("foreign key")) {
    res.status(400).json({
      error: "Reference Error",
      message: "Referenced record does not exist"
    });
    return;
  }

  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred"
  });
};

export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
