import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { adminKnowledgeService } from '../services/adminKnowledgeService.js';
import {
  startBatchJob,
  stopJob,
  getJobState,
  approveItem,
  rejectItem,
  clearJob,
} from '../services/lyricsBatchService.js';

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

// ---------------------------------------------------------------------------
// Knowledge entries — admin-authored context injected into AI analysis
// ---------------------------------------------------------------------------

adminRouter.get('/knowledge', async (_req, res, next) => {
  try { res.json(await adminKnowledgeService.list()); } catch (e) { next(e); }
});

adminRouter.post('/knowledge', async (req, res, next) => {
  try {
    const { title, content, scope, scopeId, tags, isActive, entryType, sourceLabel, sourceUrl } = req.body as {
      title: string; content: string; scope?: string;
      scopeId?: string | null; tags?: string[]; isActive?: boolean;
      entryType?: string; sourceLabel?: string | null; sourceUrl?: string | null;
    };
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'title and content are required' }); return;
    }
    res.status(201).json(await adminKnowledgeService.create({
      title, content, scope: scope ?? 'global',
      ...(scopeId     !== undefined && { scopeId }),
      ...(tags        !== undefined && { tags }),
      ...(isActive    !== undefined && { isActive }),
      ...(entryType   !== undefined && { entryType }),
      ...(sourceLabel !== undefined && { sourceLabel }),
      ...(sourceUrl   !== undefined && { sourceUrl }),
    }));
  } catch (e) { next(e); }
});

adminRouter.put('/knowledge/:id', async (req, res, next) => {
  try {
    res.json(await adminKnowledgeService.update(req.params['id']!, req.body as Parameters<typeof adminKnowledgeService.update>[1]));
  } catch (e) { next(e); }
});

adminRouter.delete('/knowledge/:id', async (req, res, next) => {
  try { await adminKnowledgeService.delete(req.params['id']!); res.json({ ok: true }); } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Database schema migrations — apply pending schema changes without CLI access
// ---------------------------------------------------------------------------

type MigrationStatus = { key: string; description: string; applied: boolean };

async function checkMigrations(): Promise<MigrationStatus[]> {
  const [artworkRows, aiRecallRows, knowledgeImagesRows] = await Promise.all([
    prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'albums' AND column_name = 'artworkUrl'
    `,
    prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'source_type' AND e.enumlabel = 'ai_recall'
    `,
    prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'admin_knowledge_entries' AND column_name = 'images'
    `,
  ]);
  return [
    {
      key: 'albums_artworkUrl',
      description: 'Add artworkUrl column to albums table (enables album art storage)',
      applied: artworkRows.length > 0,
    },
    {
      key: 'source_type_ai_recall',
      description: 'Add ai_recall value to source_type enum (enables AI lyrics recall)',
      applied: aiRecallRows.length > 0,
    },
    {
      key: 'knowledge_images',
      description: 'Add images JSONB column to admin_knowledge_entries (enables image attachments)',
      applied: knowledgeImagesRows.length > 0,
    },
  ];
}

adminRouter.get('/db-status', async (_req, res, next) => {
  try {
    res.json(await checkMigrations());
  } catch (e) { next(e); }
});

adminRouter.post('/db-migrate', async (_req, res, next) => {
  try {
    const before = await checkMigrations();
    const results: { key: string; description: string; status: 'applied' | 'already_applied' | 'error'; error?: string }[] = [];

    for (const m of before) {
      if (m.applied) {
        results.push({ key: m.key, description: m.description, status: 'already_applied' });
        continue;
      }
      try {
        if (m.key === 'albums_artworkUrl') {
          await prisma.$executeRaw`ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "artworkUrl" TEXT`;
        } else if (m.key === 'source_type_ai_recall') {
          await prisma.$executeRaw`ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'ai_recall'`;
        } else if (m.key === 'knowledge_images') {
          await prisma.$executeRaw`ALTER TABLE "admin_knowledge_entries" ADD COLUMN IF NOT EXISTS "images" JSONB NOT NULL DEFAULT '[]'`;
        }
        results.push({ key: m.key, description: m.description, status: 'applied' });
      } catch (err) {
        results.push({ key: m.key, description: m.description, status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    }

    res.json({ results });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Database health scan — detect orphaned/ghost data
// ---------------------------------------------------------------------------

adminRouter.get('/db-health', async (_req, res, next) => {
  try {
    const [unlinkedSongs, emptyAlbums, emptyBands, songsWithoutScores] = await Promise.all([
      prisma.song.findMany({
        where: { albumId: null },
        select: {
          id: true, title: true, slug: true, bandId: true,
          band: { select: { name: true } },
          _count: { select: { lyrics: true, ratings: true, comments: true } },
        },
        orderBy: [{ band: { name: 'asc' } }, { title: 'asc' }],
      }),
      prisma.album.findMany({
        where: { songs: { none: {} } },
        select: {
          id: true, title: true, slug: true, bandId: true,
          band: { select: { name: true } },
        },
        orderBy: [{ band: { name: 'asc' } }, { title: 'asc' }],
      }),
      prisma.band.findMany({
        where: { albums: { none: {} }, songs: { none: {} } },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      }),
      prisma.song.findMany({
        where: { score: null },
        select: {
          id: true, title: true, slug: true,
          band: { select: { name: true } },
          album: { select: { title: true } },
        },
        orderBy: [{ band: { name: 'asc' } }, { title: 'asc' }],
      }),
    ]);

    // Detect duplicate track numbers within the same album
    const dupGroups = await prisma.song.groupBy({
      by: ['albumId', 'trackNumber'],
      where: { albumId: { not: null }, trackNumber: { not: null } },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    });

    const dupSongs = dupGroups.length > 0
      ? await prisma.song.findMany({
          where: {
            OR: dupGroups.map((g) => ({ albumId: g.albumId!, trackNumber: g.trackNumber! })),
          },
          select: {
            id: true, title: true, slug: true, trackNumber: true, albumId: true,
            album: { select: { title: true, band: { select: { name: true } } } },
          },
          orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
        })
      : [];

    const dupMap = new Map<string, typeof dupSongs>();
    for (const s of dupSongs) {
      const key = `${s.albumId}:${s.trackNumber}`;
      if (!dupMap.has(key)) dupMap.set(key, []);
      dupMap.get(key)!.push(s);
    }
    const duplicateTrackNumbers = Array.from(dupMap.values()).map((songs) => ({
      albumId: songs[0]!.albumId!,
      albumTitle: songs[0]!.album!.title,
      bandName: songs[0]!.album!.band.name,
      trackNumber: songs[0]!.trackNumber!,
      songs: songs.map((s) => ({ id: s.id, title: s.title, slug: s.slug })),
    }));

    res.json({
      unlinkedSongs: unlinkedSongs.map((s) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        bandId: s.bandId,
        bandName: s.band.name,
        lyricCount: s._count.lyrics,
        ratingCount: s._count.ratings,
        commentCount: s._count.comments,
        isSafeToDelete: s._count.lyrics === 0 && s._count.ratings === 0 && s._count.comments === 0,
      })),
      emptyAlbums: emptyAlbums.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        bandId: a.bandId,
        bandName: a.band.name,
      })),
      emptyBands: emptyBands.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
      })),
      duplicateTrackNumbers,
      songsWithoutScores: songsWithoutScores.map((s) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        albumTitle: s.album?.title ?? null,
        bandName: s.band.name,
      })),
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Database cleanup — safe auto-fixes for detected issues
// ---------------------------------------------------------------------------

adminRouter.post('/db-cleanup', async (req, res, next) => {
  try {
    const { actions } = req.body as { actions?: unknown };
    if (!Array.isArray(actions) || actions.length === 0) {
      res.status(400).json({ error: 'actions must be a non-empty array' }); return;
    }

    const valid = new Set(['delete_safe_unlinked', 'delete_empty_albums', 'delete_empty_bands']);
    const requested = (actions as unknown[]).map(String).filter((a) => valid.has(a));
    if (requested.length === 0) {
      res.status(400).json({ error: 'No valid actions requested' }); return;
    }

    const results: Record<string, number> = {};

    if (requested.includes('delete_safe_unlinked')) {
      // Only delete unlinked songs that carry no user data
      const { count } = await prisma.song.deleteMany({
        where: {
          albumId: null,
          lyrics: { none: {} },
          ratings: { none: {} },
          comments: { none: {} },
        },
      });
      results['delete_safe_unlinked'] = count;
    }

    if (requested.includes('delete_empty_albums')) {
      const { count } = await prisma.album.deleteMany({
        where: { songs: { none: {} } },
      });
      results['delete_empty_albums'] = count;
    }

    if (requested.includes('delete_empty_bands')) {
      const { count } = await prisma.band.deleteMany({
        where: { albums: { none: {} }, songs: { none: {} } },
      });
      results['delete_empty_bands'] = count;
    }

    res.json({ results });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Album and song level actions — re-link, individual deletes
// ---------------------------------------------------------------------------

// GET /api/admin/albums-list — lightweight album list for the re-link dropdown
adminRouter.get('/albums-list', async (_req, res, next) => {
  try {
    const albums = await prisma.album.findMany({
      select: {
        id: true, title: true, year: true,
        band: { select: { id: true, name: true } },
      },
      orderBy: [{ band: { name: 'asc' } }, { year: 'asc' }, { title: 'asc' }],
    });
    res.json(albums.map((a) => ({
      id: a.id,
      title: a.title,
      year: a.year,
      bandId: a.band.id,
      bandName: a.band.name,
    })));
  } catch (e) { next(e); }
});

// PATCH /api/admin/songs/:songId/relink — restore albumId on an unlinked song
adminRouter.patch('/songs/:songId/relink', async (req, res, next) => {
  try {
    const { albumId } = req.body as { albumId?: unknown };
    if (typeof albumId !== 'string' || !albumId) {
      res.status(400).json({ error: 'albumId is required' }); return;
    }
    const [song, album] = await Promise.all([
      prisma.song.findUnique({ where: { id: req.params['songId']! }, select: { id: true, bandId: true } }),
      prisma.album.findUnique({ where: { id: albumId }, select: { id: true, bandId: true } }),
    ]);
    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }
    if (!album) { res.status(404).json({ error: 'Album not found' }); return; }
    if (song.bandId !== album.bandId) {
      res.status(400).json({ error: 'Album belongs to a different band than the song' }); return;
    }
    await prisma.song.update({ where: { id: song.id }, data: { albumId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/admin/songs/:songId — delete a single song and all its child data
adminRouter.delete('/songs/:songId', async (req, res, next) => {
  try {
    await prisma.song.delete({ where: { id: req.params['songId']! } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/admin/albums/:albumId — delete an album
// ?andSongs=true also deletes every song on that album (use for compilations / bad imports)
adminRouter.delete('/albums/:albumId', async (req, res, next) => {
  try {
    const andSongs = req.query['andSongs'] === 'true';
    if (andSongs) {
      await prisma.song.deleteMany({ where: { albumId: req.params['albumId']! } });
    }
    await prisma.album.delete({ where: { id: req.params['albumId']! } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Content gap queries — missing lyrics and missing artwork
// ---------------------------------------------------------------------------

// GET /api/admin/missing-lyrics — songs with no lyrics at all
adminRouter.get('/missing-lyrics', async (_req, res, next) => {
  try {
    const songs = await prisma.song.findMany({
      where: { lyrics: { none: {} } },
      select: {
        id: true, title: true, slug: true, trackNumber: true,
        band: { select: { id: true, name: true } },
        album: { select: { id: true, title: true } },
      },
      orderBy: [
        { band: { name: 'asc' } },
        { album: { title: 'asc' } },
        { trackNumber: 'asc' },
        { title: 'asc' },
      ],
    });
    res.json(songs.map((s) => ({
      id: s.id,
      title: s.title,
      trackNumber: s.trackNumber,
      bandId: s.band.id,
      bandName: s.band.name,
      albumId: s.album?.id ?? null,
      albumTitle: s.album?.title ?? null,
    })));
  } catch (e) { next(e); }
});

// GET /api/admin/missing-artwork — albums with no artworkUrl
adminRouter.get('/missing-artwork', async (_req, res, next) => {
  try {
    const albums = await prisma.album.findMany({
      where: { artworkUrl: null },
      select: {
        id: true, title: true, year: true,
        band: { select: { id: true, name: true } },
      },
      orderBy: [{ band: { name: 'asc' } }, { year: 'asc' }, { title: 'asc' }],
    });
    res.json(albums.map((a) => ({
      id: a.id,
      title: a.title,
      year: a.year,
      bandId: a.band.id,
      bandName: a.band.name,
    })));
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// AI batch scan — count songs missing each job type
// GET /api/admin/ai-batch/scan?bandIds=id1,id2
// ---------------------------------------------------------------------------

adminRouter.get('/ai-batch/scan', async (req, res, next) => {
  try {
    const bandIdsParam = req.query['bandIds'];
    const bandIds = typeof bandIdsParam === 'string' && bandIdsParam
      ? bandIdsParam.split(',').filter(Boolean)
      : [];
    const where = bandIds.length > 0 ? { bandId: { in: bandIds } } : {};

    // Count SongAiSpectrum records where all axes = 0 (effectively unscored)
    const spectrumZeroWhere = bandIds.length > 0
      ? { song: { bandId: { in: bandIds } }, aggression: 0, complexity: 0, atmosphere: 0, emotion: 0, psychedelic: 0, concept: 0 }
      : { aggression: 0, complexity: 0, atmosphere: 0, emotion: 0, psychedelic: 0, concept: 0 };

    const [total, hasAnalysis, hasSpectrum, hasSpectrumAllZero, hasResearch, hasGenre, hasTags, hasMeta] = await Promise.all([
      prisma.song.count({ where }),
      prisma.song.count({ where: { ...where, aiAnalysis:      { isNot: null } } }),
      prisma.song.count({ where: { ...where, aiSpectrum:      { isNot: null } } }),
      prisma.songAiSpectrum.count({ where: spectrumZeroWhere }),
      prisma.song.count({ where: { ...where, research:        { isNot: null } } }),
      prisma.song.count({ where: { ...where, aiGenreSpectrum: { isNot: null } } }),
      prisma.song.count({ where: { ...where, songTags:        { some: {}    } } }),
      prisma.song.count({ where: { ...where, durationSeconds: { not: null   } } }),
    ]);

    // Real spectrum = has a record AND at least one axis > 0
    const hasSpectrumReal = hasSpectrum - hasSpectrumAllZero;

    res.json({
      total,
      has:     { analysis: hasAnalysis, spectrum: hasSpectrumReal, research: hasResearch, genre: hasGenre, tags: hasTags, metadata: hasMeta },
      missing: { analysis: total - hasAnalysis, spectrum: total - hasSpectrumReal, research: total - hasResearch, genre: total - hasGenre, tags: total - hasTags, metadata: total - hasMeta },
      extra:   { spectrumZero: hasSpectrumAllZero },
    });
  } catch (e) { next(e); }
});

// POST /api/admin/songs/:songId/fetch-metadata
// Fetches track duration from MusicBrainz and saves it to the song record.
adminRouter.post('/songs/:songId/fetch-metadata', async (req, res, next) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params['songId']! },
      include: { band: { select: { name: true } } },
    });
    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }

    if (song.durationSeconds !== null) {
      res.json({ ok: true, durationSeconds: song.durationSeconds, source: 'cached' });
      return;
    }

    const { searchRecordingDuration } = await import('../services/musicBrainzService.js');
    const durationSeconds = await searchRecordingDuration(song.title, song.band.name);

    if (durationSeconds !== null) {
      await prisma.song.update({ where: { id: song.id }, data: { durationSeconds } });
    }

    res.json({ ok: true, durationSeconds, source: 'musicbrainz' });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Background lyrics batch job — fetches lyrics for all songs missing them,
// queues results for admin approval before saving. One job at a time.
// ---------------------------------------------------------------------------

adminRouter.post('/lyrics-batch/start', (_req, res) => {
  void startBatchJob(); // fire-and-forget
  res.json(getJobState());
});

adminRouter.post('/lyrics-batch/resume', async (_req, res, next) => {
  try {
    void startBatchJob({ resume: true });
    res.json(getJobState());
  } catch (e) { next(e); }
});

adminRouter.get('/lyrics-batch/status', (_req, res) => {
  res.json(getJobState());
});

adminRouter.post('/lyrics-batch/stop', (_req, res) => {
  stopJob();
  res.json(getJobState());
});

adminRouter.post('/lyrics-batch/clear', (_req, res) => {
  clearJob();
  res.json(getJobState());
});

// Approve: save lyrics to DB then mark approved
adminRouter.post('/lyrics-batch/approve/:itemId', async (req, res, next) => {
  try {
    const item = approveItem(req.params['itemId']!);
    if (!item) { res.status(404).json({ error: 'Item not found or already processed' }); return; }

    // Deactivate any existing primary lyric first, then create new one
    await prisma.lyric.updateMany({ where: { songId: item.songId, isPrimary: true }, data: { isPrimary: false } });
    await prisma.lyric.create({
      data: {
        songId: item.songId,
        text: item.text,
        sourceType: 'user_provided',
        sourceLabel: item.source,
        isPrimary: true,
      },
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Reject: just mark rejected in memory
adminRouter.post('/lyrics-batch/reject/:itemId', (req, res) => {
  rejectItem(req.params['itemId']!);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Song flags — mark as instrumental (skip in lyrics batch)
// ---------------------------------------------------------------------------

adminRouter.patch('/songs/:songId/instrumental', async (req, res, next) => {
  try {
    const { isInstrumental } = req.body as { isInstrumental?: boolean };
    if (typeof isInstrumental !== 'boolean') {
      res.status(400).json({ error: 'isInstrumental must be a boolean' }); return;
    }
    const song = await prisma.song.update({
      where: { id: req.params['songId']! },
      data: { isInstrumental },
    });
    res.json({ ok: true, isInstrumental: song.isInstrumental });
  } catch (e) { next(e); }
});

// Clear noLyricsAt for a song (force retry on next batch)
adminRouter.patch('/songs/:songId/clear-no-lyrics', async (req, res, next) => {
  try {
    await prisma.song.update({
      where: { id: req.params['songId']! },
      data: { noLyricsAt: null },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Game admin — leaderboard + config
// ---------------------------------------------------------------------------

adminRouter.get('/game/leaderboard', async (_req, res, next) => {
  try {
    const scores = await prisma.gameScore.findMany({
      take: 50,
      orderBy: { score: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    res.json(scores);
  } catch (e) { next(e); }
});

adminRouter.delete('/game/scores/:scoreId', async (req, res, next) => {
  try {
    await prisma.gameScore.delete({ where: { id: req.params['scoreId']! } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Prisma schema push — creates any new tables defined in schema.prisma
// ---------------------------------------------------------------------------

const execFileAsync = promisify(execFile);

adminRouter.post('/db-push', async (_req, res, next): Promise<void> => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const thisDir  = path.dirname(thisFile);
    // dist/routes/ → 4 levels up → monorepo root
    const root       = path.resolve(thisDir, '../../../../');
    const prismaBin  = path.join(root, 'node_modules', '.bin', 'prisma');
    const schemaPath = path.join(root, 'prisma', 'schema.prisma');

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [prismaBin, 'db', 'push', `--schema=${schemaPath}`, '--skip-generate'],
      { timeout: 120_000 },
    );

    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    res.json({ success: true, output });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trim();
    res.json({ success: false, output });
  }
});
