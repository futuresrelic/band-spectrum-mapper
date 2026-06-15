import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '';

function handleExport() {
  const a = document.createElement('a');
  a.href = `${BASE_URL}/api/export`;
  a.download = `band-spectrum-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

interface ToolCard {
  to: string;
  label: string;
  desc: string;
  newTab?: boolean;
}

function ToolGrid({ items }: { items: ToolCard[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
      {items.map(({ to, label, desc, newTab }) => (
        <Link
          key={to}
          to={to}
          target={newTab ? '_blank' : undefined}
          rel={newTab ? 'noopener noreferrer' : undefined}
          className="card hover:border-surface-400 transition-colors group"
        >
          <p className="font-medium text-sm group-hover:underline">{label}{newTab ? ' ↗' : ''}</p>
          <p className="text-xs text-surface-600 mt-1">{desc}</p>
        </Link>
      ))}
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-3 mt-2">{label}</p>
  );
}

export default function DashboardPage() {
  const { data: bands, isLoading, error } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your music library"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={handleExport}>Export JSON</button>
            <Link to="/view" target="_blank" className="btn-secondary">Public Viewer ↗</Link>
            <Link to="/library" className="btn-primary">Open Library</Link>
          </div>
        }
      />

      {error && <ErrorMessage error={error} />}
      {isLoading && <p className="text-surface-700 text-sm">Loading…</p>}

      {bands && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="card">
            <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Bands</p>
            <p className="text-3xl font-bold">{bands.length}</p>
          </div>
          <div className="card">
            <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Albums</p>
            <p className="text-3xl font-bold">{bands.reduce((n, b) => n + b._count.albums, 0)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Songs</p>
            <p className="text-3xl font-bold">{bands.reduce((n, b) => n + b._count.songs, 0)}</p>
          </div>
        </div>
      )}

      {bands && bands.length > 0 && (
        <div className="card mb-8">
          <h2 className="mb-4">Your Bands</h2>
          <ul className="divide-y divide-surface-100">
            {bands.map((band) => (
              <li key={band.id} className="py-3 flex items-center justify-between">
                <div>
                  <Link to={`/library/bands/${band.id}`} className="font-medium hover:underline">
                    {band.name}
                  </Link>
                  {band.description && (
                    <p className="text-xs text-surface-700 mt-0.5 line-clamp-1">{band.description}</p>
                  )}
                </div>
                <div className="flex gap-4 text-xs text-surface-700">
                  <span>{band._count.albums} albums</span>
                  <span>{band._count.songs} songs</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {bands && bands.length === 0 && (
        <div className="card text-center py-12 mb-8">
          <p className="text-surface-700 mb-4">No bands yet. Add your first band to get started.</p>
          <Link to="/library" className="btn-primary">Go to Library</Link>
        </div>
      )}

      {/* ── Core ── */}
      <SectionHeading label="Core" />
      <ToolGrid items={[
        { to: '/library',  label: 'Library',           desc: 'Browse bands, albums, songs' },
        { to: '/spectrum', label: 'Spectrum',           desc: 'Radar chart scoring across 6 axes' },
        { to: '/analysis', label: 'Analysis',           desc: 'Lyric word frequency & insights' },
        { to: '/compare',  label: 'Compare',            desc: 'Side-by-side band comparison' },
      ]} />

      {/* ── Content ── */}
      <SectionHeading label="Content" />
      <ToolGrid items={[
        { to: '/imports',        label: 'Imports',           desc: 'Bulk lyrics import from files' },
        { to: '/lyrics-builder', label: 'Lyrics Builder',    desc: 'Add and edit lyrics album by album' },
        { to: '/discography',    label: 'Discography',       desc: 'Import discography via MusicBrainz' },
        { to: '/song-spectrum',  label: 'Song Spectrum',     desc: 'Audio upload + YouTube audio analysis' },
      ]} />

      {/* ── Visualizations ── */}
      <SectionHeading label="Visualizations" />
      <ToolGrid items={[
        { to: '/cloud',              label: 'Song Cloud',        desc: 'Force-directed genre connection map' },
        { to: '/word-cloud',         label: 'Word Cloud',        desc: 'Lyric word cloud with spiral layout' },
        { to: '/song-nodes',         label: 'Song Nodes',        desc: 'Cytoscape.js song network graph' },
        { to: '/cinema',             label: 'Cinema Mode',       desc: 'Full-screen immersive presentation' },
        { to: '/cinema/lyrics',      label: 'Lyrics Universe',   desc: 'Animated lyric particles in space' },
        { to: '/cinema/lyrics-flow', label: 'Lyrics Flow',       desc: 'Flowing lyric stream visualization' },
        { to: '/spectrum-studio',    label: 'Spectrum Studio',   desc: 'Interactive spectrum exploration' },
      ]} />

      {/* ── Community ── */}
      <SectionHeading label="Community" />
      <ToolGrid items={[
        { to: '/social',         label: 'Social',            desc: 'AI social post generator' },
        { to: '/social-planner', label: 'Content Planner',   desc: 'Schedule and plan social content' },
        { to: '/trivia',         label: 'Trivia',            desc: 'DB-powered music trivia + social export' },
        { to: '/settings',       label: 'Settings',          desc: 'Stopwords, icons, app configuration' },
      ]} />

      {/* ── Admin — Batch & Analysis ── */}
      <SectionHeading label="Admin — Batch & Analysis" />
      <ToolGrid items={[
        { to: '/admin/ai-batch',       label: 'AI Batch Runner',       desc: 'Generate AI data for all songs at once' },
        { to: '/admin/data-health',    label: 'Data Health',           desc: 'Scan what every song is missing' },
        { to: '/admin/lyrics-batch',   label: 'Lyrics Batch Fetch',    desc: 'Fetch missing lyrics in bulk' },
        { to: '/admin/missing-lyrics', label: 'Missing Lyrics',        desc: 'Scanner for songs without lyrics' },
        { to: '/admin/missing-artwork',label: 'Missing Artwork',       desc: 'Find and fill in missing album art' },
      ]} />

      {/* ── Admin — Content ── */}
      <SectionHeading label="Admin — Content" />
      <ToolGrid items={[
        { to: '/admin/bootlegs',  label: 'Bootleg Importer',  desc: 'Import unofficial live recordings' },
        { to: '/admin/knowledge', label: 'AI Knowledge Feed', desc: 'Feed context to the AI engine' },
        { to: '/admin/data-grid', label: 'Data Grid',         desc: 'Spreadsheet-style song data editor' },
        { to: '/admin/game',      label: 'Album Art Quiz',    desc: 'Leaderboard and quiz admin panel' },
      ]} />

      {/* ── Admin — Vinyl Runner ── */}
      <SectionHeading label="Admin — Vinyl Runner" />
      <ToolGrid items={[
        { to: '/admin/platformer',        label: 'Skins & Config',  desc: 'Character skins, body skins, assets, physics config' },
        { to: '/admin/platformer-levels', label: 'Level Designer',  desc: 'Build and save custom levels for players' },
        { to: '/play/platformer',         label: 'Play Vinyl Runner', desc: 'Launch the game as a player' },
      ]} />

      {/* ── Admin — Users & Site ── */}
      <SectionHeading label="Admin — Users & Site" />
      <ToolGrid items={[
        { to: '/admin/users',         label: 'User Moderation',      desc: 'Manage users and community access' },
        { to: '/admin/contributions', label: 'Contributions',        desc: 'Review band submissions from users' },
        { to: '/admin/hub',           label: 'Admin Hub',            desc: 'Central admin overview and quick links' },
        { to: '/admin/db-health',     label: 'DB Health',            desc: 'Database connection and query health' },
        { to: '/admin/db',            label: 'DB Migrations',        desc: 'Run and review Prisma migrations' },
        { to: '/settings?tab=icons',  label: 'App Icons & Branding', desc: 'Favicon, PWA icons, logo' },
        { to: '/view',                label: 'Public Site',          desc: 'Public read-only viewer — no login', newTab: true },
      ]} />
    </div>
  );
}
