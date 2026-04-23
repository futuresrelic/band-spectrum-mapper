import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const brandRouter = Router();

async function serveIcon(sizes: number[], res: any, next: any) {
  try {
    for (const size of sizes) {
      const icon = await prisma.appIcon.findUnique({ where: { size } });
      if (icon) {
        const base64 = icon.dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(base64, 'base64');
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600');
        return res.end(buf);
      }
    }
    res.status(404).end();
  } catch (e) { next(e); }
}

brandRouter.get('/favicon.png', (_req, res, next) => serveIcon([32, 64, 192], res, next));
brandRouter.get('/logo.png', (_req, res, next) => serveIcon([512, 192], res, next));
brandRouter.get('/apple-touch-icon.png', (_req, res, next) => serveIcon([180, 192, 512], res, next));
