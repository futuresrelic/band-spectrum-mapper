import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import AlbumRadarCycler from '../components/AlbumRadarCycler';

type AlbumInfo = {
  id: string;
  title: string;
  year: number | null;
  artworkUrl: string | null;
  band: { name: string; slug: string };
};

type AlbumSpectrumResponse = {
  album: AlbumInfo;
  songs: { id: string; ratingCount: number }[];
};

export default function ShareAlbumPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['album-spectrum', albumId],
    queryFn: () => api.get<AlbumSpectrumResponse>(`/api/public/albums/${albumId!}/spectrum`),
    enabled: !!albumId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const album      = data?.album;
  const songCount  = data?.songs.length ?? 0;
  const shareUrl   = typeof window !== 'undefined' ? window.location.href : '';

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable */ }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  if (isError || !album) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center px-6">
        <p className="text-slate-400 text-lg mb-4">Album not found.</p>
        <Link to="/view" className="text-indigo-400 hover:text-indigo-300 text-sm hover:underline">
          ← Browse library
        </Link>
      </div>
    );
  }

  const shareText = `${album.title} by ${album.band.name}${album.year ? ` (${album.year})` : ''} — interactive spectrum analysis for all ${songCount} songs`;
  const enc        = (s: string) => encodeURIComponent(s);
  const tweetUrl   = `https://x.com/intent/tweet?text=${enc(shareText)}&url=${enc(shareUrl)}`;
  const redditUrl  = `https://www.reddit.com/submit?url=${enc(shareUrl)}&title=${enc(shareText)}`;
  const blueskyUrl = `https://bsky.app/intent/compose?text=${enc(shareText + ' ' + shareUrl)}`;
  const whatsappUrl = `https://wa.me/?text=${enc(shareText + ' ' + shareUrl)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}`;

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Top bar */}
      <div className="max-w-lg mx-auto px-4 pt-8 pb-2 flex items-center justify-between">
        <Link
          to="/"
          className="text-xs font-bold tracking-widest text-slate-500 hover:text-slate-300 uppercase transition-colors"
        >
          Band Spectrum Mapper
        </Link>
        <Link
          to={`/view/${album.band.slug}`}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Browse library →
        </Link>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Album header */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden mb-4">
          {/* Artwork hero — full-width when present */}
          {album.artworkUrl && (
            <div className="relative">
              <img
                src={album.artworkUrl}
                alt={`${album.title} album art`}
                className="w-full aspect-square object-cover"
              />
              {/* Gradient overlay so text is readable if we ever overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent pointer-events-none" />
            </div>
          )}

          <div className="px-7 pt-6 pb-6 border-b border-slate-800">
            {/* Art + text side-by-side when no hero (no artworkUrl) */}
            {!album.artworkUrl && (
              <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center mb-4 shrink-0">
                <span className="text-2xl font-bold text-slate-600 select-none">
                  {album.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1 font-medium">
              {album.band.name}
            </p>
            <h1 className="text-3xl font-bold tracking-tight leading-tight">{album.title}</h1>
            {album.year && (
              <p className="text-slate-400 text-sm mt-1">{album.year}</p>
            )}
            <p className="text-xs text-slate-600 mt-2">
              {songCount} song{songCount !== 1 ? 's' : ''} · cycle through each one to compare spectrums
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Use the slider or ▶ Play to cycle through every song. Switch between{' '}
              <strong className="text-slate-500">Core</strong>,{' '}
              <strong className="text-slate-500">AI</strong>, and{' '}
              <strong className="text-slate-500">Community</strong> to compare how scores differ.
              Missing data? Click <span className="text-indigo-500">Rate →</span> to be the first.
            </p>
          </div>
        </div>

        {/* Album cycler widget */}
        {albumId && (
          <AlbumRadarCycler
            albumId={albumId}
            bandSlug={album.band.slug}
            radarSize={280}
          />
        )}

        {/* Share actions */}
        <div className="mt-5 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={copyUrl}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
            >
              {copied ? '✓ Copied!' : '🔗 Copy link'}
            </button>
            <Link
              to={`/view/${album.band.slug}`}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
            >
              Full library →
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { href: tweetUrl,    label: 'X / Twitter' },
              { href: redditUrl,   label: 'Reddit' },
              { href: blueskyUrl,  label: 'Bluesky' },
              { href: whatsappUrl, label: 'WhatsApp' },
              { href: facebookUrl, label: 'Facebook' },
            ].map(({ href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium px-3 py-2.5 rounded-lg transition-colors"
              >
                {label}
              </a>
            ))}
          </div>

          <p className="text-center text-[11px] text-slate-600">
            Instagram: copy the link and paste into your story or caption
          </p>
        </div>

        <p className="text-center text-xs text-slate-700 mt-4">
          Screenshot this card to share as an image
        </p>
      </div>
    </div>
  );
}
