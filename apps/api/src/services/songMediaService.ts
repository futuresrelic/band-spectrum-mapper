// Song media — the official YouTube video for a song. Admin-curated only.
// Phase Z.17.6.

import { prisma } from '../lib/prisma.js';
import { normalizeYouTubeUrl } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';
import type { UpsertSongMediaInput, PatchSongMediaInput } from '@band-spectrum-mapper/shared';

export const songMediaService = {
  async getBySong(songId: string) {
    return prisma.songMedia.findUnique({ where: { songId } });
  },

  /** Add or replace the video — both are the same operation: upsert with a fresh, validated URL. */
  async upsert(songId: string, data: UpsertSongMediaInput, adminUserId: string) {
    const normalized = normalizeYouTubeUrl(data.url);
    if (!normalized) {
      throw new HttpError(400, 'Not a recognized YouTube URL. Supported: youtube.com/watch, youtu.be, youtube.com/embed, youtube.com/shorts.');
    }
    const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
    if (!song) throw new HttpError(404, 'Song not found');

    return prisma.songMedia.upsert({
      where: { songId },
      create: {
        songId,
        youtubeVideoId: normalized.videoId,
        sourceUrl: data.url.trim(),
        title: data.title ?? null,
        status: 'available',
        addedBy: adminUserId,
      },
      update: {
        youtubeVideoId: normalized.videoId,
        sourceUrl: data.url.trim(),
        title: data.title ?? null,
        status: 'available',
        addedBy: adminUserId,
      },
    });
  },

  /** Edit without replacing the video — flag a review state, or relabel. */
  async patch(songId: string, data: PatchSongMediaInput) {
    const existing = await prisma.songMedia.findUnique({ where: { songId } });
    if (!existing) throw new HttpError(404, 'No media linked to this song yet');

    return prisma.songMedia.update({
      where: { songId },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
      },
    });
  },

  /** Soft delete — keeps the row so "removed deliberately" stays distinct from "never had one." */
  async remove(songId: string) {
    const existing = await prisma.songMedia.findUnique({ where: { songId } });
    if (!existing) throw new HttpError(404, 'No media linked to this song yet');
    return prisma.songMedia.update({ where: { songId }, data: { status: 'removed' } });
  },
};
