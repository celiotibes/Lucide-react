import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../shared/logger';

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

export class ValidationError extends Error implements ApiError {
  status = 400;
  code = 'VALIDATION_ERROR';

  constructor(message: string, public fields?: Record<string, string>) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error implements ApiError {
  status = 404;
  code = 'NOT_FOUND';

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements ApiError {
  status = 409;
  code = 'CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends Error implements ApiError {
  status = 401;
  code = 'UNAUTHORIZED';

  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error implements ApiError {
  status = 403;
  code = 'FORBIDDEN';

  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status = (err as ApiError).status || 500;
  const code = (err as ApiError).code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal server error';

  Logger.error('error-middleware', 'Request error', {
    status,
    code,
    message,
    path: req.path,
    method: req.method,
  });

  if (err instanceof ValidationError) {
    res.status(status).json({
      success: false,
      error: message,
      code,
      fields: err.fields,
      timestamp: new Date(),
    });
    return;
  }

  res.status(status).json({
    success: false,
    error: message,
    code,
    timestamp: new Date(),
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
