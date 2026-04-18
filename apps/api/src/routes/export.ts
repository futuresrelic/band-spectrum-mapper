import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const exportRouter = Router();

exportRouter.get('/', async (_req, res, next) => {
  try {
    const bands = await prisma.band.findMany({
      include: {
        albums: {
          orderBy: [{ year: 'asc' }, { title: 'asc' }],
        },
        songs: {
          orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
          include: {
            lyrics: {
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
            },
            score: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const stopwords = await prisma.customStopword.findMany({ orderBy: { word: 'asc' } });

    res.json({
      exportedAt: new Date().toISOString(),
      version: '1',
      bands,
      customStopwords: stopwords,
    });
  } catch (e) {
    next(e);
  }
});
