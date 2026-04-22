import { useState, useMemo } from 'react';
import type { WordSongLink } from '@band-spectrum-mapper/shared';

interface Props {
  links: WordSongLink[];
  maxWords?: number;
}

const WORD_COL_X = 10;
const SONG_COL_X = 90;
const ROW_MIN_HEIGHT = 22;
const PADDING_TOP = 16;
const NODE_RADIUS = 5;

export default function WordSongGraph({ links, maxWords = 40 }: Props) {
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [hoveredSong, setHoveredSong] = useState<string | null>(null);

  const displayLinks = useMemo(() => links.slice(0, maxWords), [links, maxWords]);

  // Collect unique songs across displayed words
  const songMap = useMemo(() => {
    const m = new Map<string, string>(); // songId → title
    for (const link of displayLinks) {
      for (const s of link.songs) {
        m.set(s.songId, s.title);
      }
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
  const rowHeight = Math.max(ROW_MIN_HEIGHT, Math.min(36, 600 / rows));
  const svgHeight = rows * rowHeight + PADDING_TOP * 2;

  const wordY = (i: number) => PADDING_TOP + i * rowHeight + rowHeight / 2;
  const songY = (i: number) => PADDING_TOP + i * rowHeight + rowHeight / 2;

  // Max count for sizing
  const maxCount = displayLinks[0]?.totalCount ?? 1;

  // Build a lookup: songId → y-position index
  const songIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    songs.forEach(([id], idx) => m.set(id, idx));
    return m;
  }, [songs]);

  // Determine active edges
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
      const link = displayLinks.find((l) => l.word === word);
      return !link?.songs.some((s) => s.songId === hoveredSong);
    }
    return true;
  };

  const isSongFaded = (songId: string) => {
    if (!hoveredWord && !hoveredSong) return false;
    if (hoveredSong === songId) return false;
    if (hoveredWord) {
      const link = displayLinks.find((l) => l.word === hoveredWord);
      return !link?.songs.some((s) => s.songId === songId);
    }
    return true;
  };

  if (displayLinks.length === 0) {
    return <p className="text-sm text-surface-700">No word-song data. Run analysis with a band or album scope.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 100 ${svgHeight}`}
        width="100%"
        style={{ maxHeight: 700, minHeight: 200 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Column headers */}
        <text x={WORD_COL_X} y={10} textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#64748b">
          WORDS
        </text>
        <text x={SONG_COL_X} y={10} textAnchor="middle" fontSize="3.5" fontWeight="600" fill="#64748b">
          SONGS
        </text>

        {/* Edges */}
        {displayLinks.map((link, wi) => {
          return link.songs.map((s) => {
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
                strokeWidth={active ? 0.6 : 0.25}
                opacity={anyHover && !active ? 0.15 : active ? 0.9 : 0.5}
              />
            );
          });
        })}

        {/* Word nodes */}
        {displayLinks.map((link, i) => {
          const r = NODE_RADIUS * 0.4 + (link.totalCount / maxCount) * NODE_RADIUS * 0.6;
          const faded = isWordFaded(link.word);
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
                fill={hoveredWord === link.word ? '#6366f1' : '#94a3b8'}
                opacity={faded ? 0.2 : 1}
              />
              <text
                x={WORD_COL_X + r + 1}
                y={wordY(i)}
                dominantBaseline="middle"
                fontSize="2.8"
                fill={faded ? '#cbd5e1' : '#1e293b'}
                fontWeight={hoveredWord === link.word ? '600' : '400'}
              >
                {link.word}
              </text>
            </g>
          );
        })}

        {/* Song nodes */}
        {songs.map(([songId, title], i) => {
          const faded = isSongFaded(songId);
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
                r={NODE_RADIUS * 0.5}
                fill={hoveredSong === songId ? '#f59e0b' : '#94a3b8'}
                opacity={faded ? 0.2 : 1}
              />
              <text
                x={SONG_COL_X - NODE_RADIUS * 0.5 - 1}
                y={songY(i)}
                dominantBaseline="middle"
                textAnchor="end"
                fontSize="2.8"
                fill={faded ? '#cbd5e1' : '#1e293b'}
                fontWeight={hoveredSong === songId ? '600' : '400'}
              >
                {title.length > 22 ? title.slice(0, 20) + '…' : title}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-surface-600 mt-2">Hover a word or song to highlight connections. Word node size reflects frequency.</p>
    </div>
  );
}
