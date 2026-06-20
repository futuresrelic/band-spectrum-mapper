import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { analysisApi } from '../api/analysis';
import type { AudienceDimensions } from '@band-spectrum-mapper/shared';

interface DimMeta {
  key: keyof AudienceDimensions;
  label: string;
  color: string;
}

const DIMS: DimMeta[] = [
  { key: 'progressive',     label: 'Progressive',     color: '#6366f1' },
  { key: 'heavy',           label: 'Heavy',           color: '#ef4444' },
  { key: 'technical',       label: 'Technical',       color: '#0ea5e9' },
  { key: 'atmospheric',     label: 'Atmospheric',     color: '#14b8a6' },
  { key: 'experimental',    label: 'Experimental',    color: '#a855f7' },
  { key: 'accessible',      label: 'Accessible',      color: '#22c55e' },
  { key: 'psychedelic',     label: 'Psychedelic',     color: '#ec4899' },
  { key: 'emotional',       label: 'Emotional',       color: '#f59e0b' },
  { key: 'aggressive',      label: 'Aggressive',      color: '#f97316' },
  { key: 'improvisational', label: 'Improvisational', color: '#8b5cf6' },
];

interface BarProps {
  dim: DimMeta;
  value: number;
  rationale?: string;
}

function DimBar({ dim, value, rationale }: BarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="w-full text-left group"
        onClick={() => rationale && setOpen((o) => !o)}
        title={rationale ? (open ? 'Hide rationale' : 'Show rationale') : undefined}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-surface-700 group-hover:text-surface-900 transition-colors">
            {dim.label}
          </span>
          <span className="text-xs font-mono text-surface-500">{value}</span>
        </div>
        <div className="h-2 w-full bg-surface-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${value}%`, backgroundColor: dim.color }}
          />
        </div>
      </button>
      {open && rationale && (
        <p className="mt-1.5 text-xs text-surface-600 italic pl-0.5 leading-relaxed">
          {rationale}
        </p>
      )}
    </div>
  );
}

// ── Song panel ────────────────────────────────────────────────────────────────

interface SongPanelProps {
  songId: string;
  compact?: boolean;
}

export function SongAudienceProfilePanel({ songId, compact }: SongPanelProps) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['audience-profile', songId],
    queryFn: () => analysisApi.getAudienceProfile(songId),
    retry: false,
    staleTime: Infinity,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateAudienceProfile(songId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audience-profile', songId] }),
  });

  return (
    <div className={compact ? '' : 'card mt-6'}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3>Audience Identity Profile</h3>
          <p className="text-xs text-surface-500 mt-0.5">
            10 dimensions describing who this song appeals to and what it sounds like (0–100).
            {profile && !compact && (
              <span className="ml-1 text-surface-400">
                Click any bar to see the AI rationale.
              </span>
            )}
          </p>
        </div>
        {user?.isAdmin && (
          <button
            className="btn-secondary text-xs ml-4 flex-shrink-0"
            onClick={() => regen.mutate()}
            disabled={regen.isPending || isLoading}
          >
            {regen.isPending ? 'Scoring…' : profile ? 'Regenerate' : 'Generate'}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-surface-500">Loading…</p>}

      {error && !profile && (
        <p className="text-sm text-surface-500 italic">
          {user?.isAdmin
            ? 'No profile yet. Click Generate to create one (uses 1 AI call).'
            : 'No audience profile yet.'}
        </p>
      )}

      {profile && (
        <div className="space-y-3">
          {DIMS.map((dim) => (
            <DimBar
              key={dim.key}
              dim={dim}
              value={profile[dim.key]}
              rationale={profile.rationales[dim.key]}
            />
          ))}
          <p className="text-xs text-surface-400 pt-1 border-t border-surface-100">
            Generated {new Date(profile.updatedAt).toLocaleDateString()} · AI identity profile
          </p>
        </div>
      )}
    </div>
  );
}

// ── Album panel ───────────────────────────────────────────────────────────────

interface AlbumPanelProps {
  albumId: string;
}

export function AlbumAudienceProfilePanel({ albumId }: AlbumPanelProps) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['album-audience-profile', albumId],
    queryFn: () => analysisApi.getAlbumAudienceProfile(albumId),
    retry: false,
    staleTime: Infinity,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateAlbumAudienceProfile(albumId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['album-audience-profile', albumId] }),
  });

  return (
    <div className="card mt-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3>Audience Identity Profile</h3>
          <p className="text-xs text-surface-500 mt-0.5">
            Averaged from {profile ? `${profile.songCount} song${profile.songCount !== 1 ? 's' : ''}` : 'songs'} with profiles.
            Run the Audience Profile batch on songs first.
          </p>
        </div>
        {user?.isAdmin && (
          <button
            className="btn-secondary text-xs ml-4 flex-shrink-0"
            onClick={() => regen.mutate()}
            disabled={regen.isPending || isLoading}
          >
            {regen.isPending ? 'Aggregating…' : 'Recalculate'}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-surface-500">Loading…</p>}

      {error && !profile && (
        <p className="text-sm text-surface-500 italic">
          No profile yet. Score songs via the AI Batch Runner, then click Recalculate.
        </p>
      )}

      {profile && profile.songCount === 0 && (
        <p className="text-sm text-surface-500 italic">
          No song audience profiles found for this album yet. Run the Audience Profile batch on songs first.
        </p>
      )}

      {profile && profile.songCount > 0 && (
        <div className="space-y-3">
          {DIMS.map((dim) => (
            <DimBar key={dim.key} dim={dim} value={profile[dim.key]} />
          ))}
          <p className="text-xs text-surface-400 pt-1 border-t border-surface-100">
            Updated {new Date(profile.updatedAt).toLocaleDateString()} · Average of {profile.songCount} song profile{profile.songCount !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Band panel ────────────────────────────────────────────────────────────────

interface BandPanelProps {
  bandId: string;
}

export function BandAudienceProfilePanel({ bandId }: BandPanelProps) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['band-audience-profile', bandId],
    queryFn: () => analysisApi.getBandAudienceProfile(bandId),
    retry: false,
    staleTime: Infinity,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateBandAudienceProfile(bandId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['band-audience-profile', bandId] }),
  });

  return (
    <div className="card mt-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3>Audience Identity Profile</h3>
          <p className="text-xs text-surface-500 mt-0.5">
            Averaged from {profile ? `${profile.songCount} song${profile.songCount !== 1 ? 's' : ''}` : 'songs'} with profiles.
            Describes who this band appeals to and what they sound like overall.
          </p>
        </div>
        {user?.isAdmin && (
          <button
            className="btn-secondary text-xs ml-4 flex-shrink-0"
            onClick={() => regen.mutate()}
            disabled={regen.isPending || isLoading}
          >
            {regen.isPending ? 'Aggregating…' : 'Recalculate'}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-surface-500">Loading…</p>}

      {error && !profile && (
        <p className="text-sm text-surface-500 italic">
          No profile yet. Score songs via the AI Batch Runner, then click Recalculate.
        </p>
      )}

      {profile && profile.songCount === 0 && (
        <p className="text-sm text-surface-500 italic">
          No song audience profiles found for this band yet. Run the Audience Profile batch on songs first.
        </p>
      )}

      {profile && profile.songCount > 0 && (
        <div className="space-y-3">
          {DIMS.map((dim) => (
            <DimBar key={dim.key} dim={dim} value={profile[dim.key]} />
          ))}
          <p className="text-xs text-surface-400 pt-1 border-t border-surface-100">
            Updated {new Date(profile.updatedAt).toLocaleDateString()} · Average of {profile.songCount} song profile{profile.songCount !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
