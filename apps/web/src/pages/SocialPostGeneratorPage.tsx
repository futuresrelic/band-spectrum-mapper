import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { bandsApi } from '../api/bands';
import SocialChatPanel from '../components/social/SocialChatPanel';
import SocialExportPanel from '../components/social/SocialExportPanel';
import type { Band, Song, Album } from '@band-spectrum-mapper/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostVariant {
  body: string;
  hashtags: string[];
  cta: string;
  pollOptions?: string[];
}

// ---------------------------------------------------------------------------
// Selector configs
// ---------------------------------------------------------------------------

const PLATFORMS = [
  { id: 'facebook',  label: 'Facebook', emoji: '📘', note: 'Groups & pages' },
  { id: 'instagram', label: 'Instagram', emoji: '📷', note: 'Feed & Reels' },
  { id: 'threads',   label: 'Threads',   emoji: '🧵', note: 'Conversations' },
  { id: 'reddit',    label: 'Reddit',    emoji: '🤖', note: 'Music subreddits' },
  { id: 'tiktok',    label: 'TikTok',    emoji: '🎵', note: 'Video captions' },
];

const POST_TYPES = [
  { id: 'radar_analysis', label: 'Radar Analysis',  description: 'Make the spectrum data visceral' },
  { id: 'emotional',      label: 'Emotional Map',   description: 'What emotional states this creates' },
  { id: 'philosophy',     label: 'Philosophy Post', description: 'The ideas and consciousness this maps to' },
  { id: 'poll',           label: 'Poll',            description: 'Engaging audience-choice questions' },
  { id: 'entry_point',    label: 'Entry Point',     description: '"Perfect for fans of X" framing' },
  { id: 'discussion',     label: 'Discussion Bait', description: 'Open question that has no obvious answer' },
  { id: 'meme',           label: 'Observational',   description: 'Self-aware music nerd energy' },
  { id: 'compare',        label: 'Compare',         description: 'This song vs. something familiar' },
];

const TONES = [
  { id: 'cinematic',      label: 'Cinematic',      description: 'Atmospheric, evocative, poetic' },
  { id: 'analytical',     label: 'Analytical',     description: 'Data-driven but emotionally grounded' },
  { id: 'conversational', label: 'Conversational', description: 'Natural, like a thoughtful friend' },
  { id: 'provocative',    label: 'Provocative',    description: 'Bold opinion, slight edge, confident' },
];

const POST_SIZES = [
  { id: 'single_line', label: 'Single line',   sub: '1–2 sentences' },
  { id: 'short',       label: 'Short',          sub: 'Caption, ~5 sentences' },
  { id: 'paragraph',   label: 'Paragraph',      sub: '~100 words' },
  { id: 'essay',       label: 'Essay',          sub: '200–350 words' },
];

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
        copied
          ? 'bg-green-600/20 text-green-400 border border-green-600/30'
          : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10'
      }`}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Post result card
// ---------------------------------------------------------------------------

function PostCard({ post, index, platform }: { post: PostVariant; index: number; platform: string }) {
  const fullText = [
    post.body,
    post.pollOptions?.length ? '\nPoll options:\n' + post.pollOptions.map((o, i) => `${i + 1}. ${o}`).join('\n') : '',
    post.cta || '',
    post.hashtags.length ? '\n' + post.hashtags.join(' ') : '',
  ].filter(Boolean).join('\n\n').trim();

  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
        <span className="text-xs text-white/40 uppercase tracking-widest">
          {platform.charAt(0).toUpperCase() + platform.slice(1)} · Variant {index + 1}
        </span>
        <CopyButton text={fullText} />
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{post.body}</p>

        {post.pollOptions && post.pollOptions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-white/40 uppercase tracking-widest">Poll options</p>
            {post.pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-white/70">
                <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 text-xs flex items-center justify-center shrink-0">{i + 1}</span>
                {opt}
              </div>
            ))}
          </div>
        )}

        {post.cta && (
          <p className="text-sm text-indigo-300 italic">{post.cta}</p>
        )}

        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.hashtags.map((tag) => (
              <span key={tag} className="text-xs text-indigo-400/70 bg-indigo-900/20 px-2 py-0.5 rounded-full">
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Full copy */}
      <div className="px-5 pb-4">
        <CopyButton text={fullText} />
        <span className="text-xs text-white/25 ml-2">Copy everything</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type GenerateLevel = 'song' | 'album' | 'band';

export default function SocialPostGeneratorPage() {
  const [level,           setLevel]    = useState<GenerateLevel>('song');
  const [selectedBand,    setBand]     = useState('');
  const [selectedAlbumId, setAlbumId]  = useState('');
  const [selectedSongId,  setSongId]   = useState('');
  const [platform,        setPlatform] = useState('facebook');
  const [postType,        setPostType] = useState('radar_analysis');
  const [tone,            setTone]     = useState('cinematic');
  const [postSize,        setPostSize] = useState('paragraph');
  const [variants,        setVariants] = useState(1);

  const { data: bands } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list() as Promise<Band[]>,
  });

  const { data: songs } = useQuery({
    queryKey: ['band-songs', selectedBand],
    queryFn: () => bandsApi.listSongs(selectedBand) as Promise<Song[]>,
    enabled: !!selectedBand,
  });

  const { data: albums } = useQuery({
    queryKey: ['band-albums', selectedBand],
    queryFn: () => bandsApi.listAlbums(selectedBand) as Promise<Album[]>,
    enabled: !!selectedBand && level === 'album',
  });

  const band = bands?.find((b) => b.id === selectedBand);
  const selectedSong = songs?.find((s) => s.id === selectedSongId);
  const selectedAlbum = albums?.find((a) => a.id === selectedAlbumId);

  const chatSongLabel = level === 'song' && selectedSong && band
    ? `${band.name} — ${selectedSong.title}`
    : level === 'album' && selectedAlbum && band
    ? `${band.name} — ${selectedAlbum.title} (album)`
    : level === 'band' && band
    ? `${band.name} (artist)`
    : undefined;

  function buildSubjectId(): Record<string, string> {
    if (level === 'song' && selectedSongId)   return { songId:  selectedSongId };
    if (level === 'album' && selectedAlbumId) return { albumId: selectedAlbumId };
    if (level === 'band' && selectedBand)     return { bandId:  selectedBand };
    return {};
  }

  function canGenerate(): boolean {
    if (level === 'song')  return !!selectedSongId;
    if (level === 'album') return !!selectedAlbumId;
    if (level === 'band')  return !!selectedBand;
    return false;
  }

  const generateMutation = useMutation({
    mutationFn: () => api.post<{ posts: PostVariant[] }>('/api/social/generate', {
      ...buildSubjectId(),
      platform,
      postType,
      tone,
      postSize,
      variants,
    }),
  });

  const posts = generateMutation.data?.posts ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-indigo-500 rounded-full" />
            <h1 className="text-2xl font-bold">Social Post Generator</h1>
          </div>
          <p className="text-white/50 text-sm ml-7">
            AI-crafted content in the Band Spectrum Mapper voice — psychologically intelligent, never generic.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8">

          {/* ── Left: Configuration ── */}
          <div className="space-y-5">

            {/* Subject selection */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Generate for</p>

              {/* Level picker */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['song', 'album', 'band'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => { setLevel(lvl); setSongId(''); setAlbumId(''); }}
                    className={`py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${
                      level === lvl
                        ? 'bg-indigo-600/30 border border-indigo-500/50 text-white'
                        : 'bg-white/5 border border-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    {lvl === 'band' ? 'Artist' : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>

              {/* Band selector — always shown */}
              <div>
                <label className="text-xs text-white/50 mb-1 block">Artist</label>
                <select
                  className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  value={selectedBand}
                  onChange={(e) => { setBand(e.target.value); setSongId(''); setAlbumId(''); }}
                >
                  <option value="">Select a band…</option>
                  {bands?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Album selector */}
              {level === 'album' && selectedBand && (
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Album</label>
                  <select
                    className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    value={selectedAlbumId}
                    onChange={(e) => setAlbumId(e.target.value)}
                  >
                    <option value="">Select an album…</option>
                    {albums?.map((a) => (
                      <option key={a.id} value={a.id}>{a.title}{a.year ? ` (${a.year})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Song selector */}
              {level === 'song' && selectedBand && (
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Song</label>
                  <select
                    className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    value={selectedSongId}
                    onChange={(e) => setSongId(e.target.value)}
                  >
                    <option value="">Select a song…</option>
                    {songs?.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {level === 'band' && selectedBand && (
                <p className="text-xs text-white/30 italic">
                  Will aggregate all {songs?.length ?? '…'} songs across the full discography.
                </p>
              )}
            </div>

            {/* Platform */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Platform</p>
              <div className="space-y-1.5">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                      platform === p.id
                        ? 'bg-indigo-600/25 border border-indigo-500/40 text-white'
                        : 'hover:bg-white/5 text-white/60 border border-transparent'
                    }`}
                  >
                    <span className="text-base">{p.emoji}</span>
                    <span className="font-medium">{p.label}</span>
                    <span className="text-xs opacity-50 ml-auto">{p.note}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Post type */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Post type</p>
              <div className="space-y-1.5">
                {POST_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPostType(t.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      postType === t.id
                        ? 'bg-indigo-600/25 border border-indigo-500/40 text-white'
                        : 'hover:bg-white/5 text-white/60 border border-transparent'
                    }`}
                  >
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs opacity-50 mt-0.5">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Tone */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Tone</p>
              <div className="grid grid-cols-2 gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      tone === t.id
                        ? 'bg-indigo-600/25 border border-indigo-500/40 text-white'
                        : 'hover:bg-white/5 text-white/60 border border-white/8'
                    }`}
                  >
                    <p className="font-medium text-xs">{t.label}</p>
                    <p className="text-xs opacity-50 mt-0.5 leading-tight">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Post size */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Post size</p>
              <div className="grid grid-cols-2 gap-2">
                {POST_SIZES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPostSize(s.id)}
                    className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      postSize === s.id
                        ? 'bg-indigo-600/25 border border-indigo-500/40 text-white'
                        : 'hover:bg-white/5 text-white/60 border border-white/8'
                    }`}
                  >
                    <p className="font-medium text-xs">{s.label}</p>
                    <p className="text-xs opacity-50 mt-0.5">{s.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Variants */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">Variants</p>
                <span className="text-sm font-bold text-indigo-400">{variants}</span>
              </div>
              <input
                type="range" min={1} max={3} step={1}
                value={variants}
                onChange={(e) => setVariants(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <p className="text-xs text-white/30">Generate {variants === 1 ? '1 version' : `${variants} distinct versions`}</p>
            </div>

            {/* Generate button */}
            <button
              onClick={() => generateMutation.mutate()}
              disabled={!canGenerate() || generateMutation.isPending}
              className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
            >
              {generateMutation.isPending ? 'Generating…' : 'Generate posts'}
            </button>

            {generateMutation.isError && (
              <p className="text-xs text-red-400 text-center">
                {(generateMutation.error as Error).message}
              </p>
            )}
          </div>

          {/* ── Right: Results ── */}
          <div className="space-y-5">

            {/* Export panel (shown when a song is selected) */}
            {level === 'song' && selectedSongId && (
              <SocialExportPanel songId={selectedSongId} />
            )}

            {/* Empty state */}
            {!generateMutation.isPending && posts.length === 0 && (
              <div className="rounded-2xl border border-white/8 p-12 text-center space-y-3">
                {!canGenerate() ? (
                  <>
                    <p className="text-white/30 text-4xl">✦</p>
                    <p className="text-white/40 text-sm">Select {level === 'band' ? 'an artist' : level === 'album' ? 'an album' : 'a song'} to begin</p>
                  </>
                ) : (
                  <>
                    <p className="text-white/30 text-4xl">◈</p>
                    <p className="text-white/40 text-sm">Configure and generate your first post</p>
                    <p className="text-white/25 text-xs">The AI uses the song's spectrum scores, genre data, and thematic analysis</p>
                  </>
                )}
              </div>
            )}

            {/* Loading skeleton */}
            {generateMutation.isPending && (
              <div className="space-y-4">
                {Array.from({ length: variants }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/10 bg-white/3 p-5 space-y-3 animate-pulse">
                    <div className="h-3 bg-white/10 rounded w-1/3" />
                    <div className="space-y-2">
                      <div className="h-3 bg-white/8 rounded w-full" />
                      <div className="h-3 bg-white/8 rounded w-4/5" />
                      <div className="h-3 bg-white/8 rounded w-3/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            {posts.map((post, i) => (
              <PostCard key={i} post={post} index={i} platform={platform} />
            ))}

            {/* Regenerate */}
            {posts.length > 0 && (
              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="px-5 py-2 rounded-lg border border-white/15 hover:border-white/30 text-white/60 hover:text-white text-sm transition-colors"
                >
                  Regenerate
                </button>
                <button
                  onClick={() => generateMutation.reset()}
                  className="px-5 py-2 rounded-lg text-white/30 hover:text-white/60 text-sm transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Chat Panel */}
      <SocialChatPanel
        songId={level === 'song' ? (selectedSongId || undefined) : undefined}
        songLabel={chatSongLabel}
      />
    </div>
  );
}
