import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  buildCuratorProfile,
  allAvailableTitles,
  computeLevel,
} from '../services/curatorService.js';

export const curatorRouter = Router();

// GET /curator — full curator profile + stats + badges + activity
curatorRouter.get('/', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId  = req.user!.userId;
    const profile = await buildCuratorProfile(userId);
    res.json(profile); return;
  } catch (err) { next(err); }
});

// PUT /curator/title — set active title
curatorRouter.put('/title', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { title } = req.body as { title?: string };

    if (!title?.trim()) {
      res.status(400).json({ error: 'title is required' }); return;
    }

    const profile = await prisma.bandRpgCuratorProfile.findUnique({
      where:  { userId },
      select: { xp: true, titlesUnlocked: true },
    });

    const level       = computeLevel(profile?.xp ?? 0).level;
    const available   = allAvailableTitles(level, profile?.titlesUnlocked ?? []);

    if (!available.includes(title.trim())) {
      res.status(400).json({ error: 'Title not unlocked' }); return;
    }

    await prisma.bandRpgCuratorProfile.upsert({
      where:  { userId },
      create: { userId, currentTitle: title.trim() },
      update: { currentTitle: title.trim() },
    });

    res.json({ ok: true, currentTitle: title.trim() }); return;
  } catch (err) { next(err); }
});

// PUT /curator/visibility — set profile visibility
curatorRouter.put('/visibility', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { visibility } = req.body as { visibility?: string };
    if (!visibility || !['public', 'unlisted', 'private'].includes(visibility)) {
      res.status(400).json({ error: 'visibility must be public, unlisted, or private' }); return;
    }
    await prisma.bandRpgCuratorProfile.upsert({
      where:  { userId },
      create: { userId, visibility },
      update: { visibility },
    });
    res.json({ ok: true, visibility }); return;
  } catch (err) { next(err); }
});

// PUT /curator/character — set selected character (avatar)
curatorRouter.put('/character', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { characterId, characterName } = req.body as {
      characterId?: string;
      characterName?: string;
    };

    await prisma.bandRpgCuratorProfile.upsert({
      where:  { userId },
      create: {
        userId,
        ...(characterId   ? { selectedCharacterId:   characterId }   : {}),
        ...(characterName ? { selectedCharacterName: characterName } : {}),
      },
      update: {
        ...(characterId   ? { selectedCharacterId:   characterId }   : {}),
        ...(characterName ? { selectedCharacterName: characterName } : {}),
      },
    });

    res.json({ ok: true }); return;
  } catch (err) { next(err); }
});
