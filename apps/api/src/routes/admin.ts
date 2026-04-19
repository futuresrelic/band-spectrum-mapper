import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

// List all users with rating counts and moderation state
adminRouter.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      isAdmin: true,
      isCommunityExcluded: true,
      isActive: true,
      createdAt: true,
      _count: { select: { ratings: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

// Get a user's full detail including all their ratings
adminRouter.get('/users/:userId', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params['userId'] },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      isAdmin: true,
      isCommunityExcluded: true,
      isActive: true,
      createdAt: true,
      _count: { select: { ratings: true } },
      ratings: {
        select: {
          id: true,
          songId: true,
          aggression: true,
          complexity: true,
          atmosphere: true,
          emotion: true,
          psychedelic: true,
          concept: true,
          updatedAt: true,
          song: {
            select: {
              id: true,
              title: true,
              band: { select: { name: true } },
              album: { select: { title: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// Update a user's moderation flags
adminRouter.patch('/users/:userId', async (req, res) => {
  const { isCommunityExcluded, isActive, isAdmin } = req.body as {
    isCommunityExcluded?: boolean;
    isActive?: boolean;
    isAdmin?: boolean;
  };

  const user = await prisma.user.update({
    where: { id: req.params['userId'] },
    data: {
      ...(isCommunityExcluded !== undefined && { isCommunityExcluded }),
      ...(isActive !== undefined && { isActive }),
      ...(isAdmin !== undefined && { isAdmin }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isCommunityExcluded: true,
      isActive: true,
    },
  });
  res.json(user);
});
