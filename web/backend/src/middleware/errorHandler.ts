import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { config } from '../config';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof AppError) {
    logger.error({
      message: error.message,
      statusCode: error.statusCode,
      path: req.path,
      method: req.method,
      details: error.details,
    });

    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      details: config.isDevelopment ? error.details : undefined,
    });
  } else {
    logger.error({
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      success: false,
      error: config.isDevelopment ? error.message : 'Internal server error',
      stack: config.isDevelopment ? error.stack : undefined,
    });
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
}