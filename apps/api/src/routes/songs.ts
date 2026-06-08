import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { songService } from '../services/songService.js';
import { lyricService } from '../services/lyricService.js';
import { scoreService } from '../services/scoreService.js';
import { aiLyricService } from '../services/aiLyricService.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { fetchWikiSummary } from '../lib/wikiSummary.js';
import {
  updateSongSchema,
  createLyricSchema,
  updateLyricSchema,
  upsertScoreSchema,
} from '@band-spectrum-mapper/shared';

export const songsRouter = Router();

// GET /api/songs/yt-previews?bandIds=id1,id2
// Returns { [songId]: youtubeUrl } for songs that have a linked SongSpectrumAnalysis with a YouTube URL.
// Used by Cinema proximity audio to know which nodes can play audio.
songsRouter.get('/yt-previews', async (req, res, next) => {
  try {
    const raw = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];
    const analyses = await prisma.songSpectrumAnalysis.findMany({
      where: {
        youtubeUrl: { not: null },
        song: {
          ...(bandIds.length ? { bandId: { in: bandIds } } : {}),
        },
      },
      select: { songId: true, youtubeUrl: true },
    });
    const map: Record<string, string> = {};
    for (const a of analyses) {
      if (a.songId && a.youtubeUrl) map[a.songId] = a.youtubeUrl;
    }
    res.json(map);
  } catch (e) { next(e); }
});

// Global song search
songsRouter.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
    if (!q) { res.json([]); return; }
    res.json(await songService.search(q));
  } catch (e) { next(e); }
});

// Proxy lyrics lookup server-side to avoid CORS issues.
// Tries Lyrics.ovh first, then lrclib.net as a fallback (better indie/alternative coverage).
songsRouter.get('/lyrics-lookup', requireAuth, async (req, res, next) => {
  try {
    const artist = typeof req.query['artist'] === 'string' ? req.query['artist'].trim() : '';
    const title  = typeof req.query['title']  === 'string' ? req.query['title'].trim()  : '';
    if (!artist || !title) { res.status(400).json({ error: 'artist and title are required' }); return; }

    // Source 1: Lyrics.ovh
    try {
      const upstream = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
        { signal: AbortSignal.timeout(6_000) }
      );
      if (upstream.ok) {
        const data = await upstream.json() as { lyrics?: string };
        if (data.lyrics?.trim()) {
          res.json({ lyrics: data.lyrics.trim(), source: 'lyrics.ovh' }); return;
        }
      }
    } catch { /* fall through to next source */ }

    // Source 2: lrclib.net — community synced-lyrics db, good indie/alternative coverage
    try {
      const lrcRes = await fetch(
        `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`,
        { signal: AbortSignal.timeout(6_000), headers: { 'User-Agent': 'BandSpectrumMapper/1.0' } }
      );
      if (lrcRes.ok) {
        const hits = await lrcRes.json() as { plainLyrics?: string | null; syncedLyrics?: string | null }[];
        if (Array.isArray(hits) && hits.length > 0) {
          const hit = hits[0]!;
          // Prefer plain lyrics; fall back to stripping timestamps from synced lyrics
          const plain = hit.plainLyrics?.trim() ||
            hit.syncedLyrics?.replace(/^\[[\d:.]+\] ?/gm, '').trim();
          if (plain) {
            res.json({ lyrics: plain, source: 'lrclib.net' }); return;
          }
        }
      }
    } catch { /* fall through */ }

    res.status(404).json({ error: 'not found' });
  } catch (e) { next(e); }
});

// Song CRUD
songsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await songService.getById(req.params['id']!));
  } catch (e) { next(e); }
});

songsRouter.patch('/:id', validateBody(updateSongSchema), async (req, res, next) => {
  try {
    res.json(await songService.update(req.params['id']!, req.body));
  } catch (e) { next(e); }
});

// GET /api/songs/:id/wiki — fetch a Wikipedia intro summary for the song
songsRouter.get('/:id/wiki', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const song = await songService.getById(req.params['id']!);
    const band = (song as any).band?.name ?? (song as any).album?.band?.name ?? '';
    const query = band ? `${song.title} song ${band}` : `${song.title} song`;
    const result = await fetchWikiSummary(query);
    res.json(result);
  } catch (e) { next(e); }
});

songsRouter.delete('/:id', async (req, res, next) => {
  try {
    await songService.delete(req.params['id']!);
    res.status(204).end();
  } catch (e) { next(e); }
});

// Lyrics
songsRouter.get('/:songId/lyrics', async (req, res, next) => {
  try {
    res.json(await lyricService.listBySong(req.params['songId']!));
  } catch (e) { next(e); }
});

songsRouter.post('/:songId/lyrics', validateBody(createLyricSchema), async (req, res, next) => {
  try {
    res.status(201).json(await lyricService.create(req.params['songId']!, req.body));
  } catch (e) { next(e); }
});

// AI lyric recall — admin only, attempts to recall lyrics from GPT training data
songsRouter.post('/:songId/ai-lyrics', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const lyric = await aiLyricService.recallAndStore(req.params['songId']!);
    if (!lyric) {
      res.status(404).json({ error: 'Lyrics not found in AI training data for this song' });
      return;
    }
    res.status(201).json(lyric);
  } catch (e) { next(e); }
});

// Scores
songsRouter.get('/:songId/score', async (req, res, next) => {
  try {
    const score = await scoreService.getBySong(req.params['songId']!);
    if (!score) { res.status(404).json({ error: 'No score found for this song' }); return; }
    res.json(score);
  } catch (e) { next(e); }
});

songsRouter.put('/:songId/score', validateBody(upsertScoreSchema), async (req, res, next) => {
  try {
    res.json(await scoreService.upsert(req.params['songId']!, req.body));
  } catch (e) { next(e); }
});
