import { useState, useMemo } from 'react';
import type { WordSongLink } from '@band-spectrum-mapper/shared';

interface Props {
  links: WordSongLink[];
  maxWords?: number;
}

const WORD_COL_X = 10;
const SONG_COL_X = 90;
const ROW_HEIGHT = 24;
const PADDING_TOP = 18;
const NODE_RADIUS = 5;
const BASE_HEIGHT = 480;

export default function WordSongGraph({ links, maxWords = 40 }: Props) {
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [hoveredSong, setHoveredSong] = useState<string | null>(null);
  const [reversed, setReversed] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Normal: most frequent first. Reversed: least frequent first (from the supplied set).
  const displayLinks = useMemo(() => {
    const ordered = reversed ? [...links].reverse() : [...links];
    return ordered.slice(0, maxWords);
  }, [links, maxWords, reversed]);

  const songMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const link of displayLinks) {
      for (const s of link.songs) m.set(s.songId, s.title);
    }
    return m;
  }, [displayLinks]);

  const songs = useMemo(
    () => [...songMap.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [songMap],
  );

  const wordCount = displayLinks.length;
  const songCount = songs.length;
  const rows = Math.max(wordCount, songCount);
  const svgHeight = rows * ROW_HEIGHT + PADDING_TOP * 2;

  const wordY = (i: number) => PADDING_TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2;
  const songY = (i: number) => PADDING_TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2;

  // Frequency extremes for node sizing
  const maxCount = useMemo(
    () => Math.max(...displayLinks.map((l) => l.totalCount), 1),
    [displayLinks],
  );
  const minCount = useMemo(
    () => Math.min(...displayLinks.map((l) => l.totalCount), 1),
    [displayLinks],
  );

  const songIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    songs.forEach(([id], idx) => m.set(id, idx));
    return m;
  }, [songs]);

  const isEdgeActive = (word: string, songId: string) => {
    if (!hoveredWord && !hoveredSong) return false;
    if (hoveredWord === word) return true;
    if (hoveredSong === songId) return true;
    return false;
  };

  const isWordFaded = (word: string) => {
    if (!hoveredWord && !hoveredSong) return false;
    if (hoveredWord === word) return false;
    if (hoveredSong) {
      return !displayLinks.find((l) => l.word === word)?.songs.some((s) => s.songId === hoveredSong);
    }
    return true;
  };

  const isSongFaded = (songId: string) => {
    if (!hoveredWord && !hoveredSong) return false;
    if (hoveredSong === songId) return false;
    if (hoveredWord) {
      return !displayLinks.find((l) => l.word === hoveredWord)?.songs.some((s) => s.songId === songId);
    }
    return true;
  };

  if (displayLinks.length === 0) {
    return <p className="text-sm text-surface-700">No word-song data. Run analysis with a band or album scope.</p>;
  }

  const pixelHeight = BASE_HEIGHT * zoom;

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button
          className={reversed ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
          onClick={() => setReversed((r) => !r)}
          title="Toggle between most-frequent and least-frequent words"
        >
          {reversed ? 'Least frequent first' : 'Most frequent first'}
        </button>

        <div className="flex items-center gap-2 text-xs text-surface-700">
          <span>Zoom</span>
          <button
            className="btn-ghost text-xs px-2"
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
          >
            −
          </button>
          <span className="w-8 text-center font-medium">{zoom}×</span>
          <button
            className="btn-ghost text-xs px-2"
            disabled={zoom >= 5}
            onClick={() => setZoom((z) => Math.min(5, +(z + 0.5).toFixed(1)))}
          >
            +
          </button>
        </div>

        <span className="text-xs text-surface-600 ml-auto">
          {displayLinks.length} words · {songs.length} songs
          {reversed && ` · showing ${minCount}–${maxCount} occurrences`}
          {!reversed && ` · showing ${minCount}–${maxCount} occurrences`}
        </span>
      </div>

      {/* Scrollable container */}
      <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: BASE_HEIGHT }}>
        <svg
          viewBox={`0 0 100 ${svgHeight}`}
          width="100%"
          height={pixelHeight}
          style={{ display: 'block' }}
          preserveAspectRatio="xMidYMin meet"
        >
          {/* Column headers */}
          <text x={WORD_COL_X} y={10} textAnchor="middle" fontSize="3" fontWeight="600" fill="#64748b" letterSpacing="0.5">
            WORDS
          </text>
          <text x={SONG_COL_X} y={10} textAnchor="middle" fontSize="3" fontWeight="600" fill="#64748b" letterSpacing="0.5">
            SONGS
          </text>

          {/* Edges */}
          {displayLinks.map((link, wi) =>
            link.songs.map((s) => {
              const si = songIndexMap.get(s.songId);
              if (si === undefined) return null;
              const active = isEdgeActive(link.word, s.songId);
              const anyHover = hoveredWord !== null || hoveredSong !== null;
              return (
                <line
                  key={`${link.word}-${s.songId}`}
                  x1={WORD_COL_X + 4}
                  y1={wordY(wi)}
                  x2={SONG_COL_X - 4}
                  y2={songY(si)}
                  stroke={active ? '#6366f1' : '#cbd5e1'}
                  strokeWidth={active ? 0.5 : 0.2}
                  opacity={anyHover && !active ? 0.1 : active ? 1 : 0.5}
                />
              );
            }),
          )}

          {/* Word nodes */}
          {displayLinks.map((link, i) => {
            const countRange = maxCount - minCount || 1;
            const r = NODE_RADIUS * 0.35 + ((link.totalCount - minCount) / countRange) * NODE_RADIUS * 0.65;
            const faded = isWordFaded(link.word);
            const hovered = hoveredWord === link.word;
            return (
              <g
                key={link.word}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredWord(link.word)}
                onMouseLeave={() => setHoveredWord(null)}
              >
                <circle
                  cx={WORD_COL_X}
                  cy={wordY(i)}
                  r={r}
                  fill={hovered ? '#6366f1' : '#94a3b8'}
                  opacity={faded ? 0.2 : 1}
                />
                <text
                  x={WORD_COL_X + r + 1}
                  y={wordY(i)}
                  dominantBaseline="middle"
                  fontSize="2.6"
                  fill={faded ? '#cbd5e1' : '#1e293b'}
                  fontWeight={hovered ? '600' : '400'}
                >
                  {link.word}
                  <tspan fontSize="2.2" fill={faded ? '#e2e8f0' : '#94a3b8'}> ×{link.totalCount}</tspan>
                </text>
              </g>
            );
          })}

          {/* Song nodes */}
          {songs.map(([songId, title], i) => {
            const faded = isSongFaded(songId);
            const hovered = hoveredSong === songId;
            return (
              <g
                key={songId}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredSong(songId)}
                onMouseLeave={() => setHoveredSong(null)}
              >
                <circle
                  cx={SONG_COL_X}
                  cy={songY(i)}
                  r={NODE_RADIUS * 0.45}
                  fill={hovered ? '#f59e0b' : '#94a3b8'}
                  opacity={faded ? 0.2 : 1}
                />
                <text
                  x={SONG_COL_X - NODE_RADIUS * 0.45 - 1}
                  y={songY(i)}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fontSize="2.6"
                  fill={faded ? '#cbd5e1' : '#1e293b'}
                  fontWeight={hovered ? '600' : '400'}
                >
                  {title.length > 22 ? title.slice(0, 20) + '…' : title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-xs text-surface-600 mt-2">
        Hover a word or song to highlight connections. Node size = frequency. Use zoom to expand.
      </p>
    </div>
  );
}
