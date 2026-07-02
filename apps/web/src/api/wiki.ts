// Music Wiki API client — types and fetch helpers.

export type WikiBand = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
};

export type WikiAlbumSummary = {
  id: string;
  title: string;
  slug: string;
  year: number | null;
  albumType: string | null;
  artworkUrl: string | null;
  _count: { songs: number };
};

export type WikiSongSummary = {
  id: string;
  title: string;
  slug: string;
  rarity: string;
  band: { slug: string; name: string };
  album: { slug: string; title: string; year: number | null } | null;
};

export type WikiMember = {
  id: string;
  name: string;
  role: string | null;
  bandId: string;
  visualNotes: string | null;
};

export type WikiSongProfile = {
  totalPerformances: number;
  liveStatus: string;
  rarityIndex: number;
  performancePct: number;
  firstPerformanceDate: string | null;
  lastPerformanceDate: string | null;
  yearsSincePlayed: number | null;
  distinctYears: number;
  liveValue: number;
};

export type WikiAxisScore = {
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
  notes: string | null;
};

// ── Search ────────────────────────────────────────────────────────────────────

export type WikiSearchResult = {
  bands: WikiBand[];
  albums: Array<WikiAlbumSummary & { band: { slug: string; name: string } }>;
  songs: WikiSongSummary[];
};

export async function wikiSearch(q: string, limit = 10): Promise<WikiSearchResult> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(`/api/wiki/search?${params}`);
  if (!res.ok) throw new Error('Wiki search failed');
  return res.json() as Promise<WikiSearchResult>;
}

// ── Band page ─────────────────────────────────────────────────────────────────

export type WikiTopPlayed = {
  totalPerformances: number;
  liveStatus: string;
  song: { id: string; title: string; slug: string; rarity: string; album: { title: string; slug: string } | null };
};

export type WikiBandPageData = {
  band: WikiBand & {
    members: WikiMember[];
    albums: WikiAlbumSummary[];
    liveDataCache: {
      fetchStatus: string;
      fetchedShows: number;
      totalShows: number;
      lastFetchedAt: string | null;
    } | null;
    _count: { songs: number; albums: number };
  };
  topPlayed: WikiTopPlayed[];
  rarestPlayed: Array<{
    rarityIndex: number;
    liveStatus: string;
    song: { id: string; title: string; slug: string; album: { title: string; slug: string } | null };
  }>;
};

export async function getWikiBand(slug: string): Promise<WikiBandPageData> {
  const res = await fetch(`/api/wiki/bands/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error('Band not found');
  return res.json() as Promise<WikiBandPageData>;
}

// ── Album page ────────────────────────────────────────────────────────────────

export type WikiAlbumSong = {
  id: string;
  title: string;
  slug: string;
  trackNumber: number | null;
  durationSeconds: number | null;
  isInstrumental: boolean;
  rarity: string;
  score: WikiAxisScore | null;
  bandRpgProfile: {
    totalPerformances: number;
    liveStatus: string;
    rarityIndex: number;
  } | null;
};

export type WikiAlbumPageData = {
  band: { id: string; name: string; slug: string };
  album: {
    id: string;
    title: string;
    slug: string;
    year: number | null;
    albumType: string | null;
    artworkUrl: string | null;
    notes: string | null;
    songs: WikiAlbumSong[];
  };
  avgSpectrum: WikiAxisScore | null;
  rarityBreakdown: Record<string, number>;
};

export async function getWikiAlbum(bandSlug: string, albumSlug: string): Promise<WikiAlbumPageData> {
  const res = await fetch(`/api/wiki/albums/${encodeURIComponent(bandSlug)}/${encodeURIComponent(albumSlug)}`);
  if (!res.ok) throw new Error('Album not found');
  return res.json() as Promise<WikiAlbumPageData>;
}

// ── Song page ─────────────────────────────────────────────────────────────────

export type WikiSongPageData = {
  song: {
    id: string;
    title: string;
    slug: string;
    rarity: string;
    isInstrumental: boolean;
    isRemix: boolean;
    durationSeconds: number | null;
    notes: string | null;
    band: { id: string; name: string; slug: string };
    album: { id: string; title: string; slug: string; year: number | null; artworkUrl: string | null } | null;
    score: WikiAxisScore | null;
    bandRpgProfile: WikiSongProfile | null;
    lyrics: Array<{ id: string; sourceType: string; sourceLabel: string | null; text: string }>;
    _count: { ratings: number };
  };
  collectedCount: number;
  albumSiblings: Array<{ id: string; title: string; slug: string; trackNumber: number | null }>;
};

export async function getWikiSong(songId: string): Promise<WikiSongPageData> {
  const res = await fetch(`/api/wiki/songs/${encodeURIComponent(songId)}`);
  if (!res.ok) throw new Error('Song not found');
  return res.json() as Promise<WikiSongPageData>;
}

// ── Artist page ───────────────────────────────────────────────────────────────

export type WikiArtistPageData = {
  member: WikiMember & {
    band: WikiBand & {
      albums: WikiAlbumSummary[];
      _count: { songs: number };
    };
  };
};

export async function getWikiArtist(memberId: string): Promise<WikiArtistPageData> {
  const res = await fetch(`/api/wiki/artists/${encodeURIComponent(memberId)}`);
  if (!res.ok) throw new Error('Artist not found');
  return res.json() as Promise<WikiArtistPageData>;
}
