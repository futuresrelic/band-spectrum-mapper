import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { isAdmin: true, isActive: true },
  });
  if (!user?.isAdmin || !user.isActive) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
