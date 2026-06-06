import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { albumsApi } from '../api/albums';
import { bandsApi } from '../api/bands';
import { analysisApi } from '../api/analysis';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import EmptyState from '../components/layout/EmptyState';
import type { CreateSongInput } from '@band-spectrum-mapper/shared';
import { ALBUM_TYPES, ALBUM_TYPE_LABELS } from '@band-spectrum-mapper/shared';

export default function AlbumDetailPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [showSongForm, setShowSongForm] = useState(false);
  const [songTitle, setSongTitle] = useState('');
  const [trackNumber, setTrackNumber] = useState('');
  const [formError, setFormError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  // Edit album state
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editArtworkUrl, setEditArtworkUrl] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAlbumType, setEditAlbumType] = useState<string>('');
  const [editError, setEditError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [wikiFetching, setWikiFetching] = useState(false);
  const [wikiMsg, setWikiMsg] = useState('');

  // Artwork search state
  const [showArtSearch, setShowArtSearch] = useState(false);
  const [artSearchTerm, setArtSearchTerm] = useState('');
  const [artSearchLoading, setArtSearchLoading] = useState(false);
  type ArtResult = { url: string; name: string; artist: string };
  const [artResults, setArtResults] = useState<ArtResult[]>([]);

  async function searchArtwork() {
    if (!artSearchTerm.trim()) return;
    setArtSearchLoading(true);
    setArtResults([]);
    const combined: ArtResult[] = [];

    // iTunes — broad catalogue, good coverage of popular releases
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(artSearchTerm)}&entity=album&limit=20&media=music`
      );
      const data = await res.json() as { results: { artworkUrl100?: string; collectionName?: string; artistName?: string }[] };
      combined.push(...data.results
        .filter((r) => r.artworkUrl100)
        .map((r) => ({
          url: r.artworkUrl100!.replace('100x100bb', '600x600bb'),
          name: r.collectionName ?? '',
          artist: r.artistName ?? '',
        }))
      );
    } catch { /* network unavailable */ }

    // MusicBrainz + Cover Art Archive — better for older/non-mainstream releases
    try {
      const mbRes = await fetch(
        `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(artSearchTerm)}&limit=15&fmt=json`,
        { headers: { 'User-Agent': 'BandSpectrumMapper/1.0 (music-analysis-tool)' } }
      );
      const mbData = await mbRes.json() as {
        releases?: { id: string; title: string; 'artist-credit'?: { name: string }[] }[]
      };
      if (mbData.releases) {
        combined.push(...mbData.releases.map((r) => ({
          url: `https://coverartarchive.org/release/${r.id}/front-500`,
          name: r.title,
          artist: r['artist-credit']?.[0]?.name ?? '',
        })));
      }
    } catch { /* network unavailable */ }

    // Wikipedia — good for classic/well-documented albums
    try {
      const wpRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(artSearchTerm)}&prop=pageimages&pithumbsize=500&format=json&origin=*&gsrlimit=8`
      );
      const wpData = await wpRes.json() as {
        query?: { pages?: Record<string, { title: string; thumbnail?: { source: string } }> }
      };
      if (wpData.query?.pages) {
        for (const page of Object.values(wpData.query.pages)) {
          if (page.thumbnail?.source) {
            combined.push({ url: page.thumbnail.source, name: page.title, artist: '' });
          }
        }
      }
    } catch { /* network unavailable */ }

    setArtResults(combined);
    setArtSearchLoading(false);
  }

  const { data: album, isLoading, error } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () => albumsApi.getById(albumId!),
    enabled: !!albumId,
  });

  const updateAlbum = useMutation({
    mutationFn: () => albumsApi.update(albumId!, {
      title: editTitle.trim() || undefined,
      year: editYear ? parseInt(editYear) : null,
      artworkUrl: editArtworkUrl.trim() || null,
      notes: editNotes.trim() || null,
      ...(editAlbumType ? { albumType: editAlbumType as typeof ALBUM_TYPES[number] } : { albumType: null }),
    }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['album', albumId] });
      setShowEdit(false);
      setEditError('');
      setSaveSuccess(saved.artworkUrl
        ? `Saved ✓ — artwork URL stored (${saved.artworkUrl.slice(0, 60)}…)`
        : 'Saved ✓ — no artwork URL set');
    },
    onError: (e) => setEditError(e instanceof Error ? e.message : 'Failed to save'),
  });

  const createSong = useMutation({
    mutationFn: (data: CreateSongInput) =>
      bandsApi.createSong(album!.bandId, { ...data, albumId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['album', albumId] });
      setSongTitle('');
      setTrackNumber('');
      setShowSongForm(false);
      setFormError('');
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Failed to create song'),
  });

  const deleteAlbum = useMutation({
    mutationFn: () => albumsApi.delete(albumId!),
    onSuccess: () => navigate(`/library/bands/${album?.bandId}`),
  });

  const { data: aiContext, isFetching: contextFetching, refetch: refetchContext } = useQuery({
    queryKey: ['album-context', albumId],
    queryFn: () => analysisApi.getAlbumContext(albumId!),
    enabled: !!albumId && !!album,
    retry: false,
  });

  const regenerateContext = useMutation({
    mutationFn: () => analysisApi.regenerateAlbumContext(albumId!),
    onSuccess: () => refetchContext(),
  });

  const openEdit = () => {
    setEditTitle(album?.title ?? '');
    setEditYear(album?.year ? String(album.year) : '');
    setEditArtworkUrl(album?.artworkUrl ?? '');
    setEditNotes(album?.notes ?? '');
    setEditAlbumType(album?.albumType ?? '');
    setEditError('');
    setShowArtSearch(false);
    setArtResults([]);
    setArtSearchTerm(`${album?.band?.name ?? ''} ${album?.title ?? ''}`.trim());
    setShowEdit(true);
  };

  if (isLoading) return <p className="text-surface-700 text-sm">Loading...</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!album) return null;

  return (
    <div>
      <PageHeader
        title={album.title}
        subtitle={[album.year ? String(album.year) : null, album.albumType ? album.albumType.toUpperCase() : null].filter(Boolean).join(' · ') || undefined}
        actions={
          <div className="flex gap-2">
            <Link to={`/library/bands/${album.bandId}`} className="btn-secondary">← Band</Link>
            <button className="btn-secondary" onClick={openEdit}>Edit</button>
            <button className="btn-danger" onClick={() => setShowDelete(true)}>Delete Album</button>
          </div>
        }
      />

      {/* Artwork status — always visible so you can confirm what's saved */}
      <div className="card mb-4 flex items-center gap-4">
        {album.artworkUrl ? (
          <>
            <img
              src={album.artworkUrl}
              alt="Album art"
              className="w-16 h-16 rounded object-cover border border-surface-200 shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-green-700">Artwork saved ✓</p>
              <p className="text-xs text-surface-500 truncate">{album.artworkUrl}</p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded border-2 border-dashed border-surface-300 flex items-center justify-center shrink-0">
              <span className="text-surface-400 text-xs text-center leading-tight">No art</span>
            </div>
            <div>
              <p className="text-sm text-surface-600">No album artwork saved.</p>
              <p className="text-xs text-surface-400">Click <strong>Edit</strong>, use the <strong>🔍 Find</strong> button to search iTunes, select a cover, then click <strong>Save</strong>.</p>
            </div>
          </div>
        )}
      </div>

      {saveSuccess && (
        <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {saveSuccess}
        </div>
      )}

      {/* Edit form */}
      {showEdit && (
        <div className="card mb-6">
          <h3 className="mb-3 font-medium">Edit Album</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editTitle.trim()) { setEditError('Title is required'); return; }
              updateAlbum.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Title *</label>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Year</label>
              <input className="input" type="number" value={editYear} onChange={(e) => setEditYear(e.target.value)} placeholder="2024" min="1900" max="2100" />
            </div>
            <div>
              <label className="label">Artwork URL</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  type="url"
                  value={editArtworkUrl}
                  onChange={(e) => setEditArtworkUrl(e.target.value)}
                  placeholder="https://…  (paste a direct image URL)"
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0 text-xs"
                  onClick={() => setShowArtSearch((s) => !s)}
                >
                  🔍 Find
                </button>
              </div>
              {editArtworkUrl && (
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={editArtworkUrl}
                    alt="Album art preview"
                    className="w-20 h-20 rounded object-cover border border-surface-200 shrink-0"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Preview only — click <strong>Save</strong> below to store this artwork.
                  </p>
                </div>
              )}

              {/* iTunes artwork search */}
              {showArtSearch && (
                <div className="mt-3 border border-surface-200 rounded-lg p-3 space-y-2 bg-surface-50">
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm"
                      value={artSearchTerm}
                      onChange={(e) => setArtSearchTerm(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchArtwork(); } }}
                      placeholder="Band name + album title…"
                    />
                    <button
                      type="button"
                      className="btn-secondary shrink-0 text-xs"
                      onClick={searchArtwork}
                      disabled={artSearchLoading}
                    >
                      {artSearchLoading ? '…' : 'Search'}
                    </button>
                  </div>
                  {artResults.length > 0 && (
                    <div className="overflow-y-auto max-h-72">
                      <div className="grid grid-cols-5 gap-2">
                        {artResults.map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            title={`${r.artist} — ${r.name}`}
                            className="rounded overflow-hidden hover:ring-2 ring-indigo-500 transition-all"
                            onClick={() => {
                              setEditArtworkUrl(r.url);
                              setShowArtSearch(false);
                              setArtResults([]);
                            }}
                          >
                            <img
                              src={r.url}
                              alt={r.name}
                              className="w-full aspect-square object-cover"
                              onError={(e) => { e.currentTarget.closest('button')!.style.display = 'none'; }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[9px] text-surface-400">iTunes · Cover Art Archive · Wikipedia · click a cover to select</p>
                </div>
              )}
            </div>
            <div>
              <label className="label">Album Type</label>
              <select className="input" value={editAlbumType} onChange={(e) => setEditAlbumType(e.target.value)}>
                <option value="">— unset —</option>
                {ALBUM_TYPES.map((t) => (
                  <option key={t} value={t}>{ALBUM_TYPE_LABELS[t]}</option>
                ))}
              </select>
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
                      const res = await fetch(`/api/albums/${albumId}/wiki`);
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
            {editError && <p className="text-red-600 text-sm">{editError}</p>}
            <div className="flex gap-2">
              <button className="btn-primary" type="submit" disabled={updateAlbum.isPending}>
                {updateAlbum.isPending ? 'Saving...' : 'Save'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setShowEdit(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {showDelete && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm mb-3">Delete <strong>{album.title}</strong>? Songs will not be deleted, but they will be unlinked from this album.</p>
          <div className="flex gap-2">
            <button className="btn-danger" onClick={() => deleteAlbum.mutate()}>Yes, delete</button>
            <button className="btn-secondary" onClick={() => setShowDelete(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2>Songs</h2>
        <button className="btn-primary" onClick={() => setShowSongForm(!showSongForm)}>
          {showSongForm ? 'Cancel' : 'Add Song'}
        </button>
      </div>

      {showSongForm && (
        <div className="card mb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!songTitle.trim()) { setFormError('Title is required'); return; }
              createSong.mutate({
                title: songTitle.trim(),
                trackNumber: trackNumber ? parseInt(trackNumber) : null,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Title *</label>
              <input className="input" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title" />
            </div>
            <div>
              <label className="label">Track #</label>
              <input className="input" type="number" value={trackNumber} onChange={(e) => setTrackNumber(e.target.value)} placeholder="1" min="1" />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <button className="btn-primary" type="submit" disabled={createSong.isPending}>
              {createSong.isPending ? 'Saving...' : 'Create Song'}
            </button>
          </form>
        </div>
      )}

      {album.songs.length === 0 && (
        <EmptyState
          message="No songs yet."
          action={<button className="btn-primary" onClick={() => setShowSongForm(true)}>Add first song</button>}
        />
      )}

      {album.songs.length > 0 && (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left">
                <th className="pb-2 pr-4 font-medium text-surface-700 w-8">#</th>
                <th className="pb-2 font-medium text-surface-700">Title</th>
              </tr>
            </thead>
            <tbody>
              {album.songs.map((song) => (
                <tr key={song.id} className="border-b border-surface-100">
                  <td className="py-2 pr-4 text-surface-700">{song.trackNumber ?? '—'}</td>
                  <td className="py-2">
                    <Link to={`/library/songs/${song.id}`} className="hover:underline">
                      {song.title}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {album.notes && !showEdit && (
        <div className="card mt-4">
          <p className="text-xs font-medium text-surface-600 mb-1">Notes</p>
          <p className="text-sm whitespace-pre-wrap text-surface-700">{album.notes}</p>
        </div>
      )}

      {/* AI Album Context Analysis */}
      <div className="card mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium">AI Album Analysis</h3>
            <p className="text-xs text-surface-500 mt-0.5">
              Synthesizes lyrics and publicly available information across all songs — not the music itself.
              Human ratings and listener comments complete the picture.
            </p>
          </div>
          <button
            className="btn-secondary text-xs"
            onClick={() => regenerateContext.mutate()}
            disabled={regenerateContext.isPending || contextFetching}
          >
            {regenerateContext.isPending ? 'Generating…' : aiContext ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {contextFetching && !aiContext && (
          <p className="text-sm text-surface-500">Loading…</p>
        )}

        {aiContext && (
          <div className="space-y-4 border-t border-surface-100 pt-4">
            <div>
              <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Album Narrative</p>
              <p className="text-sm leading-relaxed text-surface-900">{aiContext.overallNarrative}</p>
            </div>
            <details className="border-t border-surface-100 pt-3">
              <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                Thematic synthesis →
              </summary>
              <p className="text-sm leading-relaxed text-surface-900 mt-2">{aiContext.thematicSynthesis}</p>
            </details>
            <details className="border-t border-surface-100 pt-3">
              <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                Artistic context →
              </summary>
              <p className="text-sm leading-relaxed text-surface-900 mt-2">{aiContext.artisticContext}</p>
            </details>
            <p className="text-xs text-surface-400 border-t border-surface-100 pt-3">
              Generated {new Date(aiContext.updatedAt).toLocaleDateString()} · Based on lyrics &amp; public information only, not the music itself
            </p>
          </div>
        )}

        {!aiContext && !contextFetching && (
          <p className="text-sm text-surface-500 italic">
            Click Generate to create an AI narrative for this album. Works best when songs have AI analysis run first (via the Batch Runner).
          </p>
        )}
      </div>
    </div>
  );
}
