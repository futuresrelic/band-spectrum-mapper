import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { discographyImportService } from './discographyImportService.js';

const DAILY_TOKEN_LIMIT = 3;
const TOKEN_REFRESH_HOURS = 24;

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export async function getOrRefreshTokens(userId: string): Promise<{ tokens: number; nextRefresh: Date }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lookupTokens: true, tokensLastRefreshed: true },
  });
  if (!user) throw new HttpError(404, 'User not found');

  const hoursSince = (Date.now() - user.tokensLastRefreshed.getTime()) / 3_600_000;
  if (hoursSince >= TOKEN_REFRESH_HOURS) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { lookupTokens: DAILY_TOKEN_LIMIT, tokensLastRefreshed: new Date() },
      select: { lookupTokens: true, tokensLastRefreshed: true },
    });
    const nextRefresh = new Date(updated.tokensLastRefreshed.getTime() + TOKEN_REFRESH_HOURS * 3_600_000);
    return { tokens: updated.lookupTokens, nextRefresh };
  }

  const nextRefresh = new Date(user.tokensLastRefreshed.getTime() + TOKEN_REFRESH_HOURS * 3_600_000);
  return { tokens: user.lookupTokens, nextRefresh };
}

export async function useTokens(userId: string, songCount: number): Promise<void> {
  const { tokens } = await getOrRefreshTokens(userId);
  if (songCount <= 0) return;
  if (tokens <= 0) {
    throw new HttpError(429, 'No song tokens remaining today. You get 3 per day, refreshing every 24 hours.');
  }
  if (tokens < songCount) {
    throw new HttpError(429, `You have ${tokens} song token${tokens !== 1 ? 's' : ''} remaining today but tried to submit ${songCount} song${songCount !== 1 ? 's' : ''}. Each submitted song costs 1 token (3 per day).`);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { lookupTokens: { decrement: songCount } },
  });
}

// ---------------------------------------------------------------------------
// Contribution CRUD
// ---------------------------------------------------------------------------

export interface ContributionData {
  artist: string;
  albums: {
    album_title: string;
    album_slug: string;
    year: number | null;
    tracks: { track_number: number; song_title: string; song_slug: string }[];
  }[];
}

export async function submitContribution(
  userId: string,
  artistName: string,
  artistMbId: string,
  data: ContributionData,
): Promise<{ id: string }> {
  const contribution = await prisma.pendingContribution.create({
    data: {
      userId,
      artistName,
      artistMbId,
      albumCount: data.albums.length,
      data: data as object,
    },
    select: { id: true },
  });
  return contribution;
}

export async function listContributions(opts: { status?: string; userId?: string } = {}) {
  return prisma.pendingContribution.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    include: {
      user: { select: { name: true, email: true } },
      reviewer: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function approveContribution(contributionId: string, adminId: string) {
  const contribution = await prisma.pendingContribution.findUnique({
    where: { id: contributionId },
  });
  if (!contribution) throw new HttpError(404, 'Contribution not found');
  if (contribution.status !== 'pending') throw new HttpError(400, 'Contribution is not pending');

  // Run the discography import (dry-run=false)
  const result = await discographyImportService.run(contribution.data, false);

  await prisma.pendingContribution.update({
    where: { id: contributionId },
    data: { status: 'approved', reviewedById: adminId, reviewedAt: new Date() },
  });

  return result;
}

export async function rejectContribution(contributionId: string, adminId: string, note?: string) {
  const contribution = await prisma.pendingContribution.findUnique({
    where: { id: contributionId },
  });
  if (!contribution) throw new HttpError(404, 'Contribution not found');
  if (contribution.status !== 'pending') throw new HttpError(400, 'Contribution is not pending');

  await prisma.pendingContribution.update({
    where: { id: contributionId },
    data: {
      status: 'rejected',
      adminNote: note ?? null,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  });
}
