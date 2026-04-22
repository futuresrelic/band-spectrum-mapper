import { useState, useMemo } from 'react';
import type { WordSongLink } from '@band-spectrum-mapper/shared';

interface Props {
  links: WordSongLink[];
  maxWords?: number;
  reversed?: boolean;
}

// Real pixel coordinate system so fontSize is actual pixels — no viewBox scaling surprises
const SVG_W = 900;
const WORD_X = 185;
const SONG_X = 715;
const PADDING_TOP = 36;
const BASE_ROW_H = 32;
const BASE_FONT = 14;
const BASE_NODE_R = 7;

export default function WordSongGraph({ links, maxWords = 40, reversed = false }: Props) {
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [hoveredSong, setHoveredSong] = useState<string | null>(null);
  const [pinnedWord, setPinnedWord] = useState<string | null>(null);
  const [pinnedSong, setPinnedSong] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // Effective active node: pin takes precedence over hover
  const activeWord = pinnedWord ?? hoveredWord;
  const activeSong = pinnedSong ?? hoveredSong;

  const rowH = BASE_ROW_H * zoom;
  const fs = Math.round(BASE_FONT * zoom);
  const nodeR = Math.round(BASE_NODE_R * zoom);

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

  const rows = Math.max(displayLinks.length, songs.length);
  const svgHeight = rows * rowH + PADDING_TOP * 2;

  const wordY = (i: number) => PADDING_TOP + i * rowH + rowH / 2;
  const songY = (i: number) => PADDING_TOP + i * rowH + rowH / 2;

  const maxCount = useMemo(() => Math.max(...displayLinks.map((l) => l.totalCount), 1), [displayLinks]);
  const minCount = useMemo(() => Math.min(...displayLinks.map((l) => l.totalCount), 1), [displayLinks]);
  const countRange = maxCount - minCount || 1;

  const songIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    songs.forEach(([id], idx) => m.set(id, idx));
    return m;
  }, [songs]);

  const isEdgeActive = (word: string, songId: string) =>
    activeWord === word || activeSong === songId;

  const isWordFaded = (word: string) => {
    if (!activeWord && !activeSong) return false;
    if (activeWord === word) return false;
    if (activeSong) return !displayLinks.find((l) => l.word === word)?.songs.some((s) => s.songId === activeSong);
    return true;
  };

  const isSongFaded = (songId: string) => {
    if (!activeWord && !activeSong) return false;
    if (activeSong === songId) return false;
    if (activeWord) return !displayLinks.find((l) => l.word === activeWord)?.songs.some((s) => s.songId === songId);
    return true;
  };

  const handleWordClick = (word: string) => {
    setPinnedSong(null);
    setPinnedWord((prev) => (prev === word ? null : word));
  };

  const handleSongClick = (songId: string) => {
    setPinnedWord(null);
    setPinnedSong((prev) => (prev === songId ? null : songId));
  };

  if (displayLinks.length === 0) {
    return <p className="text-sm text-surface-700">No word-song data. Run analysis with a band or album scope.</p>;
  }

  return (
    <div>
      {/* Pin indicator */}
      {(pinnedWord || pinnedSong) && (
        <div className="flex items-center gap-2 mb-2 text-xs bg-indigo-50 border border-indigo-200 rounded px-3 py-1.5">
          <span className="text-indigo-700 font-medium">
            {pinnedWord ? `Pinned word: "${pinnedWord}"` : `Pinned song: "${songs.find(([id]) => id === pinnedSong)?.[1]}"`}
          </span>
          <button
            className="ml-auto text-indigo-400 hover:text-indigo-700"
            onClick={() => { setPinnedWord(null); setPinnedSong(null); }}
          >
            Clear pin
          </button>
        </div>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-2 mb-3 text-sm text-surface-700">
        <span>Zoom</span>
        <button
          className="btn-ghost text-xs px-2 py-1"
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
        >−</button>
        <span className="w-8 text-center font-medium tabular-nums">{zoom}×</span>
        <button
          className="btn-ghost text-xs px-2 py-1"
          disabled={zoom >= 5}
          onClick={() => setZoom((z) => Math.min(5, +(z + 0.5).toFixed(1)))}
        >+</button>
        <span className="ml-4 text-xs text-surface-600">
          {displayLinks.length} words · {songs.length} songs ·{' '}
          {minCount === maxCount ? `×${minCount}` : `×${minCount}–${maxCount}`} occurrences
        </span>
      </div>

      {/* Scrollable container — both axes */}
      <div style={{ overflow: 'auto', maxHeight: 560, border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${svgHeight}`}
          width={SVG_W}
          height={svgHeight}
          style={{ display: 'block' }}
        >
          {/* Column headers */}
          <text x={WORD_X} y={18} textAnchor="middle" fontSize={11} fontWeight="600" fill="#64748b" letterSpacing="1">
            WORDS
          </text>
          <text x={SONG_X} y={18} textAnchor="middle" fontSize={11} fontWeight="600" fill="#64748b" letterSpacing="1">
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
                  x1={WORD_X + nodeR + 2}
                  y1={wordY(wi)}
                  x2={SONG_X - nodeR - 2}
                  y2={songY(si)}
                  stroke={active ? '#6366f1' : '#cbd5e1'}
                  strokeWidth={active ? Math.max(1.5, zoom) : Math.max(0.5, zoom * 0.4)}
                  opacity={anyHover && !active ? 0.08 : active ? 0.9 : 0.4}
                />
              );
            }),
          )}

          {/* Word nodes */}
          {displayLinks.map((link, i) => {
            const r = nodeR * 0.4 + ((link.totalCount - minCount) / countRange) * nodeR * 0.6;
            const faded = isWordFaded(link.word);
            const hovered = activeWord === link.word;
            const pinned = pinnedWord === link.word;
            return (
              <g
                key={link.word}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => !pinnedWord && !pinnedSong && setHoveredWord(link.word)}
                onMouseLeave={() => setHoveredWord(null)}
                onClick={() => handleWordClick(link.word)}
              >
                {pinned && <circle cx={WORD_X} cy={wordY(i)} r={r + 4} fill="none" stroke="#6366f1" strokeWidth={1.5} />}
                <circle
                  cx={WORD_X}
                  cy={wordY(i)}
                  r={r}
                  fill={hovered ? '#6366f1' : '#94a3b8'}
                  opacity={faded ? 0.15 : 1}
                />
                <text
                  x={WORD_X + r + 6}
                  y={wordY(i)}
                  dominantBaseline="middle"
                  fontSize={fs}
                  fill={faded ? '#cbd5e1' : '#1e293b'}
                  fontWeight={hovered ? '600' : '400'}
                >
                  {link.word}
                </text>
                <text
                  x={WORD_X - r - 6}
                  y={wordY(i)}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fontSize={Math.round(fs * 0.8)}
                  fill={faded ? '#e2e8f0' : '#94a3b8'}
                >
                  ×{link.totalCount}
                </text>
              </g>
            );
          })}

          {/* Song nodes */}
          {songs.map(([songId, title], i) => {
            const faded = isSongFaded(songId);
            const hovered = activeSong === songId;
            const pinned = pinnedSong === songId;
            const labelR = Math.round(nodeR * 0.55);
            return (
              <g
                key={songId}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => !pinnedWord && !pinnedSong && setHoveredSong(songId)}
                onMouseLeave={() => setHoveredSong(null)}
                onClick={() => handleSongClick(songId)}
              >
                {pinned && <circle cx={SONG_X} cy={songY(i)} r={labelR + 4} fill="none" stroke="#f59e0b" strokeWidth={1.5} />}
                <circle
                  cx={SONG_X}
                  cy={songY(i)}
                  r={labelR}
                  fill={hovered ? '#f59e0b' : '#94a3b8'}
                  opacity={faded ? 0.15 : 1}
                />
                <text
                  x={SONG_X + labelR + 6}
                  y={songY(i)}
                  dominantBaseline="middle"
                  fontSize={fs}
                  fill={faded ? '#cbd5e1' : '#1e293b'}
                  fontWeight={hovered ? '600' : '400'}
                >
                  {title.length > 28 ? title.slice(0, 26) + '…' : title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-xs text-surface-600 mt-2">
        Hover to preview · Click to pin (stays highlighted while you scroll) · Click again to unpin.
      </p>
    </div>
  );
}
