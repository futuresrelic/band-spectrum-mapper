// MusicBrainz REST API client
// Rate limit: max 1 request/second per their policy.
// All responses are JSON (fmt=json param).

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'BandSpectrumMapper/1.0 (band-spectrum-mapper)';
const REQUEST_TIMEOUT_MS = 10_000;

let lastRequestAt = 0;

async function mbFetch(path: string): Promise<unknown> {
  // Enforce 1-second gap between requests
  const gap = Date.now() - lastRequestAt;
  if (gap < 1100) await new Promise((r) => setTimeout(r, 1100 - gap));
  lastRequestAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MusicBrainz responded ${res.status} for ${path}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MbArtist {
  id: string;
  name: string;
  sortName: string;
  disambiguation: string;
  country: string | null;
  type: string | null;
}

export interface MbReleaseGroup {
  id: string;
  title: string;
  year: number | null;
  primaryType: string;
}

export interface MbTrack {
  number: number;
  title: string;
  durationMs: number | null;
}

export interface MbRelease {
  releaseGroupId: string;
  title: string;
  year: number | null;
  tracks: MbTrack[];
}

// ---------------------------------------------------------------------------
// Search artists
// ---------------------------------------------------------------------------

export async function searchArtists(query: string): Promise<MbArtist[]> {
  const q = encodeURIComponent(query.trim());
  const raw = await mbFetch(`/artist?query=${q}&limit=10&fmt=json`) as {
    artists?: {
      id: string;
      name: string;
      'sort-name': string;
      disambiguation?: string;
      country?: string;
      type?: string;
    }[];
  };

  return (raw.artists ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    sortName: a['sort-name'],
    disambiguation: a.disambiguation ?? '',
    country: a.country ?? null,
    type: a.type ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Get studio albums (release-groups) for an artist
// ---------------------------------------------------------------------------

export async function getArtistAlbums(artistMbId: string): Promise<MbReleaseGroup[]> {
  const raw = await mbFetch(
    `/release-group?artist=${artistMbId}&type=album&limit=100&fmt=json`,
  ) as {
    'release-groups'?: {
      id: string;
      title: string;
      'first-release-date'?: string;
      'primary-type'?: string;
      'secondary-types'?: string[];
    }[];
  };

  const groups = raw['release-groups'] ?? [];

  return groups
    .filter((rg) => {
      // Skip compilations, live albums, soundtracks at the secondary type level
      const sec = rg['secondary-types'] ?? [];
      return !sec.some((t) => ['Compilation', 'Live', 'Demo', 'Soundtrack', 'Mixtape/Street'].includes(t));
    })
    .map((rg) => ({
      id: rg.id,
      title: rg.title,
      year: rg['first-release-date'] ? parseInt(rg['first-release-date'].slice(0, 4), 10) || null : null,
      primaryType: rg['primary-type'] ?? 'Album',
    }))
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}

// ---------------------------------------------------------------------------
// Get tracks for a release-group (picks the earliest/canonical release)
// ---------------------------------------------------------------------------

export async function getReleaseGroupTracks(releaseGroupId: string): Promise<MbRelease | null> {
  // Step 1: get releases in the group
  const relRaw = await mbFetch(
    `/release?release-group=${releaseGroupId}&limit=10&fmt=json`,
  ) as {
    releases?: { id: string; title: string; date?: string }[];
  };

  const releases = relRaw.releases ?? [];
  if (releases.length === 0) return null;

  // Pick the earliest release by date
  const sorted = [...releases].sort((a, b) => {
    const da = a.date ?? '9999';
    const db = b.date ?? '9999';
    return da.localeCompare(db);
  });
  const pick = sorted[0]!;

  // Step 2: fetch that release with recordings (tracks)
  const detailRaw = await mbFetch(`/release/${pick.id}?inc=recordings&fmt=json`) as {
    title: string;
    date?: string;
    media?: {
      tracks?: {
        number: string;
        title: string;
        length?: number | null;
      }[];
    }[];
  };

  const allTracks: MbTrack[] = [];
  let trackNum = 1;
  for (const medium of detailRaw.media ?? []) {
    for (const t of medium.tracks ?? []) {
      allTracks.push({
        number: parseInt(t.number, 10) || trackNum,
        title: t.title,
        durationMs: t.length ?? null,
      });
      trackNum++;
    }
  }

  const year = pick.date ? parseInt(pick.date.slice(0, 4), 10) || null : null;

  return {
    releaseGroupId,
    title: detailRaw.title,
    year,
    tracks: allTracks,
  };
}

// ---------------------------------------------------------------------------
// Batch: fetch tracks for multiple release-groups sequentially (rate-limited)
// ---------------------------------------------------------------------------

export async function batchGetReleaseGroupTracks(
  releaseGroupIds: string[],
): Promise<Map<string, MbRelease | null>> {
  const result = new Map<string, MbRelease | null>();
  for (const id of releaseGroupIds) {
    result.set(id, await getReleaseGroupTracks(id));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Release options — list all releases for a release-group (lightweight, no recordings)
// ---------------------------------------------------------------------------

export interface MbReleaseOption {
  id: string;
  title: string;
  date: string | null;
  country: string | null;
  status: string | null;
  formats: string[];
  trackCount: number;
}

async function getReleaseOptions(releaseGroupId: string): Promise<MbReleaseOption[]> {
  const raw = await mbFetch(
    `/release?release-group=${releaseGroupId}&limit=25&inc=media&fmt=json`,
  ) as {
    releases?: {
      id: string;
      title: string;
      date?: string;
      country?: string;
      status?: string;
      media?: { format?: string; 'track-count'?: number }[];
    }[];
  };

  return (raw.releases ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date ?? null,
    country: r.country ?? null,
    status: r.status ?? null,
    formats: (r.media ?? []).map((m) => m.format ?? 'Unknown'),
    trackCount: (r.media ?? []).reduce((sum, m) => sum + (m['track-count'] ?? 0), 0),
  }));
}

async function getTracksByReleaseId(releaseId: string, releaseGroupId: string): Promise<MbRelease | null> {
  const detailRaw = await mbFetch(`/release/${releaseId}?inc=recordings&fmt=json`) as {
    title: string;
    date?: string;
    media?: {
      tracks?: { number: string; title: string; length?: number | null }[];
    }[];
  };

  const allTracks: MbTrack[] = [];
  let trackNum = 1;
  for (const medium of detailRaw.media ?? []) {
    for (const t of medium.tracks ?? []) {
      allTracks.push({
        number: parseInt(t.number, 10) || trackNum,
        title: t.title,
        durationMs: t.length ?? null,
      });
      trackNum++;
    }
  }

  const year = detailRaw.date ? parseInt(detailRaw.date.slice(0, 4), 10) || null : null;
  return { releaseGroupId, title: detailRaw.title, year, tracks: allTracks };
}

export async function batchGetReleaseOptions(
  releaseGroupIds: string[],
): Promise<Map<string, MbReleaseOption[]>> {
  const result = new Map<string, MbReleaseOption[]>();
  for (const id of releaseGroupIds) {
    result.set(id, await getReleaseOptions(id));
  }
  return result;
}

export async function batchGetTracksByRelease(
  items: { releaseGroupId: string; releaseId: string }[],
): Promise<Map<string, MbRelease | null>> {
  const result = new Map<string, MbRelease | null>();
  for (const { releaseGroupId, releaseId } of items) {
    result.set(releaseGroupId, await getTracksByReleaseId(releaseId, releaseGroupId));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Search for a recording's duration by song title + artist name.
// Returns duration in seconds, or null if not found.
// ---------------------------------------------------------------------------

export async function searchRecordingDuration(songTitle: string, artistName: string): Promise<number | null> {
  try {
    const q = encodeURIComponent(`recording:"${songTitle.trim()}" AND artist:"${artistName.trim()}"`);
    const raw = await mbFetch(`/recording?query=${q}&limit=5&fmt=json`) as {
      recordings?: { title: string; length?: number | null }[];
    };
    for (const rec of raw.recordings ?? []) {
      if (rec.length && rec.length > 0) return Math.round(rec.length / 1000);
    }
    return null;
  } catch {
    return null;
  }
}
