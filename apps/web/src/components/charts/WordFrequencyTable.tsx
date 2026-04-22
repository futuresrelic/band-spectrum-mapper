import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { WordFrequency, WordSongLink } from '@band-spectrum-mapper/shared';

interface Props {
  words: WordFrequency[];
  title?: string;
  songLinks?: WordSongLink[];
}

export default function WordFrequencyTable({ words, title, songLinks }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (words.length === 0) {
    return <p className="text-surface-700 text-sm">No word data available.</p>;
  }

  const linkMap = songLinks
    ? new Map(songLinks.map((l) => [l.word, l.songs]))
    : null;

  return (
    <div>
      {title && <h3 className="mb-3">{title}</h3>}
      <div className="overflow-auto max-h-[560px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-surface-200 text-left">
              <th className="pb-2 pr-4 font-medium text-surface-700 w-8">#</th>
              <th className="pb-2 pr-4 font-medium text-surface-700">Word / Phrase</th>
              <th className="pb-2 pr-4 font-medium text-surface-700">Count</th>
              <th className="pb-2 font-medium text-surface-700">%</th>
              {linkMap && <th className="pb-2 font-medium text-surface-700 pl-4">Songs</th>}
            </tr>
          </thead>
          <tbody>
            {words.map((w, i) => {
              const songs = linkMap?.get(w.word);
              const isExpanded = expanded === w.word;
              return (
                <>
                  <tr
                    key={w.word}
                    className={`border-b border-surface-100 ${songs ? 'cursor-pointer hover:bg-surface-50' : ''}`}
                    onClick={() => songs && setExpanded(isExpanded ? null : w.word)}
                  >
                    <td className="py-1.5 pr-4 text-surface-500">{i + 1}</td>
                    <td className="py-1.5 pr-4 font-mono font-medium">{w.word}</td>
                    <td className="py-1.5 pr-4 tabular-nums">{w.count}</td>
                    <td className="py-1.5 text-surface-600 tabular-nums">{w.percentage.toFixed(1)}%</td>
                    {linkMap && (
                      <td className="py-1.5 pl-4">
                        {songs ? (
                          <span className="text-xs text-indigo-600 font-medium">
                            {isExpanded ? '▾' : '▸'} {songs.length} song{songs.length !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-surface-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>

                  {isExpanded && songs && (
                    <tr key={`${w.word}-songs`} className="border-b border-surface-100 bg-surface-50">
                      <td />
                      <td colSpan={4} className="py-2 pl-2 pr-4">
                        <ul className="space-y-1">
                          {songs
                            .slice()
                            .sort((a, b) => b.count - a.count)
                            .map((s) => (
                              <li key={s.songId} className="flex flex-wrap items-center gap-1 text-xs">
                                <Link
                                  to={`/library/songs/${s.songId}`}
                                  className="font-medium hover:underline text-surface-900"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {s.title}
                                </Link>
                                {s.bandName && (
                                  <Link
                                    to={`/library/bands/${s.bandId}`}
                                    className="text-surface-500 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    · {s.bandName}
                                  </Link>
                                )}
                                {s.albumTitle && s.albumId && (
                                  <Link
                                    to={`/library/albums/${s.albumId}`}
                                    className="text-surface-500 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    / {s.albumTitle}
                                  </Link>
                                )}
                                <span className="ml-auto tabular-nums text-surface-400">×{s.count}</span>
                              </li>
                            ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
