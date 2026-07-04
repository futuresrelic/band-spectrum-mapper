import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

// Augment Express Request so downstream handlers get typed req.user
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthTokenPayload;
  }
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// For routes that behave differently for logged-in users but must not reject
// anonymous callers (e.g. "save this playlist under my account if I'm logged
// in"). Sets req.user when a valid Bearer token is present; otherwise leaves
// it undefined and always calls next() — never a 401.
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET) as AuthTokenPayload;
    } catch {
      // invalid/expired token on an optional-auth route — proceed as anonymous
    }
  }
  next();
}
