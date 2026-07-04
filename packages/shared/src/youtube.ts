// YouTube URL normalization — Phase Z.17.6.
//
// Accepts the four common YouTube URL shapes and reduces them to a single
// canonical 11-character video ID. Rejects everything else, including
// arbitrary embed/iframe URLs from other hosts — Song Card media is
// YouTube-only by design, never a generic embed.

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export interface NormalizedYouTubeVideo {
  videoId: string;
  embedUrl: string;
  watchUrl: string;
  thumbnailUrl: string;
}

function extractId(host: string, pathname: string, searchParams: URLSearchParams): string | null {
  if (host === 'youtu.be') {
    return pathname.slice(1).split('/')[0] || null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    if (pathname === '/watch') return searchParams.get('v');
    if (pathname.startsWith('/embed/')) return pathname.slice('/embed/'.length).split('/')[0] || null;
    if (pathname.startsWith('/shorts/')) return pathname.slice('/shorts/'.length).split('/')[0] || null;
    if (pathname.startsWith('/live/')) return pathname.slice('/live/'.length).split('/')[0] || null;
  }
  return null;
}

/** Returns null for anything that isn't a valid, recognized YouTube video URL. */
export function normalizeYouTubeUrl(input: string): NormalizedYouTubeVideo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const videoId = extractId(host, url.pathname, url.searchParams);
  if (!videoId || !YOUTUBE_ID_RE.test(videoId)) return null;

  return {
    videoId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}
