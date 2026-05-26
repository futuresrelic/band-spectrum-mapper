import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

// Mounted at /api/songs/:songId/tag-proposals (mergeParams so :songId is visible)
export const tagProposalsRouter = Router({ mergeParams: true });

const PROMOTE_THRESHOLD = 2; // net upvotes needed to promote to official SongTag

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function scoreOf(votes: { vote: number }[]): number {
  return votes.reduce((s, v) => s + v.vote, 0);
}

type ProposalWithVotesAndUser = {
  id: string;
  tagName: string;
  slug: string;
  status: string;
  votes: { vote: number }[];
  user: { name: string | null; username: string | null };
  createdAt?: Date;
};

function formatProposal(p: ProposalWithVotesAndUser) {
  return {
    id: p.id,
    tagName: p.tagName,
    slug: p.slug,
    status: p.status,
    score: scoreOf(p.votes),
    voteCount: p.votes.length,
    proposedBy: p.user.username ?? p.user.name ?? 'Anonymous',
    ...(p.createdAt ? { createdAt: p.createdAt.toISOString() } : {}),
  };
}

// POST / — propose a tag (auth required)
tagProposalsRouter.post('/', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const { songId } = req.params as { songId: string };
    const { tagName } = req.body as { tagName?: string };
    if (!tagName?.trim()) {
      res.status(400).json({ error: 'tagName is required' }); return;
    }
    const name = tagName.toLowerCase().trim();
    if (name.length > 40) {
      res.status(400).json({ error: 'Tag name must be 40 characters or fewer' }); return;
    }
    const slug = slugify(name);
    if (!slug) {
      res.status(400).json({ error: 'Invalid tag name' }); return;
    }

    const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
    if (!song) throw new HttpError(404, 'Song not found');

    // Block if the tag is already official on this song
    const existingTag = await prisma.tag.findUnique({ where: { slug } });
    if (existingTag) {
      const alreadyLinked = await prisma.songTag.findUnique({
        where: { songId_tagId: { songId, tagId: existingTag.id } },
      });
      if (alreadyLinked) {
        res.status(409).json({ error: 'This tag already exists for this song' }); return;
      }
    }

    const proposal = await prisma.tagProposal.upsert({
      where: { songId_slug: { songId, slug } },
      create: { songId, tagName: name, slug, userId: req.user!.userId },
      update: {},
      include: {
        votes: { select: { vote: true } },
        user: { select: { name: true, username: true } },
      },
    });

    res.status(201).json(formatProposal(proposal)); return;
  } catch (e) { next(e); }
});

// PUT /:id/vote — cast or update a vote (auth required)
tagProposalsRouter.put('/:id/vote', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const { id, songId } = req.params as { id: string; songId: string };
    const { vote } = req.body as { vote?: number };
    if (vote !== 1 && vote !== -1) {
      res.status(400).json({ error: 'vote must be 1 or -1' }); return;
    }

    const proposal = await prisma.tagProposal.findUnique({ where: { id } });
    if (!proposal || proposal.songId !== songId) throw new HttpError(404, 'Proposal not found');
    if (proposal.status === 'rejected') {
      res.status(409).json({ error: 'Cannot vote on a rejected proposal' }); return;
    }

    await prisma.tagVote.upsert({
      where: { proposalId_userId: { proposalId: id, userId: req.user!.userId } },
      create: { proposalId: id, userId: req.user!.userId, vote },
      update: { vote },
    });

    const updated = await prisma.tagProposal.findUnique({
      where: { id },
      include: {
        votes: { select: { vote: true } },
        user: { select: { name: true, username: true } },
      },
    });
    if (!updated) throw new HttpError(404, 'Proposal not found');

    // Auto-promote when net score reaches threshold
    if (scoreOf(updated.votes) >= PROMOTE_THRESHOLD && updated.status === 'pending') {
      const tag = await prisma.tag.upsert({
        where: { slug: updated.slug },
        create: { name: updated.tagName, slug: updated.slug },
        update: {},
      });
      await prisma.songTag.upsert({
        where: { songId_tagId: { songId: updated.songId, tagId: tag.id } },
        create: { songId: updated.songId, tagId: tag.id },
        update: {},
      });
      await prisma.tagProposal.update({ where: { id }, data: { status: 'approved' } });
      updated.status = 'approved';
    }

    res.json(formatProposal(updated)); return;
  } catch (e) { next(e); }
});

// DELETE /:id — delete own proposal (or any if admin)
tagProposalsRouter.delete('/:id', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const { id, songId } = req.params as { id: string; songId: string };
    const proposal = await prisma.tagProposal.findUnique({ where: { id } });
    if (!proposal || proposal.songId !== songId) throw new HttpError(404, 'Proposal not found');
    if (proposal.userId !== req.user!.userId && !req.user!.isAdmin) {
      throw new HttpError(403, 'Not authorised to delete this proposal');
    }
    await prisma.tagProposal.delete({ where: { id } });
    res.status(204).end(); return;
  } catch (e) { next(e); }
});
