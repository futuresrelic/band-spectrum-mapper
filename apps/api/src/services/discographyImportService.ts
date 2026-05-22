import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function coerceInt(v: unknown): number {
  const n = Math.round(Number(v));
  return isNaN(n) ? 0 : Math.min(10, Math.max(0, n));
}

interface TrackInput {
  track_number?: unknown;
  song_title?: unknown;
  song_slug?: unknown;
  duration_seconds?: unknown;
  Aggression?: unknown; aggression?: unknown;
  Complexity?: unknown; complexity?: unknown;
  Atmosphere?: unknown; atmosphere?: unknown;
  Emotion?: unknown;   emotion?: unknown;
  Psychedelic?: unknown; psychedelic?: unknown;
  Concept?: unknown;   concept?: unknown;
}

interface AlbumInput {
  album_title?: unknown;
  album_slug?: unknown;
  year?: unknown;
  tracks?: unknown[];
}

interface DiscographyInput {
  artist?: unknown;
  albums?: unknown[];
}

export interface DiscographyImportRow {
  albumTitle: string;
  trackNumber: number;
  songTitle: string;
  songSlug: string;
  songAction: 'create' | 'existing';
  scoreAction: 'create' | 'update' | 'unchanged';
  scores: {
    aggression: number;
    complexity: number;
    atmosphere: number;
    emotion: number;
    psychedelic: number;
    concept: number;
  };
}

export interface DiscographyImportResult {
  dryRun: boolean;
  band: { name: string; slug: string; action: 'create' | 'existing' };
  totals: {
    albums: { created: number; existing: number };
    songs: { created: number; existing: number };
    scores: { created: number; updated: number; unchanged: number };
  };
  rows: DiscographyImportRow[];
}

function axesFromTrack(track: TrackInput) {
  return {
    aggression: coerceInt(track.Aggression ?? track.aggression),
    complexity: coerceInt(track.Complexity ?? track.complexity),
    atmosphere: coerceInt(track.Atmosphere ?? track.atmosphere),
    emotion: coerceInt(track.Emotion ?? track.emotion),
    psychedelic: coerceInt(track.Psychedelic ?? track.psychedelic),
    concept: coerceInt(track.Concept ?? track.concept),
  };
}

function scoresMatch(
  existing: { aggression: number; complexity: number; atmosphere: number; emotion: number; psychedelic: number; concept: number },
  incoming: ReturnType<typeof axesFromTrack>
): boolean {
  return (
    Math.round(existing.aggression) === incoming.aggression &&
    Math.round(existing.complexity) === incoming.complexity &&
    Math.round(existing.atmosphere) === incoming.atmosphere &&
    Math.round(existing.emotion) === incoming.emotion &&
    Math.round(existing.psychedelic) === incoming.psychedelic &&
    Math.round(existing.concept) === incoming.concept
  );
}

export const discographyImportService = {
  async run(rawPayload: unknown, dryRun: boolean): Promise<DiscographyImportResult> {
    if (typeof rawPayload !== 'object' || rawPayload === null || Array.isArray(rawPayload)) {
      throw new HttpError(400, 'Payload must be a JSON object with artist and albums fields');
    }

    const input = rawPayload as DiscographyInput;
    const artistName = String(input.artist ?? '').trim();
    const albumsArr = Array.isArray(input.albums) ? input.albums : [];

    if (!artistName) throw new HttpError(400, 'artist is required');
    if (!albumsArr.length) throw new HttpError(400, 'albums array must not be empty');

    const bandSlug = slugify(artistName);

    // Load the entire existing band structure in one query so we can diff in memory
    const existingBand = await prisma.band.findUnique({
      where: { slug: bandSlug },
      include: { albums: { include: { songs: { include: { score: true } } } } },
    });

    const bandAction: 'create' | 'existing' = existingBand ? 'existing' : 'create';
    const totals = {
      albums: { created: 0, existing: 0 },
      songs: { created: 0, existing: 0 },
      scores: { created: 0, updated: 0, unchanged: 0 },
    };
    const rows: DiscographyImportRow[] = [];

    // Track band-scoped song slugs already in DB plus slugs assigned during this run
    const takenSlugs = new Set<string>(
      existingBand?.albums.flatMap((a) => a.songs.map((s) => s.slug)) ?? []
    );
    const assignedSlugs = new Set<string>();

    // Upsert the band for real runs; for dry runs use the existing id (or a placeholder)
    let bandId: string = existingBand?.id ?? 'preview-band';
    if (!dryRun) {
      const band = await prisma.band.upsert({
        where: { slug: bandSlug },
        create: { name: artistName, slug: bandSlug },
        update: { name: artistName },
      });
      bandId = band.id;
    }

    for (const rawAlbum of albumsArr) {
      if (typeof rawAlbum !== 'object' || rawAlbum === null) continue;
      const albumIn = rawAlbum as AlbumInput;

      const albumTitle = String(albumIn.album_title ?? '').trim();
      const albumSlug = String(albumIn.album_slug ?? slugify(albumTitle)).trim() || slugify(albumTitle);
      const albumYearRaw = albumIn.year != null ? Math.round(Number(albumIn.year)) : null;
      const albumYear = albumYearRaw && !isNaN(albumYearRaw) ? albumYearRaw : null;
      const tracks = Array.isArray(albumIn.tracks) ? albumIn.tracks : [];

      if (!albumTitle) continue;

      const existingAlbum = existingBand?.albums.find((a) => a.slug === albumSlug) ?? null;
      let albumId: string = existingAlbum?.id ?? '';

      if (existingAlbum) {
        totals.albums.existing++;
        if (!dryRun) {
          await prisma.album.update({
            where: { id: existingAlbum.id },
            data: { title: albumTitle, ...(albumYear != null ? { year: albumYear } : {}) },
          });
        }
      } else {
        totals.albums.created++;
        if (!dryRun) {
          const created = await prisma.album.create({
            data: {
              bandId,
              title: albumTitle,
              slug: albumSlug,
              ...(albumYear != null ? { year: albumYear } : {}),
            },
          });
          albumId = created.id;
        } else {
          albumId = `preview-${albumSlug}`;
        }
      }

      for (const rawTrack of tracks) {
        if (typeof rawTrack !== 'object' || rawTrack === null) continue;
        const track = rawTrack as TrackInput;

        const songTitle = String(track.song_title ?? '').trim();
        const trackNum = track.track_number != null ? Math.round(Number(track.track_number)) : null;
        const durationSecRaw = Number(track.duration_seconds);
        const durationSec = track.duration_seconds != null && !isNaN(durationSecRaw) && durationSecRaw > 0
          ? Math.round(durationSecRaw) : null;
        const proposedSlug = String(track.song_slug ?? slugify(songTitle)).trim() || slugify(songTitle);
        if (!songTitle) continue;

        const newScores = axesFromTrack(track);

        // Match by trackNumber first (most reliable), then fall back to title
        const existingSong =
          existingAlbum?.songs.find((s) => trackNum != null && s.trackNumber === trackNum) ??
          existingAlbum?.songs.find((s) => s.title.toLowerCase() === songTitle.toLowerCase()) ??
          null;

        if (existingSong) {
          totals.songs.existing++;

          let scoreAction: 'create' | 'update' | 'unchanged';
          if (!existingSong.score) {
            scoreAction = 'create';
            totals.scores.created++;
          } else if (scoresMatch(existingSong.score, newScores)) {
            scoreAction = 'unchanged';
            totals.scores.unchanged++;
          } else {
            scoreAction = 'update';
            totals.scores.updated++;
          }

          if (!dryRun && scoreAction !== 'unchanged') {
            await prisma.songAxisScore.upsert({
              where: { songId: existingSong.id },
              create: { songId: existingSong.id, bandId, ...newScores },
              update: newScores,
            });
          }

          if (!dryRun && durationSec !== null && existingSong.durationSeconds === null) {
            await prisma.song.update({ where: { id: existingSong.id }, data: { durationSeconds: durationSec } });
          }

          rows.push({
            albumTitle,
            trackNumber: trackNum ?? 0,
            songTitle,
            songSlug: existingSong.slug,
            songAction: 'existing',
            scoreAction,
            scores: newScores,
          });
        } else {
          // Resolve a band-unique slug — loop until we find a free slot
          let finalSlug = proposedSlug;
          if (takenSlugs.has(finalSlug) || assignedSlugs.has(finalSlug)) {
            finalSlug = `${albumSlug}-${proposedSlug}`;
          }
          if (takenSlugs.has(finalSlug) || assignedSlugs.has(finalSlug)) {
            finalSlug = trackNum != null
              ? `${albumSlug}-${trackNum}-${proposedSlug}`
              : `${albumSlug}-2-${proposedSlug}`;
          }
          let counter = 2;
          while (takenSlugs.has(finalSlug) || assignedSlugs.has(finalSlug)) {
            finalSlug = `${proposedSlug}-${counter}`;
            counter++;
          }
          assignedSlugs.add(finalSlug);

          totals.songs.created++;
          totals.scores.created++;

          if (!dryRun) {
            const song = await prisma.song.create({
              data: {
                bandId,
                ...(albumId ? { albumId } : {}),
                title: songTitle,
                slug: finalSlug,
                ...(trackNum != null ? { trackNumber: trackNum } : {}),
                ...(durationSec !== null ? { durationSeconds: durationSec } : {}),
              },
            });
            await prisma.songAxisScore.create({
              data: { songId: song.id, bandId, ...newScores },
            });
          }

          rows.push({
            albumTitle,
            trackNumber: trackNum ?? 0,
            songTitle,
            songSlug: finalSlug,
            songAction: 'create',
            scoreAction: 'create',
            scores: newScores,
          });
        }
      }
    }

    return {
      dryRun,
      band: { name: artistName, slug: bandSlug, action: bandAction },
      totals,
      rows,
    };
  },
};
