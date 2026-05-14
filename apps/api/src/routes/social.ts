import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  generateSocialPost,
  chatWithStrategist,
  buildSongContextString,
} from '../services/socialAiService.js';

export const socialRouter = Router();

socialRouter.use(requireAuth);
socialRouter.use(requireAdmin);

// ---------------------------------------------------------------------------
// POST /api/social/generate — generate social post content for a song
// ---------------------------------------------------------------------------

socialRouter.post('/generate', async (req, res, next) => {
  try {
    const { songId, platform, postType, tone, variants = 1 } = req.body as {
      songId?: string;
      platform?: string;
      postType?: string;
      tone?: string;
      variants?: number;
    };

    if (!songId || !platform || !postType || !tone) {
      res.status(400).json({ error: 'songId, platform, postType, and tone are required' });
      return;
    }

    const validPlatforms = ['facebook', 'instagram', 'threads', 'tiktok', 'reddit'];
    const validPostTypes = ['radar_analysis', 'emotional', 'philosophy', 'poll', 'entry_point', 'compare', 'meme', 'discussion'];
    const validTones = ['cinematic', 'analytical', 'conversational', 'provocative'];

    if (!validPlatforms.includes(platform)) { res.status(400).json({ error: 'Invalid platform' }); return; }
    if (!validPostTypes.includes(postType)) { res.status(400).json({ error: 'Invalid postType' }); return; }
    if (!validTones.includes(tone)) { res.status(400).json({ error: 'Invalid tone' }); return; }

    const clampedVariants = Math.max(1, Math.min(3, Math.floor(variants)));
    const posts = await generateSocialPost({ songId, platform, postType, tone, variants: clampedVariants });

    res.json({ posts });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/social/chat — conversational AI strategist
// ---------------------------------------------------------------------------

socialRouter.post('/chat', async (req, res, next) => {
  try {
    const { messages, songId } = req.body as {
      messages?: { role: 'user' | 'assistant'; content: string }[];
      songId?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array is required' });
      return;
    }

    const songContext = songId ? await buildSongContextString(songId) : undefined;
    const reply = await chatWithStrategist(messages, songContext || undefined);

    res.json({ reply });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/social/song-context/:songId — fetch context string for a song
// (used by the chat panel to inject current song data)
// ---------------------------------------------------------------------------

socialRouter.get('/song-context/:songId', async (req, res, next) => {
  try {
    const context = await buildSongContextString(req.params['songId']!);
    res.json({ context });
  } catch (e) { next(e); }
});
