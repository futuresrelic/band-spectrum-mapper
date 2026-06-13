import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SCORE_AXES, AXIS_LABELS } from '@band-spectrum-mapper/shared';
import type {
  SongSpectrumAnalysis,
  YouTubeMetadata,
  AudioAnalysisResult,
  MusicBrainzSongData,
  RhythmResearch,
  ScoreAxisDetail,
  RhythmBand,
  RhythmAnalysisResult,
} from '@band-spectrum-mapper/shared';
import { songSpectrumApi } from '../api/songSpectrum';
import { api } from '../lib/api';
import WaveformViz from '../components/songSpectrum/WaveformViz';
import SpectrogramViz from '../components/songSpectrum/SpectrogramViz';
import SectionTimeline from '../components/songSpectrum/SectionTimeline';
import ScoreBreakdown from '../components/songSpectrum/ScoreBreakdown';
import AudioUploader from '../components/songSpectrum/AudioUploader';
import RhythmRadarCanvas from '../components/songSpectrum/RhythmRadarCanvas';

// ---------------------------------------------------------------------------
// Radar chart — pure SVG, six-axis, dark style
// ---------------------------------------------------------------------------

const AXIS_COLORS: Record<string, string> = {
  aggression: '#ef4444',
  complexity:  '#f59e0b',
  atmosphere:  '#3b82f6',
  emotion:     '#ec4899',
  psychedelic: '#8b5cf6',
  concept:     '#10b981',
};

function SpectrumRadar({ scores }: { scores: Record<string, number> }) {
  const W = 300, H = 300;
  const cx = W / 2, cy = H / 2, R = 100;
  const N = SCORE_AXES.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const px = (i: number, f: number) => cx + f * R * Math.cos(angle(i));
  const py = (i: number, f: number) => cy + f * R * Math.sin(angle(i));

  const poly = SCORE_AXES.map((ax, i) => {
    const f = (scores[ax] ?? 0) / 100;
    return `${px(i, f)},${py(i, f)}`;
  }).join(' ');

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ overflow: 'visible' }}>
      {/* Grid rings */}
      {gridLevels.map((lvl) => {
        const pts = SCORE_AXES.map((_, i) => `${px(i, lvl)},${py(i, lvl)}`).join(' ');
        return <polygon key={lvl} points={pts} fill="none" stroke="#1e293b" strokeWidth="1" />;
      })}

      {/* Axis spokes */}
      {SCORE_AXES.map((_, i) => (
        <line
          key={i}
          x1={cx} y1={cy}
          x2={px(i, 1)} y2={py(i, 1)}
          stroke="#1e293b" strokeWidth="1"
        />
      ))}

      {/* Score polygon */}
      <polygon
        points={poly}
        fill="rgba(99,102,241,0.2)"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Axis dots + labels */}
      {SCORE_AXES.map((ax, i) => {
        const f = (scores[ax] ?? 0) / 100;
        const labelX = px(i, 1.22);
        const labelY = py(i, 1.22);
        const dotX = px(i, f);
        const dotY = py(i, f);
        return (
          <g key={ax}>
            <circle cx={dotX} cy={dotY} r={4} fill={AXIS_COLORS[ax] ?? '#6366f1'} />
            <text
              x={labelX}
              y={labelY}
              textAnchor={labelX < cx - 5 ? 'end' : labelX > cx + 5 ? 'start' : 'middle'}
              dominantBaseline="middle"
              fontSize="11"
              fontWeight="600"
              fill={AXIS_COLORS[ax] ?? '#a5b4fc'}
            >
              {AXIS_LABELS[ax as keyof typeof AXIS_LABELS] ?? ax} {scores[ax] ?? 0}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// YouTube metadata panel
// ---------------------------------------------------------------------------

function formatIsoDuration(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = parseInt(m[1] ?? '0', 10);
  const min = parseInt(m[2] ?? '0', 10);
  const sec = parseInt(m[3] ?? '0', 10);
  const parts = [];
  if (h) parts.push(`${h}h`);
  parts.push(`${min}m ${sec}s`);
  return parts.join(' ');
}

function YouTubeMetaPanel({ meta }: { meta: YouTubeMetadata }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-surface-800 rounded-lg p-4 flex gap-4">
      {meta.thumbnailUrl && (
        <img
          src={meta.thumbnailUrl}
          alt="thumbnail"
          className="w-24 h-14 object-cover rounded shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{meta.title}</div>
        <div className="text-xs text-surface-400 mt-0.5">
          {meta.channel}
          {meta.duration && ` · ${formatIsoDuration(meta.duration)}`}
          {meta.publishedAt && ` · ${new Date(meta.publishedAt).getFullYear()}`}
        </div>
        {meta.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {meta.tags.slice(0, 6).map((t) => (
              <span key={t} className="text-xs bg-surface-700 text-surface-300 rounded px-1.5 py-0.5">
                {t}
              </span>
            ))}
          </div>
        )}
        {meta.description && (
          <div>
            <p className={`text-xs text-surface-500 mt-1.5 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              {meta.description}
            </p>
            {meta.description.length > 120 && (
              <button
                className="text-xs text-indigo-400 hover:text-indigo-300 mt-0.5"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio features summary table
// ---------------------------------------------------------------------------

function AudioFeatureTable({ audio }: { audio: AudioAnalysisResult }) {
  const f = audio.features;
  const rows: [string, string][] = [
    ['BPM', `${audio.bpm.toFixed(1)} (confidence: ${(audio.bpmConfidence * 100).toFixed(0)}%)`],
    ['Key', `${audio.key} (confidence: ${(audio.keyConfidence * 100).toFixed(0)}%)`],
    ['Time signature', audio.timeSignature ?? '—'],
    ['Polyrhythmic', audio.polyrhythmic ? 'Yes' : 'No'],
    ['Duration', `${Math.floor(audio.duration / 60)}:${String(Math.round(audio.duration % 60)).padStart(2, '0')}`],
    ['Mean loudness', `${audio.loudness.meanDb.toFixed(1)} dBFS`],
    ['Dynamic range', `${audio.loudness.dynamicRange.toFixed(1)} dB`],
    ['Sections', `${audio.sections.length}`],
    ['Rhythmic density', `${f.rhythmicDensity.toFixed(2)} onsets/s`],
    ['Transient density', `${f.transientDensity.toFixed(2)}/s`],
    ['Spectral centroid', `${(f.spectralCentroid / 1000).toFixed(2)} kHz`],
    ['Zero-crossing rate', f.zeroCrossingRate.toFixed(4)],
  ];

  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-surface-700/50">
            <td className="py-1.5 pr-3 text-surface-400 font-medium whitespace-nowrap">{label}</td>
            <td className="py-1.5 text-surface-200 font-mono">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Previous analyses list
// ---------------------------------------------------------------------------

function AnalysisList({
  analyses,
  selectedId,
  onSelect,
  onDelete,
}: {
  analyses: SongSpectrumAnalysis[];
  selectedId: string | null;
  onSelect: (a: SongSpectrumAnalysis) => void;
  onDelete: (id: string) => void;
}) {
  if (!analyses.length) {
    return (
      <div className="text-xs text-surface-500 text-center py-6">
        No analyses yet
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {analyses.map((a) => (
        <li
          key={a.id}
          className={`group flex items-start gap-2 px-2 py-2 rounded cursor-pointer text-xs transition-colors
            ${selectedId === a.id ? 'bg-surface-700' : 'hover:bg-surface-800'}`}
          onClick={() => onSelect(a)}
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium text-white truncate">{a.songTitle}</div>
            <div className="text-surface-400 truncate">{a.artistName}</div>
            {Object.keys(a.scores).length > 0 && (
              <div className="text-surface-600 mt-0.5">
                {SCORE_AXES.filter((ax) => a.scores[ax] !== undefined)
                  .map((ax) => `${ax.slice(0,3).toUpperCase()} ${a.scores[ax]}`)
                  .join(' · ')}
              </div>
            )}
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-all shrink-0"
            onClick={(e) => { e.stopPropagation(); onDelete(a.id); }}
            title="Delete"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// MusicBrainz metadata panel
// ---------------------------------------------------------------------------

function MusicBrainzPanel({ data }: { data: MusicBrainzSongData }) {
  const allTags = [...data.genres, ...data.tags].slice(0, 14);
  return (
    <div className="bg-surface-800/50 border border-surface-700/50 rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-surface-400">
          MusicBrainz
        </span>
        {data.releaseTitle && (
          <span className="text-xs text-surface-500">
            {data.releaseTitle}{data.releaseDate ? ` · ${data.releaseDate.slice(0, 4)}` : ''}
          </span>
        )}
      </div>
      {data.disambiguation && (
        <p className="text-xs text-surface-400 italic">{data.disambiguation}</p>
      )}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.genres.map((g) => (
            <span key={g} className="text-xs bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 rounded px-2 py-0.5">
              {g}
            </span>
          ))}
          {data.tags.slice(0, 8).map((t) => (
            <span key={t} className="text-xs bg-surface-700 text-surface-400 rounded px-2 py-0.5">
              {t}
            </span>
          ))}
        </div>
      )}
      {allTags.length === 0 && (
        <p className="text-xs text-surface-600">No genre tags found in MusicBrainz.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rhythm research panel — GPT-sourced known time signature data
// ---------------------------------------------------------------------------

function RhythmResearchPanel({ data }: { data: RhythmResearch }) {
  return (
    <div className="bg-surface-800/50 border border-indigo-700/40 rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">
          Rhythm Research
        </span>
        <span className="text-xs text-surface-600">{data.model}</span>
      </div>

      {data.timeSignatures.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-surface-400 shrink-0">Time signatures:</span>
          {data.timeSignatures.map((ts) => (
            <span
              key={ts}
              className="text-sm font-mono font-bold bg-indigo-900/70 text-indigo-200 border border-indigo-600/50 rounded px-2 py-0.5"
            >
              {ts}
            </span>
          ))}
          {data.polyrhythmic && (
            <span className="text-xs bg-amber-900/50 text-amber-300 border border-amber-700/50 rounded px-2 py-0.5">
              Polyrhythmic
            </span>
          )}
          {data.bpmRange && (
            <span className="text-xs text-surface-500 font-mono">{data.bpmRange}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-surface-600">No known time signature data found.</p>
      )}

      {data.notes && (
        <p className="text-xs text-surface-300 leading-relaxed">{data.notes}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library band/song picker — links analysis to an existing library song
// ---------------------------------------------------------------------------

interface LibraryBand { id: string; name: string }
interface LibrarySong { id: string; title: string }

function LibrarySongPicker({
  selectedBandId,
  selectedSongId,
  onSelect,
  onClear,
}: {
  selectedBandId: string | null;
  selectedSongId: string | null;
  onSelect: (bandId: string, bandName: string, songId: string, songTitle: string) => void;
  onClear: () => void;
}) {
  const [bandId, setBandId] = useState<string>(selectedBandId ?? '');

  const { data: bands = [] } = useQuery<LibraryBand[]>({
    queryKey: ['bands-slim'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/api/bands').then((bs) =>
      bs.map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name))
    ),
  });

  const { data: songs = [] } = useQuery<LibrarySong[]>({
    queryKey: ['band-songs-slim', bandId],
    queryFn: () => api.get<{ id: string; title: string }[]>(`/api/bands/${bandId}/songs`).then((ss) =>
      ss.map((s) => ({ id: s.id, title: s.title }))
    ),
    enabled: Boolean(bandId),
  });

  const selectedBandName = bands.find((b) => b.id === bandId)?.name ?? '';

  function handleBandChange(id: string) {
    setBandId(id);
    if (!id) onClear();
  }

  function handleSongChange(songId: string) {
    if (!songId || !bandId) return;
    const song = songs.find((s) => s.id === songId);
    if (song) onSelect(bandId, selectedBandName, song.id, song.title);
  }

  return (
    <div className="bg-surface-800/60 border border-surface-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-surface-300 uppercase tracking-wider">
          Link to Library Song
        </span>
        {selectedSongId && (
          <button
            className="text-xs text-surface-500 hover:text-red-400 transition-colors"
            onClick={onClear}
          >
            Unlink
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-surface-400 mb-1">Band</label>
          <select
            className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            value={bandId}
            onChange={(e) => handleBandChange(e.target.value)}
          >
            <option value="">— select band —</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-surface-400 mb-1">Song</label>
          <select
            className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-40"
            disabled={!bandId || songs.length === 0}
            value={selectedSongId ?? ''}
            onChange={(e) => handleSongChange(e.target.value)}
          >
            <option value="">— select song —</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedSongId && (
        <p className="text-xs text-indigo-400">
          Linked: {selectedBandName} — {songs.find((s) => s.id === selectedSongId)?.title ?? selectedSongId}
        </p>
      )}
      {!selectedSongId && (
        <p className="text-xs text-surface-600">
          Optional — links the analysis to the library song so lyrics context is available.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rhythm Lab — frequency-isolated percussion analysis
// ---------------------------------------------------------------------------

const BAND_COLORS_RL = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

const DEFAULT_RHYTHM_BANDS: RhythmBand[] = [
  { label: 'Kick',   minHz: 40,   maxHz: 120 },
  { label: 'Snare',  minHz: 150,  maxHz: 600 },
  { label: 'Hi-hat', minHz: 5000, maxHz: 12000 },
  { label: 'Cymbal', minHz: 8000, maxHz: 18000 },
];

const RHYTHM_PRESETS: Record<string, RhythmBand[]> = {
  Percussion: [
    { label: 'Kick',   minHz: 40,   maxHz: 120 },
    { label: 'Snare',  minHz: 150,  maxHz: 600 },
    { label: 'Hi-hat', minHz: 5000, maxHz: 12000 },
    { label: 'Cymbal', minHz: 8000, maxHz: 18000 },
  ],
  'Perc Full': [
    { label: 'Kick',        minHz: 40,   maxHz: 120 },
    { label: 'Snare Body',  minHz: 150,  maxHz: 600 },
    { label: 'Snare Crack', minHz: 2000, maxHz: 5000 },
    { label: 'Hi-hat',      minHz: 5000, maxHz: 12000 },
    { label: 'Cymbal',      minHz: 8000, maxHz: 18000 },
  ],
  'Spectrum': [
    { label: 'Sub Bass', minHz: 20,   maxHz: 80 },
    { label: 'Bass',     minHz: 80,   maxHz: 250 },
    { label: 'Low Mid',  minHz: 250,  maxHz: 1000 },
    { label: 'High Mid', minHz: 1000, maxHz: 4000 },
    { label: 'High',     minHz: 4000, maxHz: 20000 },
  ],
};

const TIME_SIGS_RL = [
  { label: '2/4',  beats: 2 },
  { label: '3/4',  beats: 3 },
  { label: '4/4',  beats: 4 },
  { label: '5/4',  beats: 5 },
  { label: '6/8',  beats: 6 },
  { label: '7/8',  beats: 7 },
  { label: '9/8',  beats: 9 },
  { label: '12/8', beats: 12 },
];

function drawRhythmTimeline(
  canvas: HTMLCanvasElement,
  result: RhythmAnalysisResult,
  beatBpm: number,
  timeSigBeats: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.scale(dpr, dpr);

  const W = canvas.width / dpr;
  const ROW_H = 72;
  const AXIS_H = 24;
  const bands = result.bands;
  const duration = result.duration;

  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, W, bands.length * ROW_H + AXIS_H);

  // Beat / bar grid
  const beatSec = 60.0 / Math.max(beatBpm, 1);
  const barSec = beatSec * timeSigBeats;
  for (let t = 0; t <= duration + 0.001; t += beatSec) {
    const x = (t / duration) * W;
    const isBar = barSec > 0 && (t % barSec) < beatSec * 0.05;
    ctx.strokeStyle = isBar ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = isBar ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, bands.length * ROW_H);
    ctx.stroke();
  }

  bands.forEach((band, i) => {
    const y0 = i * ROW_H;
    const yMid = y0 + ROW_H / 2;
    const color = BAND_COLORS_RL[i % BAND_COLORS_RL.length]!;

    // Row divider
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y0 + ROW_H);
    ctx.lineTo(W, y0 + ROW_H);
    ctx.stroke();

    // Envelope fill (mirrored)
    if (band.envelope.length > 1) {
      ctx.fillStyle = `${color}18`;
      ctx.beginPath();
      ctx.moveTo(0, yMid);
      band.envelope.forEach((v, idx) => {
        const ex = (idx / (band.envelope.length - 1)) * W;
        ctx.lineTo(ex, yMid - v * ROW_H * 0.42);
      });
      for (let idx = band.envelope.length - 1; idx >= 0; idx--) {
        const v = band.envelope[idx] ?? 0;
        const ex = (idx / (band.envelope.length - 1)) * W;
        ctx.lineTo(ex, yMid + v * ROW_H * 0.42);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = `${color}50`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      band.envelope.forEach((v, idx) => {
        const ex = (idx / (band.envelope.length - 1)) * W;
        const ey = yMid - v * ROW_H * 0.42;
        if (idx === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
      });
      ctx.stroke();
    }

    // Onset tick marks
    ctx.fillStyle = color;
    band.onsetTimes.forEach((t) => {
      const x = (t / duration) * W;
      ctx.fillRect(x - 0.75, y0 + ROW_H * 0.12, 1.5, ROW_H * 0.76);
    });

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${band.label}  ${band.minHz}–${band.maxHz} Hz`, 5, y0 + 13);

    if (band.bandBpm > 0) {
      ctx.fillStyle = color;
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${band.bandBpm.toFixed(0)} bpm`, W - 5, y0 + 13);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${band.onsetCount} onsets`, W - 5, y0 + ROW_H - 6);
  });

  // Time axis
  const axisY = bands.length * ROW_H;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, axisY, W, AXIS_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, axisY);
  ctx.lineTo(W, axisY);
  ctx.stroke();

  const tickEvery = duration > 60 ? 5 : duration > 20 ? 2 : 1;
  for (let s = 0; s <= Math.ceil(duration); s += tickEvery) {
    if (s > duration) break;
    const x = (s / duration) * W;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, axisY + 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${s}s`, x, axisY + AXIS_H - 4);
  }

  ctx.restore();
}

function friendlyWorkerError(raw: string): string {
  if (raw.includes('429') || raw.includes('Too Many Requests') || raw.includes('Sign in to confirm')) {
    return 'YouTube is rate-limiting this server (HTTP 429). Try uploading the audio file directly instead — use the "Upload Audio" section on the left.';
  }
  if (raw.includes('yt-dlp failed')) {
    const inner = raw.replace(/^.*?"detail"\s*:\s*"yt-dlp failed:\s*/i, '').replace(/"?\}?\s*$/, '');
    const firstLine = inner.split(/\\n/)[0] ?? inner;
    return `YouTube download failed: ${firstLine.slice(0, 200)}`;
  }
  if (
    raw.includes('502') || raw.includes('503') ||
    raw.includes('Audio worker error (502)') || raw.includes('Audio worker error (503)')
  ) {
    return 'The audio worker was starting up and the first request failed (this is normal after a period of inactivity). The server will retry automatically — if this message persists, please try again in 15 seconds.';
  }
  return raw;
}

// Keep old name as alias so all callers work without changes
const friendlyRlError = friendlyWorkerError;

function RhythmLabPanel({
  analysisYoutubeUrl,
  youtubeAudioEnabled,
}: {
  analysisYoutubeUrl: string | null;
  youtubeAudioEnabled: boolean;
}) {
  const [bands, setBands] = useState<RhythmBand[]>(DEFAULT_RHYTHM_BANDS);
  const [rhythmFile, setRhythmFile] = useState<File | null>(null);
  const [result, setResult] = useState<RhythmAnalysisResult | null>(null);
  const [beatBpm, setBeatBpm] = useState(120);
  const [timeSigBeats, setTimeSigBeats] = useState(4);
  const [rlError, setRlError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fileMutation = useMutation({
    mutationFn: (file: File) => songSpectrumApi.analyzeRhythmBands(file, bands),
    onSuccess: (r) => { setResult(r); setBeatBpm(Math.round(r.globalBpm)); setRlError(null); },
    onError: (e: Error) => setRlError(friendlyRlError(e.message)),
  });

  const ytMutation = useMutation({
    mutationFn: () => songSpectrumApi.analyzeRhythmBandsFromYouTube(analysisYoutubeUrl!, bands),
    onSuccess: (r) => { setResult(r); setBeatBpm(Math.round(r.globalBpm)); setRlError(null); },
    onError: (e: Error) => setRlError(friendlyRlError(e.message)),
  });

  const isPending = fileMutation.isPending || ytMutation.isPending;

  useEffect(() => {
    if (!result || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const ROW_H = 72;
    const AXIS_H = 24;
    const cssW = containerRef.current.offsetWidth;
    const cssH = result.bands.length * ROW_H + AXIS_H;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    drawRhythmTimeline(canvas, result, beatBpm, timeSigBeats);
  }, [result, beatBpm, timeSigBeats]);

  function applyPreset(key: string) {
    const preset = RHYTHM_PRESETS[key];
    if (preset) setBands([...preset]);
  }

  function updateBand(idx: number, field: keyof RhythmBand, value: string | number) {
    setBands((prev) => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  }

  function addBand() {
    setBands((prev) => [...prev, { label: `Band ${prev.length + 1}`, minHz: 100, maxHz: 500 }]);
  }

  function removeBand(idx: number) {
    setBands((prev) => prev.filter((_, i) => i !== idx));
  }

  const canRunFile = rhythmFile !== null && !isPending && bands.length > 0;
  const canRunYt = youtubeAudioEnabled && Boolean(analysisYoutubeUrl) && !isPending && bands.length > 0;
  const showYtPanel = youtubeAudioEnabled || Boolean(analysisYoutubeUrl);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Rhythm Lab</span>
        <span className="text-xs text-surface-500">— frequency-isolated percussion analysis</span>
      </div>

      {/* Preset picker */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-surface-400">Presets:</span>
        {Object.keys(RHYTHM_PRESETS).map((key) => (
          <button
            key={key}
            className="px-2 py-1 text-xs bg-surface-700 hover:bg-surface-600 text-surface-200 rounded transition-colors"
            onClick={() => applyPreset(key)}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Band table */}
      <div className="bg-surface-800/50 rounded-lg overflow-hidden border border-surface-700/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-700">
              <th className="px-3 py-2 text-left text-surface-400 font-medium w-8"> </th>
              <th className="px-3 py-2 text-left text-surface-400 font-medium">Label</th>
              <th className="px-3 py-2 text-left text-surface-400 font-medium">Min Hz</th>
              <th className="px-3 py-2 text-left text-surface-400 font-medium">Max Hz</th>
              <th className="px-2 py-2 w-8"> </th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band, i) => {
              const color = BAND_COLORS_RL[i % BAND_COLORS_RL.length]!;
              return (
                <tr key={i} className="border-b border-surface-700/40">
                  <td className="px-3 py-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="w-full bg-surface-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={band.label}
                      onChange={(e) => updateBand(i, 'label', e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      className="w-24 bg-surface-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={band.minHz}
                      min={20} max={19999} step={10}
                      onChange={(e) => updateBand(i, 'minHz', Number(e.target.value))}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      className="w-24 bg-surface-700 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={band.maxHz}
                      min={21} max={20000} step={10}
                      onChange={(e) => updateBand(i, 'maxHz', Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      className="text-surface-500 hover:text-red-400 transition-colors"
                      onClick={() => removeBand(i)}
                      disabled={bands.length <= 1}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-3 py-2">
          <button
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-40"
            onClick={addBand}
            disabled={bands.length >= 8}
          >
            + Add band
          </button>
        </div>
      </div>

      {/* Audio source */}
      <div className={`grid gap-4 ${showYtPanel ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-sm'}`}>
        <div className="border border-dashed border-surface-700 rounded-lg p-4 space-y-2">
          <div className="text-xs font-semibold text-surface-300">Upload Audio</div>
          <input
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,.opus"
            className="text-xs text-surface-400 file:mr-2 file:text-xs file:bg-surface-700 file:text-white file:border-0 file:rounded file:px-2 file:py-1 file:cursor-pointer"
            onChange={(e) => setRhythmFile(e.target.files?.[0] ?? null)}
          />
          {rhythmFile && <div className="text-xs text-surface-400 truncate">{rhythmFile.name}</div>}
          <button
            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!canRunFile}
            onClick={() => rhythmFile && fileMutation.mutate(rhythmFile)}
          >
            {fileMutation.isPending ? 'Analyzing…' : 'Analyze Rhythm'}
          </button>
        </div>

        {showYtPanel && (
          <div className="border border-dashed border-purple-700/40 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-surface-300">From YouTube</span>
              <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-700/50 rounded px-1.5 py-0.5">local only</span>
            </div>
            {analysisYoutubeUrl ? (
              <div className="text-xs text-surface-500 truncate">{analysisYoutubeUrl}</div>
            ) : (
              <div className="text-xs text-surface-600">No YouTube URL on this analysis.</div>
            )}
            {!youtubeAudioEnabled && (
              <p className="text-xs text-surface-600">
                Set <code className="text-amber-400">ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true</code> to enable.
              </p>
            )}
            {youtubeAudioEnabled && (
              <button
                className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!canRunYt}
                onClick={() => ytMutation.mutate()}
              >
                {ytMutation.isPending ? 'Downloading & analyzing…' : 'Analyze from YouTube'}
              </button>
            )}
          </div>
        )}
      </div>

      {rlError && (
        <div className="text-xs bg-red-900/20 border border-red-700/30 rounded px-3 py-2 space-y-1">
          <p className="text-red-400">{rlError}</p>
          {(rlError.includes('rate-limiting') || rlError.includes('429')) && (
            <p className="text-surface-400">
              YouTube blocks audio downloads from cloud servers unpredictably.
              Download the song as an MP3 locally and use the "Upload Audio" option instead.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-xs bg-indigo-900/60 text-indigo-200 border border-indigo-700/50 rounded px-2 py-1 font-mono">
              {result.globalBpm.toFixed(1)} BPM
            </span>
            <span className={`text-xs rounded px-2 py-1 font-mono border ${
              result.polyrhythmScore > 0.3
                ? 'bg-amber-900/50 text-amber-300 border-amber-700/50'
                : 'bg-surface-700 text-surface-300 border-surface-600'
            }`}>
              Polyrhythm {(result.polyrhythmScore * 100).toFixed(0)}%
            </span>
            <span className="text-xs text-surface-500">{result.duration.toFixed(1)}s analyzed</span>
          </div>

          {/* Beat grid controls */}
          <div className="bg-surface-800/40 rounded-lg p-3 flex flex-wrap gap-4 items-center border border-surface-700/40">
            <div className="flex items-center gap-2 flex-1 min-w-44">
              <span className="text-xs text-surface-400 shrink-0 w-16">Beat BPM</span>
              <input
                type="range"
                min={40} max={300} step={0.5}
                value={beatBpm}
                onChange={(e) => setBeatBpm(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-xs font-mono text-white w-12 text-right">{beatBpm.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-surface-400 shrink-0">Grid</span>
              {TIME_SIGS_RL.map(({ label, beats }) => (
                <button
                  key={label}
                  className={`text-xs px-2 py-0.5 rounded transition-colors font-mono ${
                    timeSigBeats === beats
                      ? 'bg-indigo-600 text-white'
                      : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                  }`}
                  onClick={() => setTimeSigBeats(beats)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas timeline */}
          <div ref={containerRef} className="w-full rounded-lg overflow-hidden border border-surface-700/50">
            <canvas ref={canvasRef} className="block w-full" />
          </div>

          {/* Cross-rhythms */}
          {result.crossRhythms.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-2">Cross-Rhythms</div>
              <div className="flex flex-wrap gap-2">
                {result.crossRhythms.map((cr, i) => (
                  <div
                    key={i}
                    className="text-xs bg-amber-900/30 border border-amber-700/40 rounded px-2 py-1 text-amber-300 font-mono"
                  >
                    {cr.bandA} : {cr.bandB} = <strong>{cr.ratio}</strong>
                    <span className="text-amber-600 ml-1">({(cr.confidence * 100).toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bar length candidates */}
          {result.globalBarCandidates.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-2">Bar Length Candidates</div>
              <div className="flex flex-wrap gap-2">
                {result.globalBarCandidates.map((c, i) => (
                  <button
                    key={i}
                    className="text-xs bg-surface-700 hover:bg-surface-600 text-surface-200 rounded px-2 py-1 font-mono transition-colors"
                    title={`Apply ${c.beats}-beat bar to grid`}
                    onClick={() => setTimeSigBeats(c.beats)}
                  >
                    {c.beats} beats · {c.lengthSec.toFixed(2)}s
                    <span className={`ml-1 ${c.confidence > 0.4 ? 'text-green-400' : 'text-surface-500'}`}>
                      {(c.confidence * 100).toFixed(0)}%
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-surface-600 mt-1">Click a candidate to apply it as the beat grid.</p>
            </div>
          )}

          {/* Per-band detail table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-700">
                  <th className="px-3 py-1.5 text-left text-surface-400 font-medium">Band</th>
                  <th className="px-3 py-1.5 text-left text-surface-400 font-medium">Range</th>
                  <th className="px-3 py-1.5 text-right text-surface-400 font-medium">Onsets</th>
                  <th className="px-3 py-1.5 text-right text-surface-400 font-medium">Band BPM</th>
                  <th className="px-3 py-1.5 text-right text-surface-400 font-medium">IBI CV</th>
                  <th className="px-3 py-1.5 text-left text-surface-400 font-medium">Top bar</th>
                </tr>
              </thead>
              <tbody>
                {result.bands.map((band, i) => {
                  const color = BAND_COLORS_RL[i % BAND_COLORS_RL.length]!;
                  const topBar = band.barCandidates[0];
                  return (
                    <tr key={i} className="border-b border-surface-700/40">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-white">{band.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-surface-400 font-mono">{band.minHz}–{band.maxHz} Hz</td>
                      <td className="px-3 py-1.5 text-right text-surface-200 font-mono">{band.onsetCount}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: band.bandBpm > 0 ? color : undefined }}>
                        {band.bandBpm > 0 ? band.bandBpm.toFixed(0) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-surface-400 font-mono">{band.ibiCv.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-surface-400 font-mono">
                        {topBar ? `${topBar.beats}♩ (${(topBar.confidence * 100).toFixed(0)}%)` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rhythm Radar */}
          <div className="pt-4 border-t border-surface-700/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Rhythm Radar</span>
              <span className="text-xs text-surface-500">— onset patterns mapped to a circular grid</span>
            </div>
            <RhythmRadarCanvas
              key={`${beatBpm}-${timeSigBeats}-${result.bands.length}`}
              result={result}
              beatBpm={beatBpm}
              timeSigBeats={timeSigBeats}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Step = 'identity' | 'upload' | 'results';

export default function SongSpectrumPage() {
  const qc = useQueryClient();

  // Feature availability
  const { data: status } = useQuery({
    queryKey: ['song-spectrum-status'],
    queryFn: songSpectrumApi.status,
  });

  // Past analyses
  const { data: analyses = [] } = useQuery({
    queryKey: ['song-spectrum-analyses'],
    queryFn: songSpectrumApi.list,
  });

  // Wizard state
  const [step, setStep] = useState<Step>('identity');
  const [songTitle, setSongTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [ytMeta, setYtMeta] = useState<YouTubeMetadata | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<SongSpectrumAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedBandId, setSelectedBandId] = useState<string | null>(null);
  const [analysisNotes, setAnalysisNotes] = useState('');
  const [reAnalysisId, setReAnalysisId] = useState<string | null>(null);

  // YouTube fetch mutation
  const ytMutation = useMutation({
    mutationFn: () => songSpectrumApi.fetchYouTubeMetadata(youtubeUrl),
    onSuccess: (meta) => {
      setYtMeta(meta);
      if (!songTitle.trim()) setSongTitle(meta.title);
      if (!artistName.trim()) setArtistName(meta.channel);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  // Audio analysis mutation
  const analyzeMutation = useMutation({
    mutationFn: (file: File) =>
      songSpectrumApi.analyzeAudio({
        file,
        songTitle: songTitle.trim(),
        artistName: artistName.trim(),
        youtubeUrl: youtubeUrl.trim() || undefined,
        ...(selectedSongId ? { songId: selectedSongId } : {}),
        ...(reAnalysisId ? { analysisId: reAnalysisId } : {}),
        ...(analysisNotes.trim() ? { analysisNotes: analysisNotes.trim() } : {}),
      }),
    onSuccess: (result) => {
      setActiveAnalysis(result);
      setStep('results');
      qc.invalidateQueries({ queryKey: ['song-spectrum-analyses'] });
      setError(null);
    },
    onError: (e: Error) => setError(friendlyWorkerError(e.message)),
  });

  // YouTube audio analysis mutation (yt-dlp, local only)
  const ytAudioMutation = useMutation({
    mutationFn: () =>
      songSpectrumApi.analyzeFromYouTube({
        youtubeUrl: youtubeUrl.trim(),
        songTitle: songTitle.trim(),
        artistName: artistName.trim(),
        ...(selectedSongId ? { songId: selectedSongId } : {}),
        ...(reAnalysisId ? { analysisId: reAnalysisId } : {}),
        ...(analysisNotes.trim() ? { analysisNotes: analysisNotes.trim() } : {}),
      }),
    onSuccess: (result) => {
      setActiveAnalysis(result);
      setStep('results');
      qc.invalidateQueries({ queryKey: ['song-spectrum-analyses'] });
      setError(null);
    },
    onError: (e: Error) => setError(friendlyWorkerError(e.message)),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: songSpectrumApi.delete,
    onSuccess: (_, deletedId) => {
      if (activeAnalysis?.id === deletedId) {
        setActiveAnalysis(null);
        setStep('identity');
      }
      qc.invalidateQueries({ queryKey: ['song-spectrum-analyses'] });
    },
  });

  // Push to library mutation
  const [pushSuccess, setPushSuccess] = useState(false);
  const pushMutation = useMutation({
    mutationFn: (id: string) => songSpectrumApi.pushToLibrary(id),
    onSuccess: () => {
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 4000);
    },
    onError: (e: Error) => setError(e.message),
  });

  function startNew() {
    setSongTitle('');
    setArtistName('');
    setYoutubeUrl('');
    setYtMeta(null);
    setAudioFile(null);
    setActiveAnalysis(null);
    setError(null);
    setSelectedSongId(null);
    setSelectedBandId(null);
    setAnalysisNotes('');
    setReAnalysisId(null);
    setPushSuccess(false);
    setStep('identity');
  }

  function startReAnalyze(analysis: SongSpectrumAnalysis) {
    setSongTitle(analysis.songTitle);
    setArtistName(analysis.artistName);
    setYoutubeUrl(analysis.youtubeUrl ?? '');
    setYtMeta(analysis.ytMetadata);
    setAudioFile(null);
    setActiveAnalysis(analysis);
    setError(null);
    setReAnalysisId(analysis.id);
    setAnalysisNotes(analysis.audioAnalysis?.userNotes ?? '');
    setStep('upload');
  }

  function exportJson() {
    if (!activeAnalysis) return;
    const blob = new Blob([JSON.stringify(activeAnalysis, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeAnalysis.artistName}-${activeAnalysis.songTitle}-spectrum.json`
      .replace(/[^a-z0-9._-]/gi, '_');
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const audioAnalysis: AudioAnalysisResult | null = activeAnalysis?.audioAnalysis ?? null;
  const scoreBreakdown: Record<string, ScoreAxisDetail> = activeAnalysis?.scoreBreakdown ?? {};

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6">

        {/* ── Sidebar: history ── */}
        <aside className="w-full lg:w-56 lg:shrink-0">
          <div className="lg:sticky lg:top-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-surface-400">
                Analyses
              </h2>
              <button
                className="text-xs text-indigo-400 hover:text-indigo-300"
                onClick={startNew}
              >
                + New
              </button>
            </div>

            {/* Feature flags notice */}
            {status && (!status.audioWorker || !status.youtubeApi) && (
              <div className="mb-3 text-xs bg-amber-900/30 border border-amber-700/50 rounded p-2 text-amber-300">
                {!status.audioWorker && <div>⚠ Audio worker not configured</div>}
                {!status.youtubeApi && <div>⚠ YouTube API key not set</div>}
                <div className="text-amber-500 mt-1">See README for setup.</div>
              </div>
            )}

            <AnalysisList
              analyses={analyses}
              selectedId={activeAnalysis?.id ?? null}
              onSelect={(a) => { setActiveAnalysis(a); setStep('results'); setPushSuccess(false); }}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Song Spectrum Analyzer</h1>
            <p className="text-sm text-surface-400 mt-1">
              Upload audio to generate a full spectrum analysis — BPM, key, waveform, spectrogram,
              structure, and six-axis scoring.
            </p>
          </div>

          {/* ── STEP: Identity ── */}
          {step === 'identity' && (
            <div className="max-w-xl space-y-5">

              {/* Library linker */}
              <LibrarySongPicker
                selectedBandId={selectedBandId}
                selectedSongId={selectedSongId}
                onSelect={(bId, bName, sId, sTitle) => {
                  setSelectedBandId(bId);
                  setSelectedSongId(sId);
                  setArtistName(bName);
                  setSongTitle(sTitle);
                }}
                onClear={() => {
                  setSelectedBandId(null);
                  setSelectedSongId(null);
                }}
              />

              {/* Manual name fields (auto-filled from picker, still editable) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-medium text-surface-300 mb-1.5">Artist / Band *</span>
                  <input
                    className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Tool"
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-surface-300 mb-1.5">Song Title *</span>
                  <input
                    className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Lateralus"
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                  />
                </label>
              </div>

              {/* YouTube metadata */}
              <div>
                <span className="block text-xs font-medium text-surface-300 mb-1.5">
                  YouTube URL{' '}
                  <span className="text-surface-500 font-normal">(optional — metadata only)</span>
                </span>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => { setYoutubeUrl(e.target.value); setYtMeta(null); }}
                  />
                  <button
                    className="px-4 py-2 bg-surface-700 hover:bg-surface-600 text-sm text-white rounded transition-colors disabled:opacity-50"
                    disabled={!youtubeUrl.trim() || ytMutation.isPending || !status?.youtubeApi}
                    onClick={() => ytMutation.mutate()}
                    title={!status?.youtubeApi ? 'YOUTUBE_API_KEY not configured' : ''}
                  >
                    {ytMutation.isPending ? 'Fetching…' : 'Fetch'}
                  </button>
                </div>
                {!status?.youtubeApi && (
                  <p className="text-xs text-surface-500 mt-1">
                    Set <code className="text-amber-400">YOUTUBE_API_KEY</code> to enable YouTube metadata import.
                  </p>
                )}
              </div>

              {ytMeta && <YouTubeMetaPanel meta={ytMeta} />}

              {/* Analyst notes */}
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
                  Musical characteristics / analyst notes{' '}
                  <span className="text-surface-500 font-normal">(optional)</span>
                </label>
                <textarea
                  className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-indigo-500 resize-none"
                  rows={3}
                  placeholder={`e.g. "polyrhythmic, odd time signatures, math rock, fibonacci rhythms"\nKeywords inform the axis scoring.`}
                  value={analysisNotes}
                  onChange={(e) => setAnalysisNotes(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-semibold transition-colors disabled:opacity-40"
                disabled={!artistName.trim() || !songTitle.trim()}
                onClick={() => setStep('upload')}
              >
                Continue to Audio Upload →
              </button>
            </div>
          )}

          {/* ── STEP: Upload ── */}
          {step === 'upload' && (
            <div className="max-w-xl space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <button
                  className="text-xs text-surface-400 hover:text-white"
                  onClick={() => setStep('identity')}
                >
                  ← Back
                </button>
                <span className="text-sm font-semibold text-white">
                  {artistName} — {songTitle}
                </span>
                {ytMeta?.thumbnailUrl && (
                  <img src={ytMeta.thumbnailUrl} alt="" className="h-8 rounded" />
                )}
              </div>

              {!status?.audioWorker && (
                <div className="bg-amber-900/30 border border-amber-700/50 rounded p-3 text-sm text-amber-300">
                  Audio analysis worker is not configured.
                  Set <code>AUDIO_WORKER_URL</code> to enable this feature.
                  See <code>apps/audio-worker/README.md</code> for setup instructions.
                </div>
              )}

              <AudioUploader
                onFile={(f) => {
                  setAudioFile(f);
                  analyzeMutation.mutate(f);
                }}
                disabled={analyzeMutation.isPending || ytAudioMutation.isPending || !status?.audioWorker}
              />

              {audioFile && analyzeMutation.isPending && (
                <div className="bg-surface-800 rounded p-4 text-sm text-surface-300">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                    <span>
                      Analysing <strong>{audioFile.name}</strong>…
                      This may take 10–30 seconds for a full-length song.
                    </span>
                  </div>
                </div>
              )}

              {/* YouTube audio analysis — local / personal use */}
              {(status?.youtubeAudio || youtubeUrl.trim()) && (
                <div className="border border-dashed border-surface-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">Analyze from YouTube</span>
                    <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-700/50 rounded px-1.5 py-0.5">
                      local only
                    </span>
                  </div>

                  {!status?.youtubeAudio && (
                    <p className="text-xs text-surface-500">
                      Set <code className="text-amber-400">ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true</code> on
                      both the API and the audio worker to download audio directly from YouTube for analysis.
                      Requires <code className="text-amber-400">yt-dlp</code> installed in the Python worker.
                      <span className="block mt-1 text-surface-600">Never enable in production.</span>
                    </p>
                  )}

                  {status?.youtubeAudio && (
                    <>
                      {!youtubeUrl.trim() && (
                        <p className="text-xs text-surface-500">
                          Go back and paste a YouTube URL to enable this option.
                        </p>
                      )}
                      {youtubeUrl.trim() && (
                        <>
                          <p className="text-xs text-surface-400">
                            Downloads audio via yt-dlp and runs the full analysis pipeline.
                            Takes 30–120 s depending on song length and download speed.
                          </p>
                          <button
                            className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={ytAudioMutation.isPending || analyzeMutation.isPending}
                            onClick={() => ytAudioMutation.mutate()}
                          >
                            {ytAudioMutation.isPending
                              ? 'Downloading & analyzing…'
                              : 'Analyze from YouTube ↓'}
                          </button>
                          {ytAudioMutation.isPending && (
                            <p className="text-xs text-surface-400 animate-pulse">
                              Downloading audio from YouTube… this may take a minute.
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          )}

          {/* ── STEP: Results ── */}
          {step === 'results' && activeAnalysis && (
            <div className="space-y-8">

              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">{activeAnalysis.songTitle}</h2>
                  <div className="text-surface-400 text-sm">{activeAnalysis.artistName}</div>
                  <div className="text-xs text-surface-600 mt-0.5">
                    Analysed {new Date(activeAnalysis.createdAt).toLocaleString()}
                    {activeAnalysis.audioFileName && ` · ${activeAnalysis.audioFileName}`}
                    {activeAnalysis.songId && (
                      <span className="ml-2 text-indigo-500">● linked to library</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <button
                    className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                    onClick={exportJson}
                  >
                    Export JSON
                  </button>
                  <button
                    className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-xs text-white rounded transition-colors"
                    onClick={() => startReAnalyze(activeAnalysis)}
                    title="Upload new audio for this same entry — overwrites the existing analysis"
                  >
                    ↺ Re-analyze
                  </button>
                  {activeAnalysis.songId && (
                    <button
                      className={`px-3 py-1.5 text-xs text-white rounded transition-colors
                        ${pushSuccess
                          ? 'bg-emerald-700 cursor-default'
                          : 'bg-teal-700 hover:bg-teal-600 disabled:opacity-50'}`}
                      disabled={pushMutation.isPending || pushSuccess}
                      onClick={() => pushMutation.mutate(activeAnalysis.id)}
                      title="Copy these scores (÷10) to the linked library song's Core spectrum"
                    >
                      {pushSuccess ? '✓ Pushed' : pushMutation.isPending ? 'Pushing…' : '↑ Push to Library'}
                    </button>
                  )}
                  <button
                    className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                    onClick={startNew}
                  >
                    + New
                  </button>
                </div>
              </div>

              {/* YouTube metadata */}
              {activeAnalysis.ytMetadata && (
                <YouTubeMetaPanel meta={activeAnalysis.ytMetadata} />
              )}

              {/* Analyst notes */}
              {audioAnalysis?.userNotes && (
                <div className="bg-surface-800/60 border border-surface-700/50 rounded-lg px-4 py-3 text-xs text-surface-300">
                  <span className="text-surface-500 font-semibold uppercase tracking-wider mr-2">Analyst notes</span>
                  {audioAnalysis.userNotes}
                </div>
              )}

              {/* MusicBrainz metadata */}
              {audioAnalysis?.musicBrainzData && (
                <MusicBrainzPanel data={audioAnalysis.musicBrainzData} />
              )}

              {/* GPT rhythm research */}
              {audioAnalysis?.rhythmResearch && (
                <RhythmResearchPanel data={audioAnalysis.rhythmResearch} />
              )}

              {/* Scores grid */}
              {Object.keys(activeAnalysis.scores).length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Radar */}
                  <div className="bg-surface-800/50 rounded-xl p-4 flex items-center justify-center">
                    <SpectrumRadar scores={activeAnalysis.scores} />
                  </div>

                  {/* Score bars */}
                  <div className="space-y-2">
                    {SCORE_AXES.map((ax) => {
                      const score = activeAnalysis.scores[ax] ?? 0;
                      return (
                        <div key={ax} className="flex items-center gap-3">
                          <span
                            className="text-xs font-semibold w-20 text-right shrink-0"
                            style={{ color: AXIS_COLORS[ax] }}
                          >
                            {AXIS_LABELS[ax as keyof typeof AXIS_LABELS]}
                          </span>
                          <div className="flex-1 h-2.5 bg-surface-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${score}%`,
                                backgroundColor: AXIS_COLORS[ax],
                              }}
                            />
                          </div>
                          <span className="text-xs text-surface-300 w-8 text-right font-mono">
                            {score}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* YouTube embed — shown when the analysis has a YouTube source */}
              {activeAnalysis.youtubeUrl && (() => {
                const vidId = activeAnalysis.youtubeUrl.match(
                  /(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/
                )?.[1];
                return vidId ? (
                  <div>
                    <h3 className="text-sm font-bold text-surface-300 uppercase tracking-wider mb-3">
                      YouTube Source
                    </h3>
                    <div className="rounded-xl overflow-hidden aspect-video bg-surface-900">
                      <iframe
                        src={`https://www.youtube.com/embed/${vidId}`}
                        title="YouTube player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Audio visualizations */}
              {audioAnalysis && (
                <>
                  <div>
                    <h3 className="text-sm font-bold text-surface-300 uppercase tracking-wider mb-3">
                      Waveform
                    </h3>
                    <WaveformViz waveform={audioAnalysis.waveform} height={80} />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-surface-300 uppercase tracking-wider mb-3">
                      Spectrogram
                    </h3>
                    <SpectrogramViz
                      data={audioAnalysis.spectrogram.data}
                      times={audioAnalysis.spectrogram.times}
                      freqs={audioAnalysis.spectrogram.freqs}
                      height={160}
                    />
                  </div>

                  <SectionTimeline
                    sections={audioAnalysis.sections}
                    duration={audioAnalysis.duration}
                  />

                  <div>
                    <h3 className="text-sm font-bold text-surface-300 uppercase tracking-wider mb-3">
                      Audio Features
                    </h3>
                    <div className="bg-surface-800/50 rounded-lg p-4">
                      <AudioFeatureTable audio={audioAnalysis} />
                    </div>
                  </div>
                </>
              )}

              {/* Score breakdowns */}
              {Object.keys(scoreBreakdown).length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-surface-300 uppercase tracking-wider mb-3">
                    Score Breakdown
                  </h3>
                  <div className="space-y-2">
                    {SCORE_AXES.filter((ax) => scoreBreakdown[ax]).map((ax) => (
                      <ScoreBreakdown key={ax} axis={ax} detail={scoreBreakdown[ax]!} />
                    ))}
                  </div>
                </div>
              )}

              {/* Rhythm Lab */}
              {audioAnalysis && (
                <div>
                  <h3 className="text-sm font-bold text-surface-300 uppercase tracking-wider mb-3">
                    Rhythm Lab
                  </h3>
                  <div className="bg-surface-800/30 rounded-xl p-5 border border-purple-700/20">
                    <RhythmLabPanel
                      analysisYoutubeUrl={activeAnalysis.youtubeUrl}
                      youtubeAudioEnabled={status?.youtubeAudio ?? false}
                    />
                  </div>
                </div>
              )}

              {/* No audio yet */}
              {!audioAnalysis && (
                <div className="bg-surface-800/50 rounded-lg p-6 text-center">
                  <p className="text-sm text-surface-400 mb-4">
                    No audio analysis for this entry yet.
                  </p>
                  <button
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-sm text-white rounded transition-colors"
                    onClick={() => setStep('upload')}
                  >
                    Upload Audio
                  </button>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
