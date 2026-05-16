import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { mineComments } from '../services/commentMiningService.js';
import type { PostStatus, AssetType, PromptCategory } from '@prisma/client';

export const socialPlannerRouter = Router();

// All planner routes require admin
socialPlannerRouter.use(requireAuth, requireAdmin);

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

socialPlannerRouter.get('/posts', async (req, res, next): Promise<void> => {
  try {
    const { status, bandId, month } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (status)  where['status']  = status as PostStatus;
    if (bandId)  where['bandId']  = bandId;
    if (month) {
      const [y, m] = month.split('-').map(Number);
      if (y && m) {
        const start = new Date(y, m - 1, 1);
        const end   = new Date(y, m, 1);
        where['plannedAt'] = { gte: start, lt: end };
      }
    }
    const posts = await prisma.socialPost.findMany({
      where,
      include: {
        band:   { select: { id: true, name: true } },
        album:  { select: { id: true, title: true } },
        song:   { select: { id: true, title: true } },
        series: { select: { id: true, name: true } },
        assets: true,
        metrics: true,
      },
      orderBy: [{ plannedAt: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(posts);
  } catch (e) { next(e); }
});

socialPlannerRouter.post('/posts', async (req, res, next): Promise<void> => {
  try {
    const {
      title, status, postType, platforms, caption, hashtags, cta,
      pollOptions, notes, bandId, albumId, songId, seriesId,
      plannedAt, generatedBody, aiPromptUsed,
    } = req.body as {
      title: string; status?: PostStatus; postType: string; platforms?: string[];
      caption?: string; hashtags?: string[]; cta?: string; pollOptions?: string[];
      notes?: string; bandId?: string; albumId?: string; songId?: string; seriesId?: string;
      plannedAt?: string; generatedBody?: string; aiPromptUsed?: string;
    };

    const post = await prisma.socialPost.create({
      data: {
        title,
        ...(status    ? { status }    : {}),
        postType,
        platforms:    platforms    ?? [],
        caption:      caption      ?? null,
        hashtags:     hashtags     ?? [],
        cta:          cta          ?? null,
        pollOptions:  pollOptions  ?? [],
        notes:        notes        ?? null,
        bandId:       bandId       ?? null,
        albumId:      albumId      ?? null,
        songId:       songId       ?? null,
        seriesId:     seriesId     ?? null,
        plannedAt:    plannedAt    ? new Date(plannedAt) : null,
        generatedBody: generatedBody ?? null,
        aiPromptUsed:  aiPromptUsed  ?? null,
      },
    });
    res.status(201).json(post);
  } catch (e) { next(e); }
});

socialPlannerRouter.get('/posts/:id', async (req, res, next): Promise<void> => {
  try {
    const post = await prisma.socialPost.findUnique({
      where: { id: req.params['id']! },
      include: {
        band: true, album: true, song: true, series: true, assets: true, metrics: true,
      },
    });
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
    res.json(post);
  } catch (e) { next(e); }
});

socialPlannerRouter.put('/posts/:id', async (req, res, next): Promise<void> => {
  try {
    const {
      title, status, postType, platforms, caption, hashtags, cta,
      pollOptions, notes, bandId, albumId, songId, seriesId,
      plannedAt, postedAt, postUrl, generatedBody, aiPromptUsed,
    } = req.body as {
      title?: string; status?: PostStatus; postType?: string; platforms?: string[];
      caption?: string; hashtags?: string[]; cta?: string; pollOptions?: string[];
      notes?: string; bandId?: string | null; albumId?: string | null; songId?: string | null;
      seriesId?: string | null; plannedAt?: string | null; postedAt?: string | null;
      postUrl?: string | null; generatedBody?: string; aiPromptUsed?: string;
    };

    const post = await prisma.socialPost.update({
      where: { id: req.params['id']! },
      data: {
        ...(title         !== undefined ? { title }                              : {}),
        ...(status        !== undefined ? { status }                             : {}),
        ...(postType      !== undefined ? { postType }                           : {}),
        ...(platforms     !== undefined ? { platforms }                          : {}),
        ...(caption       !== undefined ? { caption }                            : {}),
        ...(hashtags      !== undefined ? { hashtags }                           : {}),
        ...(cta           !== undefined ? { cta }                                : {}),
        ...(pollOptions   !== undefined ? { pollOptions }                        : {}),
        ...(notes         !== undefined ? { notes }                              : {}),
        ...(bandId        !== undefined ? { bandId }                             : {}),
        ...(albumId       !== undefined ? { albumId }                            : {}),
        ...(songId        !== undefined ? { songId }                             : {}),
        ...(seriesId      !== undefined ? { seriesId }                           : {}),
        ...(plannedAt     !== undefined ? { plannedAt:  plannedAt  ? new Date(plannedAt)  : null } : {}),
        ...(postedAt      !== undefined ? { postedAt:   postedAt   ? new Date(postedAt)   : null } : {}),
        ...(postUrl       !== undefined ? { postUrl }                            : {}),
        ...(generatedBody !== undefined ? { generatedBody }                      : {}),
        ...(aiPromptUsed  !== undefined ? { aiPromptUsed }                       : {}),
      },
    });
    res.json(post);
  } catch (e) { next(e); }
});

socialPlannerRouter.patch('/posts/:id/status', async (req, res, next): Promise<void> => {
  try {
    const { status } = req.body as { status: PostStatus };
    const post = await prisma.socialPost.update({
      where: { id: req.params['id']! },
      data: { status },
    });
    res.json(post);
  } catch (e) { next(e); }
});

socialPlannerRouter.delete('/posts/:id', async (req, res, next): Promise<void> => {
  try {
    await prisma.socialPost.delete({ where: { id: req.params['id']! } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Calendar view
// ---------------------------------------------------------------------------

socialPlannerRouter.get('/calendar', async (req, res, next): Promise<void> => {
  try {
    const { month } = req.query as { month?: string };
    const [y, m] = (month ?? '').split('-').map(Number);
    const year  = y || new Date().getFullYear();
    const mon   = m || new Date().getMonth() + 1;
    const start = new Date(year, mon - 1, 1);
    const end   = new Date(year, mon, 1);

    const posts = await prisma.socialPost.findMany({
      where: { plannedAt: { gte: start, lt: end } },
      select: {
        id: true, title: true, status: true, postType: true,
        platforms: true, plannedAt: true,
        band: { select: { id: true, name: true } },
      },
      orderBy: { plannedAt: 'asc' },
    });
    res.json(posts);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Metrics (upsert)
// ---------------------------------------------------------------------------

socialPlannerRouter.put('/posts/:id/metrics', async (req, res, next): Promise<void> => {
  try {
    const postId = req.params['id']!;
    const {
      likes, comments, shares, saves, reach, views,
      groupPostedTo, notes, bestComments, futureIdeas,
    } = req.body as {
      likes?: number; comments?: number; shares?: number; saves?: number;
      reach?: number; views?: number; groupPostedTo?: string; notes?: string;
      bestComments?: string[]; futureIdeas?: string[];
    };

    const data = {
      likes:         likes         ?? 0,
      comments:      comments      ?? 0,
      shares:        shares        ?? 0,
      saves:         saves         ?? 0,
      reach:         reach         ?? 0,
      views:         views         ?? 0,
      groupPostedTo: groupPostedTo ?? null,
      notes:         notes         ?? null,
      bestComments:  bestComments  ?? [],
      futureIdeas:   futureIdeas   ?? [],
    };

    const metric = await prisma.postMetric.upsert({
      where: { postId },
      create: { postId, ...data },
      update: data,
    });
    res.json(metric);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

socialPlannerRouter.post('/posts/:id/assets', async (req, res, next): Promise<void> => {
  try {
    const {
      assetType, label, url, canvaDesignUrl, exportedPath, imagePrompt, canvaPrompt, notes,
    } = req.body as {
      assetType: AssetType; label?: string; url?: string; canvaDesignUrl?: string;
      exportedPath?: string; imagePrompt?: string; canvaPrompt?: string; notes?: string;
    };

    const asset = await prisma.mediaAsset.create({
      data: {
        postId: req.params['id']!,
        assetType,
        label:         label         ?? null,
        url:           url           ?? null,
        canvaDesignUrl: canvaDesignUrl ?? null,
        exportedPath:  exportedPath  ?? null,
        imagePrompt:   imagePrompt   ?? null,
        canvaPrompt:   canvaPrompt   ?? null,
        notes:         notes         ?? null,
      },
    });
    res.status(201).json(asset);
  } catch (e) { next(e); }
});

socialPlannerRouter.delete('/assets/:id', async (req, res, next): Promise<void> => {
  try {
    await prisma.mediaAsset.delete({ where: { id: req.params['id']! } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

socialPlannerRouter.get('/series', async (_req, res, next): Promise<void> => {
  try {
    const series = await prisma.contentSeries.findMany({
      include: {
        band: { select: { id: true, name: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(series);
  } catch (e) { next(e); }
});

socialPlannerRouter.post('/series', async (req, res, next): Promise<void> => {
  try {
    const {
      name, description, tone, visualStyleNotes, defaultCaptionStyle,
      hashtagSet, examplePrompts, bandId,
    } = req.body as {
      name: string; description?: string; tone?: string; visualStyleNotes?: string;
      defaultCaptionStyle?: string; hashtagSet?: string[]; examplePrompts?: string[];
      bandId?: string;
    };

    const s = await prisma.contentSeries.create({
      data: {
        name,
        description:        description        ?? null,
        tone:               tone               ?? null,
        visualStyleNotes:   visualStyleNotes   ?? null,
        defaultCaptionStyle: defaultCaptionStyle ?? null,
        hashtagSet:          hashtagSet         ?? [],
        examplePrompts:      examplePrompts     ?? [],
        bandId:              bandId             ?? null,
      },
    });
    res.status(201).json(s);
  } catch (e) { next(e); }
});

socialPlannerRouter.put('/series/:id', async (req, res, next): Promise<void> => {
  try {
    const {
      name, description, tone, visualStyleNotes, defaultCaptionStyle,
      hashtagSet, examplePrompts, bandId,
    } = req.body as {
      name?: string; description?: string | null; tone?: string | null;
      visualStyleNotes?: string | null; defaultCaptionStyle?: string | null;
      hashtagSet?: string[]; examplePrompts?: string[]; bandId?: string | null;
    };

    const s = await prisma.contentSeries.update({
      where: { id: req.params['id']! },
      data: {
        ...(name               !== undefined ? { name }               : {}),
        ...(description        !== undefined ? { description }        : {}),
        ...(tone               !== undefined ? { tone }               : {}),
        ...(visualStyleNotes   !== undefined ? { visualStyleNotes }   : {}),
        ...(defaultCaptionStyle !== undefined ? { defaultCaptionStyle } : {}),
        ...(hashtagSet         !== undefined ? { hashtagSet }         : {}),
        ...(examplePrompts     !== undefined ? { examplePrompts }     : {}),
        ...(bandId             !== undefined ? { bandId }             : {}),
      },
    });
    res.json(s);
  } catch (e) { next(e); }
});

socialPlannerRouter.delete('/series/:id', async (req, res, next): Promise<void> => {
  try {
    await prisma.contentSeries.delete({ where: { id: req.params['id']! } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

socialPlannerRouter.get('/prompts', async (req, res, next): Promise<void> => {
  try {
    const { category } = req.query as { category?: string };
    const prompts = await prisma.promptTemplate.findMany({
      where: category ? { category: category as PromptCategory } : {},
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json(prompts);
  } catch (e) { next(e); }
});

socialPlannerRouter.post('/prompts', async (req, res, next): Promise<void> => {
  try {
    const { name, category, prompt, description, tags } = req.body as {
      name: string; category: PromptCategory; prompt: string;
      description?: string; tags?: string[];
    };
    const p = await prisma.promptTemplate.create({
      data: {
        name, category, prompt,
        description: description ?? null,
        tags:        tags        ?? [],
      },
    });
    res.status(201).json(p);
  } catch (e) { next(e); }
});

socialPlannerRouter.put('/prompts/:id', async (req, res, next): Promise<void> => {
  try {
    const { name, category, prompt, description, tags } = req.body as {
      name?: string; category?: PromptCategory; prompt?: string;
      description?: string | null; tags?: string[];
    };
    const p = await prisma.promptTemplate.update({
      where: { id: req.params['id']! },
      data: {
        ...(name        !== undefined ? { name }        : {}),
        ...(category    !== undefined ? { category }    : {}),
        ...(prompt      !== undefined ? { prompt }      : {}),
        ...(description !== undefined ? { description } : {}),
        ...(tags        !== undefined ? { tags }        : {}),
      },
    });
    res.json(p);
  } catch (e) { next(e); }
});

socialPlannerRouter.delete('/prompts/:id', async (req, res, next): Promise<void> => {
  try {
    await prisma.promptTemplate.delete({ where: { id: req.params['id']! } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Comment mining
// ---------------------------------------------------------------------------

socialPlannerRouter.get('/comments', async (_req, res, next): Promise<void> => {
  try {
    const insights = await prisma.commentInsight.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(insights);
  } catch (e) { next(e); }
});

socialPlannerRouter.post('/comments/analyze', async (req, res, next): Promise<void> => {
  try {
    const { rawComments, bandId, sourceUrl } = req.body as {
      rawComments: string; bandId?: string; sourceUrl?: string;
    };

    if (!rawComments?.trim()) {
      res.status(400).json({ error: 'rawComments is required' });
      return;
    }

    let bandName: string | undefined;
    if (bandId) {
      const band = await prisma.band.findUnique({ where: { id: bandId }, select: { name: true } });
      bandName = band?.name ?? undefined;
    }

    const result = await mineComments(rawComments, bandName);

    const insight = await prisma.commentInsight.create({
      data: {
        rawComments,
        bandId:          bandId    ?? null,
        sourceUrl:       sourceUrl ?? null,
        suggestedLyrics: result.suggestedLyrics,
        recurringThemes: result.recurringThemes,
        fanPhrasing:     result.fanPhrasing,
        futurePostIdeas: result.futurePostIdeas,
        pollQuestions:   result.pollQuestions,
        corrections:     result.corrections,
        engagementNotes: result.engagementNotes,
      },
    });
    res.status(201).json(insight);
  } catch (e) { next(e); }
});

socialPlannerRouter.delete('/comments/:id', async (req, res, next): Promise<void> => {
  try {
    await prisma.commentInsight.delete({ where: { id: req.params['id']! } });
    res.status(204).end();
  } catch (e) { next(e); }
});
