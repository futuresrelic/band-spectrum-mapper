import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = status < 500 ? err.message : 'Internal server error';

    if (status >= 500) {
      console.error('[API Error]', err);
    }

    res.status(status).json({ error: message });
    return;
  }

  console.error('[API Unknown Error]', err);
  res.status(500).json({ error: 'Internal server error' });
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
