import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { songsApi, lyricsApi } from '../api/songs';
import { albumsApi } from '../api/albums';
import { analysisApi } from '../api/analysis';
import { useAuth } from '../contexts/AuthContext';
import type { Song, SongResearchSource } from '@band-spectrum-mapper/shared';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import EmptyState from '../components/layout/EmptyState';
import CommentSection from '../components/CommentSection';
import SongThemeWidget from '../components/SongThemeWidget';
import type { Lyric, LyricRevision } from '@band-spectrum-mapper/shared';

function LyricEditor({
  lyric,
  onSaved,
}: {
  lyric: Lyric;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(lyric.text);
  const [changeNote, setChangeNote] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);

  const { data: revisions } = useQuery({
    queryKey: ['revisions', lyric.id],
    queryFn: () => lyricsApi.getRevisions(lyric.id),
    enabled: showRevisions,
  });

  const saveMutation = useMutation({
    mutationFn: () => lyricsApi.update(lyric.id, { text, changeNote: changeNote || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', lyric.songId] });
      qc.invalidateQueries({ queryKey: ['revisions', lyric.id] });
      setIsDirty(false);
      setChangeNote('');
      onSaved();
    },
  });

  const setPrimary = useMutation({
    mutationFn: () => lyricsApi.update(lyric.id, { isPrimary: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['song', lyric.songId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => lyricsApi.delete(lyric.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', lyric.songId] });
      onSaved();
    },
  });

  const restoreRevision = useMutation({
    mutationFn: (revisionId: string) => lyricsApi.restoreRevision(lyric.id, revisionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', lyric.songId] });
      qc.invalidateQueries({ queryKey: ['revisions', lyric.id] });
    },
  });

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {lyric.isPrimary && <span className="badge badge-gray">Primary</span>}
          <span className="badge badge-gray">{lyric.sourceType}</span>
          {lyric.sourceLabel && <span className="text-xs text-surface-700">{lyric.sourceLabel}</span>}
        </div>
        <div className="flex gap-2">
          {!lyric.isPrimary && (
            <button className="btn-ghost text-xs" onClick={() => setPrimary.mutate()}>Set as Primary</button>
          )}
          <button className="btn-ghost text-xs" onClick={() => setShowRevisions(!showRevisions)}>
            {showRevisions ? 'Hide History' : 'History'}
          </button>
          <button
            className="btn-ghost text-xs text-red-600"
            onClick={() => { if (confirm('Delete this lyric record?')) deleteMutation.mutate(); }}
          >
            Delete
          </button>
        </div>
      </div>

      <textarea
        className="textarea w-full min-h-[300px]"
        value={text}
        onChange={(e) => { setText(e.target.value); setIsDirty(e.target.value !== lyric.text); }}
      />

      {isDirty && (
        <div className="flex items-center gap-3">
          <input
            className="input flex-1"
            placeholder="Change note (optional)"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
          />
          <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button className="btn-secondary" onClick={() => { setText(lyric.text); setIsDirty(false); }}>
            Revert
          </button>
        </div>
      )}

      {saveMutation.isError && <ErrorMessage error={saveMutation.error} />}

      {showRevisions && revisions && revisions.length > 0 && (
        <div className="border-t border-surface-200 pt-3">
          <h3 className="mb-2 text-sm font-medium">Revision History</h3>
          <ul className="space-y-2">
            {revisions.map((rev: LyricRevision) => (
              <li key={rev.id} className="text-xs border border-surface-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-surface-700">
                    {new Date(rev.createdAt).toLocaleString()}
                    {rev.changeNote && ` — ${rev.changeNote}`}
                  </span>
                  <button className="btn-ghost text-xs" onClick={() => restoreRevision.mutate(rev.id)}>
                    Restore
                  </button>
                </div>
                <pre className="font-mono whitespace-pre-wrap line-clamp-3 text-surface-700">
                  {rev.previousText}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showRevisions && revisions && revisions.length === 0 && (
        <p className="text-xs text-surface-700 border-t border-surface-200 pt-3">No revision history yet.</p>
      )}
    </div>
  );
}

function AiAnalysisPanel({ songId }: { songId: string }) {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ai-analysis', songId],
    queryFn: () => analysisApi.getAiAnalysis(songId),
    retry: false,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateAiAnalysis(songId),
    onSuccess: () => refetch(),
  });

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3>AI Analysis</h3>
        {user?.isAdmin && (
          <button
            className="btn-ghost text-xs"
            disabled={regen.isPending}
            onClick={() => regen.mutate()}
          >
            {regen.isPending ? 'Regenerating…' : 'Regenerate'}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-surface-700">Analyzing lyrics…</p>}
      {error && <ErrorMessage error={error} />}
      {regen.isError && <ErrorMessage error={regen.error} />}

      {data && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Themes</p>
            <div className="flex flex-wrap gap-1">
              {data.themes.map((t) => (
                <span key={t} className="badge badge-gray">{t}</span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Emotional Register</p>
            <p className="text-sm">{data.emotionalRegister}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Conceptual Depth</p>
            <p className="text-sm">{data.conceptualDepth}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Notable Elements</p>
            <ul className="text-sm space-y-0.5 list-disc list-inside">
              {data.notableElements.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-surface-500">Model: {data.model} · Analyzed {new Date(data.updatedAt).toLocaleDateString()}</p>
        </div>
      )}
    </div>
  );
}

function AlbumTrackList({ songs, currentSongId }: { songs: Song[]; currentSongId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card mb-4 p-0 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Album tracks ({songs.length})</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ol className="border-t border-surface-100 divide-y divide-surface-100">
          {songs.map((s) => (
            <li key={s.id}>
              <Link
                to={`/library/songs/${s.id}`}
                className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-50 transition-colors ${s.id === currentSongId ? 'font-semibold text-indigo-700 bg-indigo-50' : 'text-surface-900'}`}
              >
                {s.trackNumber != null && (
                  <span className="w-5 text-right tabular-nums text-surface-400 text-xs flex-shrink-0">{s.trackNumber}.</span>
                )}
                <span className="flex-1 truncate">{s.title}</span>
                {s.id === currentSongId && <span className="text-xs text-indigo-400">← here</span>}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const SOURCE_LABELS: Record<SongResearchSource['type'], string> = {
  song: 'Song',
  album: 'Album',
  band: 'Artist',
};

function SongResearchPanel({ songId }: { songId: string }) {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['song-research', songId],
    queryFn: () => analysisApi.getSongResearch(songId),
    retry: false,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateSongResearch(songId),
    onSuccess: () => refetch(),
  });

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3>Song Research</h3>
        {user?.isAdmin && (
          <button className="btn-ghost text-xs" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {regen.isPending ? 'Researching…' : 'Regenerate'}
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-surface-700">Searching Wikipedia…</p>
      )}
      {error && <ErrorMessage error={error} />}
      {regen.isError && <ErrorMessage error={regen.error} />}

      {data && (
        <div className="space-y-4">
          {data.musicStyle && (
            <div>
              <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Music Style</p>
              <p className="text-sm leading-relaxed">{data.musicStyle}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Background</p>
            <p className="text-sm leading-relaxed">{data.summary}</p>
          </div>

          {data.sources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-2">Sources</p>
              <ul className="space-y-1">
                {data.sources.map((s) => (
                  <li key={s.type} className="flex items-center gap-2 text-sm">
                    <span className="text-xs font-medium text-surface-500 w-12 flex-shrink-0">
                      {SOURCE_LABELS[s.type]}
                    </span>
                    {s.found ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline truncate"
                      >
                        {s.title}
                      </a>
                    ) : (
                      <span className="text-surface-400 italic">Not found on Wikipedia</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-surface-500">
            Model: {data.model} · Researched {new Date(data.updatedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

const CONTEXT_SECTIONS = [
  { key: 'titleSignificance', label: 'Title Significance' },
  { key: 'historicalContext', label: 'Historical Context' },
  { key: 'lyricalInterpretation', label: 'Lyrical Interpretation' },
  { key: 'thematicSynthesis', label: 'Thematic Synthesis' },
  { key: 'overallNarrative', label: 'Overall Narrative' },
] as const;

function SongContextPanel({ songId }: { songId: string }) {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['song-context', songId],
    queryFn: () => analysisApi.getSongContext(songId),
    retry: false,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateSongContext(songId),
    onSuccess: () => refetch(),
  });

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3>Deep Analysis</h3>
          <p className="text-xs text-surface-500 mt-0.5">
            Synthesises title, lyrics, research, scores, and ratings.
          </p>
        </div>
        {user?.isAdmin && (
          <button className="btn-ghost text-xs" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {regen.isPending ? 'Analysing…' : 'Regenerate'}
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-surface-700">Running deep analysis…</p>
      )}
      {error && <ErrorMessage error={error} />}
      {regen.isError && <ErrorMessage error={regen.error} />}

      {data && (
        <div className="space-y-5">
          {CONTEXT_SECTIONS.map(({ key, label }) => (
            <div key={key}>
              <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide mb-1.5">
                {label}
              </p>
              <p className="text-sm leading-relaxed">{data[key]}</p>
            </div>
          ))}
          <p className="text-xs text-surface-500 border-t border-surface-100 pt-3">
            Model: {data.model} · Analysed {new Date(data.updatedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

export default function SongDetailPage() {
  const { songId } = useParams<{ songId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [showAddLyric, setShowAddLyric] = useState(false);
  const [newLyricText, setNewLyricText] = useState('');
  const [newSourceType, setNewSourceType] = useState<'manual' | 'paste' | 'user_provided'>('manual');

  // Lyrics finder state
  const [showLyricFinder, setShowLyricFinder] = useState(false);
  const [finderArtist, setFinderArtist] = useState('');
  const [finderTitle, setFinderTitle] = useState('');
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderText, setFinderText] = useState('');
  const [finderError, setFinderError] = useState('');

  async function searchLyricsOnline() {
    if (!finderArtist.trim() || !finderTitle.trim()) return;
    setFinderLoading(true);
    setFinderText('');
    setFinderError('');
    try {
      const data = await songsApi.lyricsLookup(finderArtist.trim(), finderTitle.trim());
      if (data.lyrics?.trim()) {
        setFinderText(data.lyrics.trim());
      } else {
        setFinderError('Search returned an empty result.');
      }
    } catch (e) {
      const err = e as { status?: number };
      setFinderError(err.status === 404
        ? 'No lyrics found in either database. Try AI Recall, or add them manually.'
        : 'Search failed — check your connection and try again.');
    }
    setFinderLoading(false);
  }

  // Edit song state
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTrack, setEditTrack] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRarity, setEditRarity] = useState('Common');
  const [editError, setEditError] = useState('');
  const [wikiFetching, setWikiFetching] = useState(false);
  const [wikiMsg, setWikiMsg] = useState('');
  const [editIsRemix, setEditIsRemix] = useState(false);
  const [editRemixOfId, setEditRemixOfId] = useState<string | null>(null);
  const [remixSearch, setRemixSearch] = useState('');
  const [remixSearchResults, setRemixSearchResults] = useState<import('@band-spectrum-mapper/shared').Song[]>([]);
  const [remixSearching, setRemixSearching] = useState(false);

  const { data: song, isLoading, error } = useQuery({
    queryKey: ['song', songId],
    queryFn: () => songsApi.getById(songId!),
    enabled: !!songId,
  });

  const { data: albumSongs } = useQuery({
    queryKey: ['album-songs', song?.albumId],
    queryFn: () => albumsApi.getSongs(song!.albumId!),
    enabled: !!song?.albumId,
  });

  const { data: remixOfSong } = useQuery({
    queryKey: ['song', song?.remixOfSongId],
    queryFn: () => songsApi.getById(song!.remixOfSongId!),
    enabled: !!song?.remixOfSongId,
  });

  const sortedAlbumSongs: Song[] = albumSongs
    ? [...albumSongs].sort((a, b) => {
        if (a.trackNumber != null && b.trackNumber != null) return a.trackNumber - b.trackNumber;
        if (a.trackNumber != null) return -1;
        if (b.trackNumber != null) return 1;
        return a.title.localeCompare(b.title);
      })
    : [];

  const currentIdx = sortedAlbumSongs.findIndex((s) => s.id === songId);
  const prevSong = currentIdx > 0 ? sortedAlbumSongs[currentIdx - 1] : null;
  const nextSong = currentIdx !== -1 && currentIdx < sortedAlbumSongs.length - 1 ? sortedAlbumSongs[currentIdx + 1] : null;

  const updateSong = useMutation({
    mutationFn: () => songsApi.update(songId!, {
      title: editTitle.trim() || undefined,
      trackNumber: editTrack ? parseInt(editTrack) : null,
      notes: editNotes.trim() || null,
      isRemix: editIsRemix,
      remixOfSongId: editIsRemix ? editRemixOfId : null,
      rarity: editRarity as import('@band-spectrum-mapper/shared').SongRarity,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', songId] });
      setShowEdit(false);
      setEditError('');
    },
    onError: (e) => setEditError(e instanceof Error ? e.message : 'Failed to save'),
  });

  const addLyric = useMutation({
    mutationFn: () =>
      songsApi.createLyric(songId!, {
        text: newLyricText,
        sourceType: newSourceType,
        isPrimary: (song?.lyrics ?? []).length === 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', songId] });
      setShowAddLyric(false);
      setNewLyricText('');
    },
  });

  const importFoundLyrics = useMutation({
    mutationFn: () =>
      songsApi.createLyric(songId!, {
        text: finderText,
        sourceType: 'user_provided',
        isPrimary: (song?.lyrics ?? []).length === 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', songId] });
      setShowLyricFinder(false);
      setFinderText('');
      setFinderError('');
    },
  });

  const [aiLyricStatus, setAiLyricStatus] = useState<'idle' | 'loading' | 'not_found' | 'done' | 'error'>('idle');
  const [aiLyricError, setAiLyricError] = useState('');

  const fetchAiLyrics = useMutation({
    mutationFn: () => songsApi.fetchAiLyrics(songId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', songId] });
      setAiLyricStatus('done');
      setAiLyricError('');
    },
    onError: (e) => {
      const err = e as Error & { status?: number };
      if (err.status === 404) {
        setAiLyricStatus('not_found');
        setAiLyricError('');
      } else {
        setAiLyricStatus('error');
        setAiLyricError(err.message || 'AI recall failed');
      }
    },
  });

  const deleteSong = useMutation({
    mutationFn: () => songsApi.delete(songId!),
    onSuccess: () => navigate(song?.albumId ? `/library/albums/${song.albumId}` : `/library/bands/${song?.bandId}`),
  });

  const openEdit = () => {
    setEditTitle(song?.title ?? '');
    setEditTrack(song?.trackNumber ? String(song.trackNumber) : '');
    setEditNotes(song?.notes ?? '');
    setEditRarity(song?.rarity ?? 'Common');
    setEditIsRemix(song?.isRemix ?? false);
    setEditRemixOfId(song?.remixOfSongId ?? null);
    setRemixSearch('');
    setRemixSearchResults([]);
    setEditError('');
    setShowEdit(true);
  };

  async function searchRemixOriginal(q: string) {
    if (!q.trim()) { setRemixSearchResults([]); return; }
    setRemixSearching(true);
    try {
      const results = await songsApi.search(q.trim());
      setRemixSearchResults(results.filter(s => s.id !== songId));
    } catch { /* ignore */ } finally {
      setRemixSearching(false);
    }
  }

  if (isLoading) return <p className="text-surface-700 text-sm">Loading...</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!song) return null;

  const tags = song.songTags ?? [];

  return (
    <div>
      <PageHeader
        title={song.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-1">
            <Link to={`/library/bands/${song.bandId}`} className="hover:underline">
              {song.band?.name}
            </Link>
            {song.album && (
              <>
                <span className="text-surface-400">/</span>
                <Link to={`/library/albums/${song.albumId!}`} className="hover:underline">
                  {song.album.title}
                </Link>
              </>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {song.albumId
              ? <Link to={`/library/albums/${song.albumId}`} className="btn-secondary">← Album</Link>
              : <Link to={`/library/bands/${song.bandId}`} className="btn-secondary">← Band</Link>
            }
            {prevSong && (
              <Link to={`/library/songs/${prevSong.id}`} className="btn-secondary" title={prevSong.title}>
                ‹ Prev
              </Link>
            )}
            {nextSong && (
              <Link to={`/library/songs/${nextSong.id}`} className="btn-secondary" title={nextSong.title}>
                Next ›
              </Link>
            )}
            <button className="btn-secondary" onClick={openEdit}>Edit</button>
            <Link to={`/spectrum?songId=${song.id}`} className="btn-secondary">Score</Link>
            <Link to={`/share/songs/${song.id}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">Share ↗</Link>
            <button className="btn-danger" onClick={() => { if (confirm('Delete this song?')) deleteSong.mutate(); }}>
              Delete
            </button>
          </div>
        }
      />

      {/* Remix badge */}
      {song.isRemix && (
        <div className="mb-3">
          <span className="badge badge-indigo text-xs">
            Remix
            {remixOfSong && (
              <> of <Link to={`/library/songs/${remixOfSong.id}`} className="underline ml-1">{remixOfSong.title}</Link></>
            )}
          </span>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {tags.map(({ tag }) => (
            <Link
              key={tag.id}
              to={`/library/tags/${tag.slug}`}
              className="badge badge-gray hover:bg-surface-300 transition-colors"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      )}

      {/* Album tracklist */}
      {sortedAlbumSongs.length > 1 && <AlbumTrackList songs={sortedAlbumSongs} currentSongId={song.id} />}

      {/* Edit form */}
      {showEdit && (
        <div className="card mb-6">
          <h3 className="mb-3 font-medium">Edit Song</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editTitle.trim()) { setEditError('Title is required'); return; }
              updateSong.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Title *</label>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Track #</label>
              <input className="input" type="number" value={editTrack} onChange={(e) => setEditTrack(e.target.value)} placeholder="Optional" min="1" />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="textarea w-full" rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes" />
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={wikiFetching}
                  onClick={async () => {
                    setWikiFetching(true);
                    setWikiMsg('');
                    try {
                      const res = await fetch(`/api/songs/${songId}/wiki`);
                      const data = await res.json() as { found: boolean; extract: string; pageUrl: string };
                      if (data.found && data.extract) {
                        setEditNotes(data.extract);
                        setWikiMsg('Fetched from Wikipedia');
                      } else {
                        setWikiMsg('Not found on Wikipedia');
                      }
                    } catch {
                      setWikiMsg('Wikipedia fetch failed');
                    } finally {
                      setWikiFetching(false);
                    }
                  }}
                >
                  {wikiFetching ? 'Fetching…' : 'Fetch from Wikipedia'}
                </button>
                {wikiMsg && <span className="text-xs text-surface-400">{wikiMsg}</span>}
              </div>
            </div>
            <div>
              <label className="label">Rarity (Band RPG)</label>
              <select
                className="input"
                value={editRarity}
                onChange={(e) => setEditRarity(e.target.value)}
              >
                <option value="Common">⚪ Common</option>
                <option value="Uncommon">🟢 Uncommon</option>
                <option value="Rare">🔵 Rare</option>
                <option value="Legendary">🟣 Legendary</option>
                <option value="Mythic">🟠 Mythic</option>
              </select>
            </div>
            <div className="border-t border-surface-200 pt-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editIsRemix}
                  onChange={(e) => {
                    setEditIsRemix(e.target.checked);
                    if (!e.target.checked) { setEditRemixOfId(null); setRemixSearch(''); setRemixSearchResults([]); }
                  }}
                />
                <span className="text-sm font-medium">This is a remix</span>
              </label>
              {editIsRemix && (
                <div className="mt-2 space-y-2">
                  <label className="label">Original song</label>
                  {editRemixOfId ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-surface-700">
                        {remixSearchResults.find(s => s.id === editRemixOfId)?.title
                          ?? (song.remixOfSongId === editRemixOfId ? remixOfSong?.title : null)
                          ?? editRemixOfId}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost text-xs text-red-600"
                        onClick={() => { setEditRemixOfId(null); setRemixSearch(''); setRemixSearchResults([]); }}
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          className="input flex-1"
                          placeholder="Search for original song..."
                          value={remixSearch}
                          onChange={(e) => setRemixSearch(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchRemixOriginal(remixSearch); } }}
                        />
                        <button type="button" className="btn-secondary" onClick={() => void searchRemixOriginal(remixSearch)} disabled={remixSearching}>
                          {remixSearching ? '…' : 'Search'}
                        </button>
                      </div>
                      {remixSearchResults.length > 0 && (
                        <ul className="border border-surface-200 rounded text-sm max-h-40 overflow-y-auto">
                          {remixSearchResults.map(s => (
                            <li key={s.id}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-1.5 hover:bg-surface-100"
                                onClick={() => { setEditRemixOfId(s.id); setRemixSearchResults([]); setRemixSearch(''); }}
                              >
                                {s.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {editError && <p className="text-red-600 text-sm">{editError}</p>}
            <div className="flex gap-2">
              <button className="btn-primary" type="submit" disabled={updateSong.isPending}>
                {updateSong.isPending ? 'Saving...' : 'Save'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setShowEdit(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <h2>Lyrics</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-secondary text-xs"
            disabled={fetchAiLyrics.isPending || aiLyricStatus === 'loading'}
            title="Ask the AI to recall lyrics from its training data. May not know all songs — accuracy unverified."
            onClick={() => {
              setAiLyricStatus('loading');
              setAiLyricError('');
              setShowLyricFinder(false);
              setShowAddLyric(false);
              fetchAiLyrics.mutate();
            }}
          >
            {fetchAiLyrics.isPending
              ? '⏳ Recalling…'
              : aiLyricStatus === 'not_found'
              ? '🤷 Not in AI memory'
              : aiLyricStatus === 'done'
              ? '✓ AI lyrics added'
              : aiLyricStatus === 'error'
              ? '✗ Retry AI Recall'
              : '✨ AI Recall'}
          </button>
          <button
            className="btn-secondary text-xs"
            onClick={() => {
              const open = !showLyricFinder;
              setShowLyricFinder(open);
              setShowAddLyric(false);
              if (open) {
                setFinderArtist(song.band?.name ?? '');
                setFinderTitle(song.title);
                setFinderText('');
                setFinderError('');
              }
            }}
          >
            {showLyricFinder ? 'Cancel Search' : '🔍 Find Online'}
          </button>
          <button className="btn-primary text-xs" onClick={() => { setShowAddLyric(!showAddLyric); setShowLyricFinder(false); }}>
            {showAddLyric ? 'Cancel' : '+ Add Manually'}
          </button>
        </div>
      </div>
      {aiLyricStatus === 'error' && aiLyricError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          AI recall error: {aiLyricError}
        </p>
      )}

      {showLyricFinder && (
        <div className="card mb-4 space-y-3">
          <div>
            <h3 className="font-medium text-surface-900 mb-0.5">Find Lyrics Online</h3>
            <p className="text-xs text-surface-700">Searches Lyrics.ovh and lrclib.net — not AI. Review and edit the result before importing.</p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Artist</label>
              <input
                className="input"
                value={finderArtist}
                onChange={(e) => setFinderArtist(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchLyricsOnline(); }}
                placeholder="Band or artist name"
              />
            </div>
            <div className="flex-1">
              <label className="label">Song Title</label>
              <input
                className="input"
                value={finderTitle}
                onChange={(e) => setFinderTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchLyricsOnline(); }}
                placeholder="Song title"
              />
            </div>
          </div>
          <button
            className="btn-secondary"
            disabled={finderLoading || !finderArtist.trim() || !finderTitle.trim()}
            onClick={searchLyricsOnline}
          >
            {finderLoading ? 'Searching…' : 'Search'}
          </button>
          {finderError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{finderError}</p>
          )}
          {finderText && (
            <div className="space-y-2">
              <label className="label">Result — edit or trim as needed before importing</label>
              <textarea
                className="textarea w-full min-h-[260px] font-mono text-xs"
                value={finderText}
                onChange={(e) => setFinderText(e.target.value)}
              />
              <div className="flex gap-2 items-center">
                <button
                  className="btn-primary"
                  disabled={!finderText.trim() || importFoundLyrics.isPending}
                  onClick={() => importFoundLyrics.mutate()}
                >
                  {importFoundLyrics.isPending ? 'Importing…' : 'Import These Lyrics'}
                </button>
                <span className="text-xs text-surface-600">Saved as <em>user_provided</em> — verify accuracy before publishing</span>
              </div>
              {importFoundLyrics.isError && <ErrorMessage error={importFoundLyrics.error} />}
            </div>
          )}
        </div>
      )}

      {showAddLyric && (
        <div className="card mb-4 space-y-3">
          <div>
            <label className="label">Source Type</label>
            <select
              className="input"
              value={newSourceType}
              onChange={(e) => setNewSourceType(e.target.value as typeof newSourceType)}
            >
              <option value="manual">Manual Entry</option>
              <option value="paste">Paste</option>
              <option value="user_provided">User Provided</option>
            </select>
          </div>
          <div>
            <label className="label">Lyrics Text *</label>
            <textarea
              className="textarea w-full min-h-[200px]"
              placeholder="Enter or paste lyrics here..."
              value={newLyricText}
              onChange={(e) => setNewLyricText(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!newLyricText.trim() || addLyric.isPending}
            onClick={() => addLyric.mutate()}
          >
            {addLyric.isPending ? 'Saving...' : 'Save Lyrics'}
          </button>
          {addLyric.isError && <ErrorMessage error={addLyric.error} />}
        </div>
      )}

      {song.lyrics.length === 0 && (
        <EmptyState
          message="No lyrics yet."
          action={<button className="btn-primary" onClick={() => setShowAddLyric(true)}>Add lyrics</button>}
        />
      )}

      <div className="space-y-4">
        {song.lyrics.map((lyric) => (
          <LyricEditor key={lyric.id} lyric={lyric} onSaved={() => {}} />
        ))}
      </div>
      {song.lyrics.some((l) => l.sourceType === 'ai_recall') && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
          ⚠ One or more lyric entries were recalled by AI and may contain errors. Please verify and edit as needed.
        </p>
      )}

      {song.notes && !showEdit && (
        <div className="card mt-6">
          <h3 className="mb-2">Notes</h3>
          <p className="text-sm whitespace-pre-wrap">{song.notes}</p>
        </div>
      )}

      {song.lyrics.length > 0 && <AiAnalysisPanel songId={song.id} />}

      <SongResearchPanel songId={song.id} />

      <SongContextPanel songId={song.id} />

      <div className="card mt-6">
        <div className="mb-4">
          <h3>Philosophical Themes</h3>
          <p className="text-xs text-surface-500 mt-0.5">
            Weighted lyrical and conceptual analysis across 16 thematic dimensions.
          </p>
        </div>
        <SongThemeWidget
          songId={song.id}
          bandId={song.bandId}
          showRegenerate
        />
      </div>

      <CommentSection songId={song.id} card />
    </div>
  );
}
