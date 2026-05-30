import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import { analysisApi } from '../api/analysis';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import EmptyState from '../components/layout/EmptyState';
import type { CreateAlbumInput } from '@band-spectrum-mapper/shared';

const CURRENT_YEAR = new Date().getFullYear();

export default function BandDetailPage() {
  const { bandId } = useParams<{ bandId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [showAlbumForm, setShowAlbumForm] = useState(false);
  const [albumTitle, setAlbumTitle] = useState('');
  const [albumYear, setAlbumYear] = useState('');
  const [formError, setFormError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Quick Add Single state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickYear, setQuickYear] = useState(String(CURRENT_YEAR));
  const [quickError, setQuickError] = useState('');
  const [quickAdding, setQuickAdding] = useState(false);

  // Edit band state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editError, setEditError] = useState('');

  const { data: band, isLoading, error } = useQuery({
    queryKey: ['band', bandId],
    queryFn: () => bandsApi.getById(bandId!),
    enabled: !!bandId,
  });

  const { data: albums } = useQuery({
    queryKey: ['albums', bandId],
    queryFn: () => bandsApi.listAlbums(bandId!),
    enabled: !!bandId,
  });

  const updateBand = useMutation({
    mutationFn: () => bandsApi.update(bandId!, {
      name: editName.trim() || undefined,
      description: editDescription.trim() || null,
      logoUrl: editLogoUrl.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['band', bandId] });
      qc.invalidateQueries({ queryKey: ['bands'] });
      setShowEdit(false);
      setEditError('');
    },
    onError: (e) => setEditError(e instanceof Error ? e.message : 'Failed to save'),
  });

  const createAlbum = useMutation({
    mutationFn: (data: CreateAlbumInput) => bandsApi.createAlbum(bandId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums', bandId] });
      setAlbumTitle('');
      setAlbumYear('');
      setShowAlbumForm(false);
      setFormError('');
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Failed to create album'),
  });

  const deleteBand = useMutation({
    mutationFn: () => bandsApi.delete(bandId!),
    onSuccess: () => navigate('/library'),
  });

  async function quickAddSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim()) { setQuickError('Song title is required'); return; }
    setQuickAdding(true);
    setQuickError('');
    try {
      const album = await bandsApi.createAlbum(bandId!, {
        title: `${quickTitle.trim()} (Single)`,
        year: quickYear ? parseInt(quickYear) : null,
        albumType: 'single',
      });
      const song = await bandsApi.createSong(bandId!, {
        title: quickTitle.trim(),
        albumId: album.id,
        trackNumber: 1,
      });
      qc.invalidateQueries({ queryKey: ['albums', bandId] });
      navigate(`/library/songs/${song.id}`);
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : 'Failed to add single');
      setQuickAdding(false);
    }
  }

  const { data: aiContext, isFetching: contextFetching, refetch: refetchContext } = useQuery({
    queryKey: ['band-context', bandId],
    queryFn: () => analysisApi.getBandContext(bandId!),
    enabled: !!bandId && !!band,
    retry: false,
  });

  const regenerateContext = useMutation({
    mutationFn: () => analysisApi.regenerateBandContext(bandId!),
    onSuccess: () => refetchContext(),
  });

  const openEdit = () => {
    setEditName(band?.name ?? '');
    setEditDescription(band?.description ?? '');
    setEditLogoUrl(band?.logoUrl ?? '');
    setEditError('');
    setShowEdit(true);
  };

  if (isLoading) return <p className="text-surface-700 text-sm">Loading...</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!band) return null;

  return (
    <div>
      <PageHeader
        title={band.name}
        subtitle={band.description ?? undefined}
        actions={
          <div className="flex gap-2">
            <Link to="/library" className="btn-secondary">← Library</Link>
            <button
              className="btn-secondary"
              onClick={() => navigate(`/discography?band=${encodeURIComponent(band.name)}&tab=musicbrainz`)}
              title="Search MusicBrainz to fill in missing albums or tracks"
            >
              Fill from MusicBrainz
            </button>
            <button className="btn-secondary" onClick={openEdit}>Edit</button>
            <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)}>Delete Band</button>
          </div>
        }
      />

      {/* Edit form */}
      {showEdit && (
        <div className="card mb-6">
          <h3 className="mb-3 font-medium">Edit Band</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editName.trim()) { setEditError('Name is required'); return; }
              updateBand.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Name *</label>
              <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="label">Logo URL <span className="text-surface-400 font-normal">(shown in Cinema Visual Node Mode)</span></label>
              <input className="input" type="url" value={editLogoUrl} onChange={(e) => setEditLogoUrl(e.target.value)} placeholder="https://… direct image URL" />
            </div>
            {editError && <p className="text-red-600 text-sm">{editError}</p>}
            <div className="flex gap-2">
              <button className="btn-primary" type="submit" disabled={updateBand.isPending}>
                {updateBand.isPending ? 'Saving...' : 'Save'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setShowEdit(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm mb-3">
            Delete <strong>{band.name}</strong>? This will also delete all albums, songs, and lyrics. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button className="btn-danger" onClick={() => deleteBand.mutate()}>Yes, delete</button>
            <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2>Albums</h2>
        <div className="flex gap-2">
          <button
            className="btn-secondary text-sm"
            onClick={() => { setShowQuickAdd(!showQuickAdd); setShowAlbumForm(false); setQuickError(''); }}
          >
            {showQuickAdd ? 'Cancel' : '+ Quick Add Single'}
          </button>
          <button className="btn-primary" onClick={() => { setShowAlbumForm(!showAlbumForm); setShowQuickAdd(false); }}>
            {showAlbumForm ? 'Cancel' : 'Add Album'}
          </button>
        </div>
      </div>

      {/* Quick Add Single — creates album (type=single) + song in one step, navigates to song page */}
      {showQuickAdd && (
        <div className="card mb-4 border-indigo-100 bg-indigo-50/40">
          <p className="text-xs text-indigo-600 font-medium mb-3">
            New single or release not in MusicBrainz yet? Add it here — creates the album and song in one step, then takes you straight to the song page to add lyrics and run analysis.
          </p>
          <form onSubmit={(e) => void quickAddSingle(e)} className="space-y-3">
            <div>
              <label className="label">Song Title *</label>
              <input
                className="input"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="e.g. Starless"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Year</label>
              <input
                className="input"
                type="number"
                value={quickYear}
                onChange={(e) => setQuickYear(e.target.value)}
                min="1900"
                max="2100"
              />
            </div>
            {quickError && <p className="text-red-600 text-sm">{quickError}</p>}
            <div className="flex gap-2 items-center">
              <button className="btn-primary" type="submit" disabled={quickAdding}>
                {quickAdding ? 'Adding…' : 'Add Single & Analyze →'}
              </button>
              <span className="text-xs text-surface-500">Creates "{quickTitle.trim() || '…'} (Single)" album automatically</span>
            </div>
          </form>
        </div>
      )}

      {showAlbumForm && (
        <div className="card mb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!albumTitle.trim()) { setFormError('Title is required'); return; }
              createAlbum.mutate({
                title: albumTitle.trim(),
                year: albumYear ? parseInt(albumYear) : null,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Title *</label>
              <input className="input" value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value)} placeholder="Album title" />
            </div>
            <div>
              <label className="label">Year</label>
              <input className="input" type="number" value={albumYear} onChange={(e) => setAlbumYear(e.target.value)} placeholder="2024" min="1900" max="2100" />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <button className="btn-primary" type="submit" disabled={createAlbum.isPending}>
              {createAlbum.isPending ? 'Saving...' : 'Create Album'}
            </button>
          </form>
        </div>
      )}

      {albums && albums.length === 0 && (
        <EmptyState
          message="No albums yet."
          action={<button className="btn-primary" onClick={() => setShowAlbumForm(true)}>Add first album</button>}
        />
      )}

      {albums && albums.length > 0 && (
        <div className="card">
          <ul className="divide-y divide-surface-100">
            {albums.map((album) => (
              <li key={album.id} className="py-3 flex items-center justify-between">
                <div>
                  <Link to={`/library/albums/${album.id}`} className="font-medium hover:underline">
                    {album.title}
                  </Link>
                  {album.year && <span className="ml-2 text-xs text-surface-500">{album.year}</span>}
                  {album.albumType && (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5">
                      {album.albumType}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Band Context Analysis */}
      <div className="card mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium">AI Artist Profile</h3>
            <p className="text-xs text-surface-500 mt-0.5">
              Synthesizes lyrics and public information across all albums — not the music itself.
              Human listener ratings and comments complete the musical picture.
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
              <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Artist Overview</p>
              <p className="text-sm leading-relaxed text-surface-900">{aiContext.overallNarrative}</p>
            </div>
            <details className="border-t border-surface-100 pt-3">
              <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                Thematic signature →
              </summary>
              <p className="text-sm leading-relaxed text-surface-900 mt-2">{aiContext.thematicSynthesis}</p>
            </details>
            <details className="border-t border-surface-100 pt-3">
              <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                Artistic evolution →
              </summary>
              <p className="text-sm leading-relaxed text-surface-900 mt-2">{aiContext.artisticEvolution}</p>
            </details>
            <p className="text-xs text-surface-400 border-t border-surface-100 pt-3">
              Generated {new Date(aiContext.updatedAt).toLocaleDateString()} · Based on lyrics &amp; public information only, not the music itself
            </p>
          </div>
        )}

        {!aiContext && !contextFetching && (
          <p className="text-sm text-surface-500 italic">
            Click Generate to create an AI artist profile. Works best when songs have AI analysis and thematic tags run first (via the Batch Runner).
          </p>
        )}
      </div>
    </div>
  );
}
