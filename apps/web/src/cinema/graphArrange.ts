/**
 * Shared 3D graph layout utilities.
 * Extracted here so ThreeDGraphView and CinemaPage can both use them
 * without duplicating ~200 lines of pure math.
 */

export type ArrangeMode = 'natural' | 'radial' | 'sphere' | 'galaxy' | 'solar-system' | 'galactic-cinema' | 'helix' | 'emotional-spectrum' | 'genre-web' | 'fibonacci-torus' | 'fractal-tree' | 'mandala' | 'wave' | 'lissajous' | 'crystal' | 'fibonacci-spiral' | 'genre-radar' | 'star-3' | 'star-4' | 'star-5' | 'star-6' | 'star-7' | 'star-8' | 'nonagon-infinity' | 'lyric-solar';

/** Minimal shape required for layout computation. */
export interface ArrangeNode {
  id: string;
  type: string;
  x?: number; y?: number; z?: number;
  fx?: number; fy?: number; fz?: number;
}

type LinkEnd = string | { id: string };

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function buildAdj(
  links: Array<{ source: LinkEnd; target: LinkEnd }>,
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const endId = (v: LinkEnd) => (typeof v === 'string' ? v : v.id);
  for (const l of links) {
    const s = endId(l.source);
    const t = endId(l.target);
    if (!s || !t) continue;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s)!.add(t);
    adj.get(t)!.add(s);
  }
  return adj;
}

type RawEdge = { source: string | { id: string }; target: string | { id: string }; type?: string; weight?: number };

// ── Star layout helper ────────────────────────────────────────────────────────
// Each star tip is a tight RADIAL SPOKE pointing outward from the center.
// Albums that overflow a tip stack further out along the same radial direction
// rather than spreading angularly — this keeps the tip narrow and the gaps
// between tips wide and clearly visible as a star shape from any camera angle.
function computeStarLayout<N extends ArrangeNode>(
  nodes: N[],
  nPoints: number,
  adj: Map<string, Set<string>>,
  out: Map<string, { x: number; y: number; z: number }>,
): void {
  const TWO_PI  = 2 * Math.PI;
  const artists = nodes.filter(n => n.type === 'artist');
  const albums  = nodes.filter(n => n.type === 'album');
  const songs   = nodes.filter(n => n.type === 'song');
  const others  = nodes.filter(n => !['artist', 'album', 'song'].includes(n.type));

  // Radial distance of the first album in each tip, and spacing between stacked albums
  const R_TIP  = 300;
  const R_STEP = 62;

  // Artists at center (tiny ring)
  const artistR = Math.max(20, Math.min(50, artists.length * 12));
  artists.forEach((a, i) => {
    const phi = (i / Math.max(1, artists.length)) * TWO_PI;
    out.set(a.id, { x: artistR * Math.cos(phi), y: 0, z: artistR * Math.sin(phi) });
  });

  // Distribute albums round-robin across N tips
  const albumsByTip: N[][] = Array.from({ length: nPoints }, () => []);
  albums.forEach((alb, i) => albumsByTip[i % nPoints]!.push(alb));

  const albumPositions = new Map<string, { x: number; y: number; z: number }>();
  albumsByTip.forEach((group, tipIdx) => {
    const basePhi = (tipIdx / nPoints) * TWO_PI - Math.PI / 2; // start at top
    // Each tip at a distinct Y height — star shape legible from any camera angle
    const tipY = Math.sin((tipIdx / nPoints) * TWO_PI) * 130;

    group.forEach((alb, j) => {
      // Stack radially — overflow albums go further OUT, not angularly wider
      const r = R_TIP + j * R_STEP;
      // Tiny sine dither so stacked albums don't perfectly overlap
      const angDither = Math.sin(j * 2.4) * 0.045;
      const angle = basePhi + angDither;
      const pos = {
        x: r * Math.cos(angle),
        y: tipY + j * 14,
        z: r * Math.sin(angle),
      };
      albumPositions.set(alb.id, pos);
      out.set(alb.id, pos);
    });
  });

  // Songs orbit their parent album
  songs.forEach((song) => {
    const pa = albums.find(a => adj.get(a.id)?.has(song.id) || adj.get(song.id)?.has(a.id));
    const siblings = songs.filter(s => {
      const p = albums.find(a => adj.get(a.id)?.has(s.id) || adj.get(s.id)?.has(a.id));
      return p?.id === pa?.id;
    });
    const idx  = siblings.indexOf(song);
    const phi  = (idx / Math.max(1, siblings.length)) * TWO_PI;
    const r    = 28;
    const base = pa ? (albumPositions.get(pa.id) ?? { x: R_TIP * 0.5, y: 0, z: 0 }) : { x: R_TIP * 0.5, y: 0, z: 0 };
    out.set(song.id, {
      x: base.x + r * Math.cos(phi),
      y: base.y + r * 0.5 * Math.sin(phi * 2.5),
      z: base.z + r * Math.sin(phi),
    });
  });

  // Others in outer belt
  const beltR = R_TIP * 1.8;
  others.forEach((n, i) => {
    const phi = (i / Math.max(1, others.length)) * TWO_PI;
    out.set(n.id, { x: beltR * Math.cos(phi), y: Math.sin(i * 0.618) * 45, z: beltR * Math.sin(phi) });
  });
}

// ── Nonagon Infinity layout helper ────────────────────────────────────────────
// 9-sided regular polygon — each vertex is a tight radial spoke so the 9-sided
// shape is unmistakable with large empty arcs between vertices.
// Albums are distributed round-robin across the 9 vertices; overflow albums
// stack radially outward from their vertex rather than spreading angularly.
function computeNonagonLayout<N extends ArrangeNode>(
  nodes: N[],
  adj: Map<string, Set<string>>,
  out: Map<string, { x: number; y: number; z: number }>,
): void {
  const TWO_PI  = 2 * Math.PI;
  const N_SIDES = 9;
  const artists = nodes.filter(n => n.type === 'artist');
  const albums  = nodes.filter(n => n.type === 'album');
  const songs   = nodes.filter(n => n.type === 'song');
  const others  = nodes.filter(n => !['artist', 'album', 'song'].includes(n.type));

  const R_VERTEX = 320;
  const R_STEP   = 62;

  // Artists at center
  const artistR = Math.max(20, Math.min(55, artists.length * 14));
  artists.forEach((a, i) => {
    const phi = (i / Math.max(1, artists.length)) * TWO_PI;
    out.set(a.id, { x: artistR * Math.cos(phi), y: 0, z: artistR * Math.sin(phi) });
  });

  // Albums: round-robin to 9 vertices, overflow stacks radially (not angularly)
  const albumsByVertex: N[][] = Array.from({ length: N_SIDES }, () => []);
  albums.forEach((alb, i) => albumsByVertex[i % N_SIDES]!.push(alb));

  const albumPositions = new Map<string, { x: number; y: number; z: number }>();
  albumsByVertex.forEach((group, vertexIdx) => {
    const basePhi  = (vertexIdx / N_SIDES) * TWO_PI - Math.PI / 2;
    // Each vertex at a distinct Y height for 3D visibility
    const vertexY  = Math.sin((vertexIdx / N_SIDES) * TWO_PI) * 120;

    group.forEach((alb, j) => {
      const r         = R_VERTEX + j * R_STEP;
      const angDither = Math.sin(j * 2.4) * 0.045;
      const angle     = basePhi + angDither;
      const pos = {
        x: r * Math.cos(angle),
        y: vertexY + j * 14,
        z: r * Math.sin(angle),
      };
      albumPositions.set(alb.id, pos);
      out.set(alb.id, pos);
    });
  });

  // Songs orbit their album
  songs.forEach((song) => {
    const pa = albums.find(a => adj.get(a.id)?.has(song.id) || adj.get(song.id)?.has(a.id));
    const siblings = songs.filter(s => {
      const p = albums.find(a => adj.get(a.id)?.has(s.id) || adj.get(s.id)?.has(a.id));
      return p?.id === pa?.id;
    });
    const idx  = siblings.indexOf(song);
    const phi  = (idx / Math.max(1, siblings.length)) * TWO_PI;
    const r    = 28;
    const base = pa ? (albumPositions.get(pa.id) ?? { x: R_VERTEX * 0.45, y: 0, z: 0 }) : { x: R_VERTEX * 0.45, y: 0, z: 0 };
    out.set(song.id, {
      x: base.x + r * Math.cos(phi),
      y: base.y + r * 0.45 * Math.sin(phi * 2),
      z: base.z + r * Math.sin(phi),
    });
  });

  // Others: outer belt
  const beltR = R_VERTEX * 1.7;
  others.forEach((n, i) => {
    const phi = (i / Math.max(1, others.length)) * TWO_PI;
    out.set(n.id, { x: beltR * Math.cos(phi), y: Math.sin(i * 0.618) * 48, z: beltR * Math.sin(phi) });
  });
}

export function computeArrangeTargets<N extends ArrangeNode>(
  nodes: N[],
  mode: ArrangeMode,
  adj: Map<string, Set<string>>,
  edges?: RawEdge[],
): Map<string, { x: number; y: number; z: number }> {
  const out = new Map<string, { x: number; y: number; z: number }>();

  if (mode === 'radial') {
    const RING: Record<string, number> = {
      artist: 0, emotion: 90, album: 170, keyword: 170,
      theme: 250, song: 340, tag: 420,
    };
    const byType = new Map<string, N[]>();
    for (const n of nodes) {
      if (!byType.has(n.type)) byType.set(n.type, []);
      byType.get(n.type)!.push(n);
    }
    for (const [type, group] of byType) {
      const r = RING[type] ?? 340;
      group.forEach((n, i) => {
        const a = (i / group.length) * 2 * Math.PI;
        out.set(n.id, {
          x: r === 0 ? 0 : r * Math.cos(a),
          y: Math.sin(i * 1.618 + type.charCodeAt(0)) * 28,
          z: r === 0 ? 0 : r * Math.sin(a),
        });
      });
    }

  } else if (mode === 'sphere') {
    const N = nodes.length;
    const R = Math.max(160, Math.sqrt(N) * 16);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    nodes.forEach((n, i) => {
      const y = 1 - (i / Math.max(1, N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = goldenAngle * i;
      out.set(n.id, { x: R * r * Math.cos(phi), y: R * y, z: R * r * Math.sin(phi) });
    });

  } else if (mode === 'galaxy') {
    const sorted = [...nodes].sort((a, b) =>
      (adj.get(b.id)?.size ?? 0) - (adj.get(a.id)?.size ?? 0),
    );
    const GA = 2.399;
    sorted.forEach((n, i) => {
      const r = 20 + Math.sqrt(i) * 14;
      const phi = i * GA;
      const diskThick = Math.max(0, 80 - r * 0.18);
      const y = Math.sin(i * 0.53) * diskThick * 0.35;
      out.set(n.id, { x: r * Math.cos(phi), y, z: r * Math.sin(phi) });
    });

  } else if (mode === 'solar-system') {
    const artists = nodes.filter(n => n.type === 'artist');
    const albums  = nodes.filter(n => n.type === 'album');
    const songs   = nodes.filter(n => n.type === 'song');
    const others  = nodes.filter(n => !['artist', 'album', 'song'].includes(n.type));

    const starR = Math.max(300, artists.length * 80);
    artists.forEach((a, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      out.set(a.id, { x: starR * Math.cos(phi), y: 0, z: starR * Math.sin(phi) });
    });

    albums.forEach((alb) => {
      const pa = artists.find(a => adj.get(a.id)?.has(alb.id) || adj.get(alb.id)?.has(a.id));
      const siblings = albums.filter(b => {
        const p = artists.find(a => adj.get(a.id)?.has(b.id) || adj.get(b.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx = siblings.indexOf(alb);
      const phi = (idx / Math.max(1, siblings.length)) * 2 * Math.PI;
      const orbitR = 70 + siblings.length * 6;
      const base = pa ? (out.get(pa.id) ?? { x: starR + 160, y: 0, z: 0 }) : { x: starR + 160, y: 0, z: 0 };
      out.set(alb.id, {
        x: base.x + orbitR * Math.cos(phi),
        y: orbitR * 0.28 * Math.sin(phi * 2),
        z: base.z + orbitR * Math.sin(phi),
      });
    });

    songs.forEach((song) => {
      const pa = albums.find(a => adj.get(a.id)?.has(song.id) || adj.get(song.id)?.has(a.id));
      const siblings = songs.filter(s => {
        const p = albums.find(a => adj.get(a.id)?.has(s.id) || adj.get(s.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx = siblings.indexOf(song);
      const phi = (idx / Math.max(1, siblings.length)) * 2 * Math.PI;
      const r = 28;
      const base = pa ? (out.get(pa.id) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
      out.set(song.id, {
        x: base.x + r * Math.cos(phi),
        y: base.y + r * 0.5 * Math.sin(phi * 3),
        z: base.z + r * Math.sin(phi),
      });
    });

    const beltR = starR + 320;
    others.forEach((n, i) => {
      const phi = (i / Math.max(1, others.length)) * 2 * Math.PI;
      out.set(n.id, { x: beltR * Math.cos(phi), y: Math.sin(i * 0.618) * 45, z: beltR * Math.sin(phi) });
    });

  } else if (mode === 'galactic-cinema') {
    const GA = 2.399; // golden angle (radians)
    const artists = nodes.filter(n => n.type === 'artist');
    const albums  = nodes.filter(n => n.type === 'album');
    const allSongs = nodes.filter(n => n.type === 'song');
    const remixes = allSongs.filter(n => (n as { data?: { isRemix?: boolean } }).data?.isRemix === true);
    const planets = allSongs.filter(n => (n as { data?: { isRemix?: boolean } }).data?.isRemix !== true);
    const others  = nodes.filter(n => !['artist', 'album', 'song'].includes(n.type));

    // Black hole(s) at origin (or spread if multiple artists)
    const artistR = Math.max(0, (artists.length - 1) * 120);
    artists.forEach((a, i) => {
      const phi = artists.length > 1 ? (i / artists.length) * 2 * Math.PI : 0;
      out.set(a.id, { x: artistR * Math.cos(phi), y: 0, z: artistR * Math.sin(phi) });
    });

    // Stars (albums) — golden angle spiral around their artist
    albums.forEach((alb) => {
      const pa = artists.find(a => adj.get(a.id)?.has(alb.id) || adj.get(alb.id)?.has(a.id));
      const base = pa ? (out.get(pa.id) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
      const siblingAlbums = albums.filter(b => {
        const p = artists.find(a => adj.get(a.id)?.has(b.id) || adj.get(b.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx = siblingAlbums.indexOf(alb);
      const r = 90 + Math.sqrt(idx + 1) * 28;
      const phi = idx * GA;
      out.set(alb.id, {
        x: base.x + r * Math.cos(phi),
        y: Math.sin(idx * 0.4) * 10,
        z: base.z + r * Math.sin(phi),
      });
    });

    // Planets (regular songs) — rings around their parent album star
    const planetPositions = new Map<string, { x: number; y: number; z: number }>();
    planets.forEach((planet) => {
      const pa = albums.find(a => adj.get(a.id)?.has(planet.id) || adj.get(planet.id)?.has(a.id));
      const siblings = planets.filter(s => {
        const p = albums.find(a => adj.get(a.id)?.has(s.id) || adj.get(s.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx = siblings.indexOf(planet);
      const phi = (idx / Math.max(1, siblings.length)) * 2 * Math.PI;
      const ringIdx = Math.floor(idx / 12);
      const orbitR = 48 + ringIdx * 40;
      const base = pa ? (out.get(pa.id) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
      const pos = {
        x: base.x + orbitR * Math.cos(phi),
        y: base.y + orbitR * 0.2 * Math.sin(phi * 2),
        z: base.z + orbitR * Math.sin(phi),
      };
      out.set(planet.id, pos);
      planetPositions.set(planet.id, pos);
    });

    // Moons (remix songs) — orbiting their original song planet
    remixes.forEach((remix) => {
      const remixOfRawId = (remix as { data?: { remixOfSongId?: string } }).data?.remixOfSongId;
      const parentNodeId = remixOfRawId ? `song:${remixOfRawId}` : undefined;
      const parentPos = parentNodeId ? planetPositions.get(parentNodeId) : undefined;
      if (parentPos) {
        const moonSiblings = remixes.filter(r =>
          (r as { data?: { remixOfSongId?: string } }).data?.remixOfSongId === remixOfRawId,
        );
        const idx = moonSiblings.indexOf(remix);
        const phi = (idx / Math.max(1, moonSiblings.length)) * 2 * Math.PI;
        const moonR = 26;
        out.set(remix.id, {
          x: parentPos.x + moonR * Math.cos(phi),
          y: parentPos.y + moonR * 0.5 * Math.sin(phi * 3),
          z: parentPos.z + moonR * Math.sin(phi),
        });
      } else {
        // Orphaned remix: orbit the album it belongs to (same as a planet)
        const pa = albums.find(a => adj.get(a.id)?.has(remix.id) || adj.get(remix.id)?.has(a.id));
        const base = pa ? (out.get(pa.id) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
        const phi = remix.id.charCodeAt(5) * 0.1; // deterministic scatter
        out.set(remix.id, {
          x: base.x + 62 * Math.cos(phi),
          y: base.y + 8,
          z: base.z + 62 * Math.sin(phi),
        });
      }
    });

    // Others (tags, keywords) — outer asteroid belt
    const outerR = 400 + albums.length * 15;
    others.forEach((n, i) => {
      const phi = (i / Math.max(1, others.length)) * 2 * Math.PI;
      out.set(n.id, { x: outerR * Math.cos(phi), y: Math.sin(i * 0.618) * 45, z: outerR * Math.sin(phi) });
    });

  } else if (mode === 'helix') {
    const songs   = nodes.filter(n => n.type === 'song');
    const albums  = nodes.filter(n => n.type === 'album');
    const artists = nodes.filter(n => n.type === 'artist');
    const others  = nodes.filter(n => !['song', 'album', 'artist'].includes(n.type));
    const songCount = songs.length;

    // Two interleaved strands spiraling up Y axis
    songs.forEach((n, i) => {
      const step   = i;
      const strand = i % 2;
      const angle  = step * 0.72 + (strand === 1 ? Math.PI : 0);
      const radius = 120;
      const pitch  = 22;
      const yCenter = (songCount / 2) * pitch / 2;
      out.set(n.id, {
        x: radius * Math.cos(angle),
        y: step * pitch - yCenter,
        z: radius * Math.sin(angle),
      });
    });

    // Albums in an outer ring
    const albumR = Math.max(220, 180 + albums.length * 4);
    albums.forEach((n, i) => {
      const phi = (i / Math.max(1, albums.length)) * 2 * Math.PI;
      out.set(n.id, {
        x: albumR * Math.cos(phi),
        y: Math.sin(i * 1.618) * 30,
        z: albumR * Math.sin(phi),
      });
    });

    // Artists at the base
    const yBase = -(songCount / 2) * 22 / 2 - 90;
    artists.forEach((n, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      out.set(n.id, {
        x: 70 * Math.cos(phi),
        y: yBase,
        z: 70 * Math.sin(phi),
      });
    });

    // Outer ring for tags, themes, keywords, emotions
    others.forEach((n, i) => {
      const phi = (i / Math.max(1, others.length)) * 2 * Math.PI;
      out.set(n.id, {
        x: 300 * Math.cos(phi),
        y: Math.sin(i * 0.618) * 60,
        z: 300 * Math.sin(phi),
      });
    });

  } else if (mode === 'emotional-spectrum') {
    const SCALE = 320;
    const songs   = nodes.filter(n => n.type === 'song');
    const artists = nodes.filter(n => n.type === 'artist');
    const albums  = nodes.filter(n => n.type === 'album');
    const others  = nodes.filter(n => !['song', 'artist', 'album'].includes(n.type));

    // Emotion axis extremes
    const EMOTION_AXIS: Record<string, { x: number; y: number; z: number }> = {
      'emotion:aggression':  { x: SCALE,        y: 0,            z: 0 },
      'emotion:atmosphere':  { x: 0,             y: 0,            z: SCALE },
      'emotion:emotion':     { x: 0,             y: SCALE,        z: 0 },
      'emotion:psychedelic': { x: -SCALE,        y: 0,            z: 0 },
      'emotion:concept':     { x: 0,             y: -SCALE,       z: 0 },
      'emotion:complexity':  { x: -SCALE * 0.7,  y: SCALE * 0.7,  z: 0 },
    };

    let songScatterIdx = 0;
    songs.forEach((n, idx) => {
      const scores = (n as any).data?.scores as Record<string, number> | undefined;
      if (scores && typeof scores === 'object') {
        const agg  = scores['aggression']  ?? 5;
        const emo  = scores['emotion']     ?? 5;
        const psy  = scores['psychedelic'] ?? 5;
        out.set(n.id, {
          x: (agg - 5) * (SCALE / 5),
          y: (emo - 5) * (SCALE / 5),
          z: (psy - 5) * (SCALE / 5),
        });
      } else {
        // Scatter using golden angle
        const i   = songScatterIdx++;
        const phi = idx * 2.399;
        const r   = 180 + Math.sqrt(i) * 8;
        out.set(n.id, {
          x: r * Math.cos(phi),
          y: Math.sin(idx * 0.7) * 60,
          z: r * Math.sin(phi),
        });
      }
    });

    artists.forEach((n, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      const r   = SCALE * 1.6;
      out.set(n.id, { x: r * Math.cos(phi), y: 0, z: r * Math.sin(phi) });
    });

    albums.forEach((n, i) => {
      const phi = (i / Math.max(1, albums.length)) * 2 * Math.PI;
      const r   = SCALE * 1.2;
      out.set(n.id, { x: r * Math.cos(phi), y: Math.sin(i * 1.2) * 50, z: r * Math.sin(phi) });
    });

    others.forEach((n, i) => {
      const knownPos = EMOTION_AXIS[n.id];
      if (knownPos) {
        out.set(n.id, knownPos);
      } else if (n.id.startsWith('emotion:')) {
        out.set(n.id, { x: SCALE, y: SCALE * 0.5, z: SCALE * 0.5 });
      } else {
        const phi = (i / Math.max(1, others.length)) * 2 * Math.PI;
        const r   = SCALE * 1.8;
        out.set(n.id, { x: r * Math.cos(phi), y: Math.sin(i * 0.618) * 50, z: r * Math.sin(phi) });
      }
    });

  } else if (mode === 'genre-web') {
    const tags    = nodes.filter(n => n.type === 'tag' || n.type === 'theme');
    const albums  = nodes.filter(n => n.type === 'album');
    const songs   = nodes.filter(n => n.type === 'song');
    const artists = nodes.filter(n => n.type === 'artist');
    const keywords = nodes.filter(n => n.type === 'keyword' || n.type === 'emotion');

    // Step 1: Place tags/themes in a ring at r=160, staggered Y
    const tagPositions = new Map<string, { x: number; y: number; z: number }>();
    tags.forEach((n, i) => {
      const phi = (i / Math.max(1, tags.length)) * 2 * Math.PI;
      const pos = {
        x: 160 * Math.cos(phi),
        y: Math.sin(i * 1.618) * 30,
        z: 160 * Math.sin(phi),
      };
      tagPositions.set(n.id, pos);
      out.set(n.id, pos);
    });

    // Step 2: Albums at r=340
    albums.forEach((n, i) => {
      const phi = (i / Math.max(1, albums.length)) * 2 * Math.PI;
      out.set(n.id, { x: 340 * Math.cos(phi), y: 0, z: 340 * Math.sin(phi) });
    });

    // Step 3: Songs cluster near connected tag/theme nodes
    songs.forEach((n) => {
      const connectedTagIds = [...(adj.get(n.id) ?? [])].filter(id => tagPositions.has(id));
      if (connectedTagIds.length > 0) {
        let cx = 0, cy = 0, cz = 0;
        for (const tid of connectedTagIds) {
          const tp = tagPositions.get(tid)!;
          cx += tp.x; cy += tp.y; cz += tp.z;
        }
        cx /= connectedTagIds.length;
        cy /= connectedTagIds.length;
        cz /= connectedTagIds.length;
        // Random offset: r between 30-60
        const seedVal = n.id.charCodeAt(0) + n.id.charCodeAt(n.id.length - 1);
        const rOffset = 30 + (seedVal % 30);
        const angle   = seedVal * 0.5;
        out.set(n.id, {
          x: cx + Math.cos(angle) * rOffset,
          y: cy + Math.sin(seedVal * 0.3) * 20,
          z: cz + Math.sin(angle) * rOffset,
        });
      } else {
        const seedVal = n.id.charCodeAt(0) + n.id.charCodeAt(n.id.length - 1);
        const phi     = seedVal * 2.399;
        out.set(n.id, {
          x: 240 * Math.cos(phi),
          y: Math.sin(seedVal * 0.5) * 30,
          z: 240 * Math.sin(phi),
        });
      }
    });

    // Step 4: Artists at r=520
    artists.forEach((n, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      out.set(n.id, { x: 520 * Math.cos(phi), y: 0, z: 520 * Math.sin(phi) });
    });

    // Step 5: Keywords/emotions at r=420
    keywords.forEach((n, i) => {
      const phi = (i / Math.max(1, keywords.length)) * 2 * Math.PI;
      out.set(n.id, { x: 420 * Math.cos(phi), y: Math.sin(i * 0.618) * 40, z: 420 * Math.sin(phi) });
    });

  } else if (mode === 'fibonacci-torus') {
    const songs   = nodes.filter(n => n.type === 'song');
    const artists = nodes.filter(n => n.type === 'artist');
    const albums  = nodes.filter(n => n.type === 'album');
    const others  = nodes.filter(n => !['song', 'artist', 'album'].includes(n.type));
    const GA = Math.PI * (3 - Math.sqrt(5));
    const R = 220; const rMinor = 60;

    songs.forEach((n, i) => {
      const phi   = i * GA;
      const theta = i * GA * 1.618;
      out.set(n.id, {
        x: (R + rMinor * Math.cos(theta)) * Math.cos(phi),
        y: rMinor * Math.sin(theta),
        z: (R + rMinor * Math.cos(theta)) * Math.sin(phi),
      });
    });
    artists.forEach((n, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      out.set(n.id, { x: 60 * Math.cos(phi), y: 0, z: 60 * Math.sin(phi) });
    });
    const albumR = R + rMinor + 40;
    albums.forEach((n, i) => {
      const phi = (i / Math.max(1, albums.length)) * 2 * Math.PI;
      out.set(n.id, { x: albumR * Math.cos(phi), y: 0, z: albumR * Math.sin(phi) });
    });
    others.forEach((n, i) => {
      const phi = i * GA;
      out.set(n.id, { x: R * 1.5 * Math.cos(phi), y: 120 + Math.sin(i * 1.618) * 40, z: R * 1.5 * Math.sin(phi) });
    });

  } else if (mode === 'fractal-tree') {
    const artists = nodes.filter(n => n.type === 'artist');
    const albums  = nodes.filter(n => n.type === 'album');
    const songs   = nodes.filter(n => n.type === 'song');
    const others  = nodes.filter(n => !['artist', 'album', 'song'].includes(n.type));
    const artistPos = new Map<string, { x: number; y: number; z: number }>();
    const albumPos  = new Map<string, { x: number; y: number; z: number }>();

    artists.forEach((a, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      const pos = artists.length <= 4
        ? { x: (i - (artists.length - 1) / 2) * 200, y: -200, z: 0 }
        : { x: 260 * Math.cos(phi), y: -200, z: 260 * Math.sin(phi) };
      artistPos.set(a.id, pos);
      out.set(a.id, pos);
    });

    albums.forEach((alb) => {
      const pa = artists.find(a => adj.get(a.id)?.has(alb.id) || adj.get(alb.id)?.has(a.id));
      const siblings = albums.filter(b => {
        const p = artists.find(a => adj.get(a.id)?.has(b.id) || adj.get(b.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx  = siblings.indexOf(alb);
      const base = pa ? (artistPos.get(pa.id) ?? { x: 0, y: -200, z: 0 }) : { x: 0, y: -200, z: 0 };
      const phi  = (idx / Math.max(1, siblings.length)) * 2 * Math.PI;
      const pos  = { x: base.x + 80 * Math.cos(phi), y: base.y + 180, z: base.z + 80 * Math.sin(phi) };
      albumPos.set(alb.id, pos);
      out.set(alb.id, pos);
    });

    songs.forEach((song) => {
      const pa = albums.find(a => adj.get(a.id)?.has(song.id) || adj.get(song.id)?.has(a.id));
      const siblings = songs.filter(s => {
        const p = albums.find(a => adj.get(a.id)?.has(s.id) || adj.get(s.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx  = siblings.indexOf(song);
      const base = pa ? (albumPos.get(pa.id) ?? { x: 0, y: -20, z: 0 }) : { x: 0, y: -20, z: 0 };
      const phi  = (idx / Math.max(1, siblings.length)) * 2 * Math.PI;
      out.set(song.id, { x: base.x + 40 * Math.cos(phi), y: base.y + 130, z: base.z + 40 * Math.sin(phi) });
    });

    others.forEach((n, i) => {
      const phi = i * 2.399;
      out.set(n.id, { x: 320 * Math.cos(phi), y: 300 + Math.sin(i * 1.618) * 60, z: 320 * Math.sin(phi) });
    });

  } else if (mode === 'mandala') {
    const artists = nodes.filter(n => n.type === 'artist');
    const albums  = nodes.filter(n => n.type === 'album');
    const songs   = nodes.filter(n => n.type === 'song');
    const others  = nodes.filter(n => !['artist', 'album', 'song'].includes(n.type));

    artists.forEach((n, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      out.set(n.id, { x: 80 * Math.cos(phi), y: Math.sin(phi * 3) * 30, z: 80 * Math.sin(phi) });
    });
    albums.forEach((n, i) => {
      const phi = (i / Math.max(1, albums.length)) * 2 * Math.PI;
      out.set(n.id, { x: 200 * Math.cos(phi), y: Math.sin(phi * 5) * 50, z: 200 * Math.sin(phi) });
    });
    const half1 = Math.ceil(songs.length / 2);
    songs.forEach((n, i) => {
      const ring  = i < half1 ? 310 : 410;
      const count = i < half1 ? half1 : songs.length - half1;
      const idx   = i < half1 ? i : i - half1;
      const phi   = (idx / Math.max(1, count)) * 2 * Math.PI;
      out.set(n.id, { x: ring * Math.cos(phi), y: Math.sin(phi * 7) * 60, z: ring * Math.sin(phi) });
    });
    others.forEach((n, i) => {
      const phi = (i / Math.max(1, others.length)) * 2 * Math.PI;
      out.set(n.id, { x: 500 * Math.cos(phi), y: Math.sin(phi * 4) * 70, z: 500 * Math.sin(phi) });
    });

  } else if (mode === 'wave') {
    const sortOrder: Record<string, number> = { artist: 0, album: 1, song: 2 };
    const sorted = [...nodes].sort((a, b) => (sortOrder[a.type] ?? 3) - (sortOrder[b.type] ?? 3));
    const cols    = Math.ceil(Math.sqrt(sorted.length * 1.6));
    const rows    = Math.ceil(sorted.length / cols);
    const spacing = 55;

    sorted.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = (col - cols / 2) * spacing;
      const z = (row - rows / 2) * spacing;
      const y = 120 * Math.sin((col / cols) * Math.PI * 2) * Math.cos((row / Math.max(1, rows)) * Math.PI);
      out.set(n.id, { x, y, z });
    });

  } else if (mode === 'lissajous') {
    const total = nodes.length;
    nodes.forEach((n, i) => {
      const t = (i / Math.max(1, total - 1)) * 2 * Math.PI;
      out.set(n.id, {
        x: 280 * Math.sin(3 * t),
        y: 220 * Math.sin(5 * t + Math.PI * 0.4),
        z: 180 * Math.sin(7 * t + Math.PI * 0.9),
      });
    });

  } else if (mode === 'crystal') {
    const sortOrder: Record<string, number> = { artist: 0, album: 1, song: 2 };
    const sorted  = [...nodes].sort((a, b) => (sortOrder[a.type] ?? 3) - (sortOrder[b.type] ?? 3));
    const SPACING = 52;
    const LAYERS  = Math.max(3, Math.ceil(Math.cbrt(sorted.length)));
    const totalLayers = Math.ceil(sorted.length / (LAYERS * LAYERS));

    sorted.forEach((n, i) => {
      const layer   = Math.floor(i / (LAYERS * LAYERS));
      const inLayer = i % (LAYERS * LAYERS);
      const row     = Math.floor(inLayer / LAYERS);
      const col     = inLayer % LAYERS;
      const hexOff  = (row % 2) * SPACING * 0.5;
      const x = (col - LAYERS / 2) * SPACING + hexOff;
      const y = layer * SPACING * 0.87 - (totalLayers * SPACING * 0.87) / 2;
      const z = (row - LAYERS / 2) * SPACING * 0.87;
      out.set(n.id, { x, y, z });
    });

  } else if (mode === 'fibonacci-spiral') {
    const sortOrder: Record<string, number> = { artist: 0, album: 1, song: 2 };
    const sorted = [...nodes].sort((a, b) => (sortOrder[a.type] ?? 3) - (sortOrder[b.type] ?? 3));
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    sorted.forEach((n, i) => {
      const r   = Math.sqrt(i) * 22;
      const phi = i * goldenAngle;
      const y   = Math.sin(i * 0.15) * 30 + (sortOrder[n.type] ?? 3) * 15 - 20;
      out.set(n.id, { x: r * Math.cos(phi), y, z: r * Math.sin(phi) });
    });

  } else if (mode === 'genre-radar') {
    // Genre nodes sit at the 6 vertices of a large hexagon.
    // Songs are placed at the weighted centroid of their genre poles.
    // Songs with no genre data cluster near the center.
    const POLE_R = 360;
    const cos60  = 0.5;
    const sin60  = 0.866;
    const GENRE_POLES: Record<string, { x: number; y: number; z: number }> = {
      'genre:metal':      { x: POLE_R,             y: 35,   z: 0 },
      'genre:rock':       { x: POLE_R * cos60,      y: -15,  z: POLE_R * sin60 },
      'genre:pop':        { x: -POLE_R * cos60,     y: 35,   z: POLE_R * sin60 },
      'genre:hiphop':     { x: -POLE_R,             y: -15,  z: 0 },
      'genre:electronic': { x: -POLE_R * cos60,     y: 35,   z: -POLE_R * sin60 },
      'genre:folk':       { x: POLE_R * cos60,      y: -15,  z: -POLE_R * sin60 },
    };

    // Place genre pole nodes at their fixed positions
    for (const [id, pos] of Object.entries(GENRE_POLES)) {
      out.set(id, { ...pos });
    }

    // Build song → genre weights from raw edges (genre_link only)
    const songGenreWeights = new Map<string, Map<string, number>>();
    const endId = (v: string | { id: string }) => (typeof v === 'string' ? v : v.id);
    if (edges) {
      for (const e of edges) {
        if (e.type !== 'genre_link') continue;
        const src = endId(e.source);
        const tgt = endId(e.target);
        if (!songGenreWeights.has(src)) songGenreWeights.set(src, new Map());
        songGenreWeights.get(src)!.set(tgt, e.weight ?? 1);
      }
    }

    const songs   = nodes.filter(n => n.type === 'song');
    const albums  = nodes.filter(n => n.type === 'album');
    const artists = nodes.filter(n => n.type === 'artist');
    const others  = nodes.filter(n => !['song', 'album', 'artist', 'genre'].includes(n.type));
    type V3 = { x: number; y: number; z: number };
    const songPos = new Map<string, V3>();

    let unlinkedIdx = 0;
    for (const song of songs) {
      const weights = songGenreWeights.get(song.id);
      if (weights && weights.size > 0) {
        let wx = 0, wy = 0, wz = 0, totalW = 0;
        for (const [gid, w] of weights) {
          const pole = GENRE_POLES[gid];
          if (!pole) continue;
          wx += pole.x * w; wy += pole.y * w; wz += pole.z * w;
          totalW += w;
        }
        if (totalW > 0) {
          // Pull 80% toward centroid so songs don't sit exactly ON poles
          const seed = song.id.charCodeAt(0) * 7 + song.id.charCodeAt(song.id.length - 1) * 3;
          const jr   = 18 + (seed % 22);
          const ja   = seed * 0.7;
          const pos: V3 = {
            x: (wx / totalW) * 0.78 + Math.cos(ja) * jr,
            y: (wy / totalW) * 0.78 + Math.sin(seed * 0.3) * 10,
            z: (wz / totalW) * 0.78 + Math.sin(ja) * jr,
          };
          songPos.set(song.id, pos);
          out.set(song.id, pos);
        }
      } else {
        // No genre data — golden-angle scatter near center
        const phi = unlinkedIdx * 2.399;
        const r   = 30 + Math.sqrt(unlinkedIdx) * 10;
        const pos: V3 = { x: r * Math.cos(phi), y: Math.sin(unlinkedIdx * 0.618) * 18, z: r * Math.sin(phi) };
        songPos.set(song.id, pos);
        out.set(song.id, pos);
        unlinkedIdx++;
      }
    }

    // Albums: centroid of their songs, slightly elevated
    for (const alb of albums) {
      const connSongs = [...(adj.get(alb.id) ?? [])].filter(id => songPos.has(id));
      if (connSongs.length > 0) {
        let cx = 0, cy = 0, cz = 0;
        for (const sid of connSongs) { const sp = songPos.get(sid)!; cx += sp.x; cy += sp.y; cz += sp.z; }
        out.set(alb.id, { x: cx / connSongs.length, y: cy / connSongs.length + 38, z: cz / connSongs.length });
      } else {
        const phi = albums.indexOf(alb) / Math.max(1, albums.length) * 2 * Math.PI;
        out.set(alb.id, { x: POLE_R * 1.1 * Math.cos(phi), y: 55, z: POLE_R * 1.1 * Math.sin(phi) });
      }
    }

    // Artists: outer ring well beyond the hex
    artists.forEach((a, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      out.set(a.id, { x: POLE_R * 1.5 * Math.cos(phi), y: 80, z: POLE_R * 1.5 * Math.sin(phi) });
    });

    // Other nodes (tags, themes, etc.): outer belt
    others.forEach((n, i) => {
      const phi = (i / Math.max(1, others.length)) * 2 * Math.PI;
      out.set(n.id, { x: POLE_R * 1.75 * Math.cos(phi), y: Math.sin(i * 0.618) * 45, z: POLE_R * 1.75 * Math.sin(phi) });
    });

  } else if (
    mode === 'star-3' || mode === 'star-4' || mode === 'star-5' ||
    mode === 'star-6' || mode === 'star-7' || mode === 'star-8'
  ) {
    const nPoints = parseInt(mode.split('-')[1]!, 10);
    computeStarLayout(nodes, nPoints, adj, out);

  } else if (mode === 'nonagon-infinity') {
    computeNonagonLayout(nodes, adj, out);

  } else if (mode === 'lyric-solar') {
    // Full orbital hierarchy: artists at center, albums orbit artists,
    // songs orbit albums, keywords/lyrics/tags orbit their connected songs.
    const artists = nodes.filter(n => n.type === 'artist');
    const albums  = nodes.filter(n => n.type === 'album');
    const songs   = nodes.filter(n => n.type === 'song');
    const others  = nodes.filter(n => !['artist', 'album', 'song'].includes(n.type));

    // Artists at/near origin (single artist → center; multiple → small ring)
    const artistR = Math.max(0, (artists.length - 1) * 100);
    artists.forEach((a, i) => {
      const phi = artists.length > 1 ? (i / artists.length) * 2 * Math.PI : 0;
      out.set(a.id, { x: artistR * Math.cos(phi), y: 0, z: artistR * Math.sin(phi) });
    });

    // Albums orbit their artist
    const albumPos = new Map<string, { x: number; y: number; z: number }>();
    albums.forEach((alb) => {
      const pa = artists.find(a => adj.get(a.id)?.has(alb.id) || adj.get(alb.id)?.has(a.id));
      const siblings = albums.filter(b => {
        const p = artists.find(a => adj.get(a.id)?.has(b.id) || adj.get(b.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx    = siblings.indexOf(alb);
      const phi    = (idx / Math.max(1, siblings.length)) * 2 * Math.PI;
      const orbitR = 80 + siblings.length * 8;
      const base   = pa ? (out.get(pa.id) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
      const pos    = {
        x: base.x + orbitR * Math.cos(phi),
        y: orbitR * 0.25 * Math.sin(phi * 2),
        z: base.z + orbitR * Math.sin(phi),
      };
      albumPos.set(alb.id, pos);
      out.set(alb.id, pos);
    });

    // Songs orbit their album — multi-ring for albums with many songs
    const songPos = new Map<string, { x: number; y: number; z: number }>();
    songs.forEach((song) => {
      const pa = albums.find(a => adj.get(a.id)?.has(song.id) || adj.get(song.id)?.has(a.id));
      const siblings = songs.filter(s => {
        const p = albums.find(a => adj.get(a.id)?.has(s.id) || adj.get(s.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx     = siblings.indexOf(song);
      const ringIdx = Math.floor(idx / 12);
      const rRing   = 36 + ringIdx * 24;
      const count   = Math.min(12, siblings.length - ringIdx * 12);
      const phiRing = ((idx % 12) / Math.max(1, count)) * 2 * Math.PI;
      const base    = pa ? (albumPos.get(pa.id) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
      const pos     = {
        x: base.x + rRing * Math.cos(phiRing),
        y: base.y + rRing * 0.4 * Math.sin(phiRing * 2),
        z: base.z + rRing * Math.sin(phiRing),
      };
      songPos.set(song.id, pos);
      out.set(song.id, pos);
    });

    // Keywords / tags / themes / emotions orbit their connected songs.
    // Pre-group each keyword to its first connected song.
    const kwBySong = new Map<string, string[]>();
    for (const kw of others) {
      const primarySong = [...(adj.get(kw.id) ?? [])].find(id => songPos.has(id));
      if (primarySong) {
        if (!kwBySong.has(primarySong)) kwBySong.set(primarySong, []);
        kwBySong.get(primarySong)!.push(kw.id);
      }
    }

    for (const kw of others) {
      const primarySong = [...(adj.get(kw.id) ?? [])].find(id => songPos.has(id));
      if (primarySong && songPos.has(primarySong)) {
        const base     = songPos.get(primarySong)!;
        const groupArr = kwBySong.get(primarySong) ?? [kw.id];
        const kwIdx    = groupArr.indexOf(kw.id);
        const ringIdx  = Math.floor(kwIdx / 8);
        const rRing    = 20 + ringIdx * 14;
        const count    = Math.min(8, groupArr.length - ringIdx * 8);
        const phiKw    = ((kwIdx % 8) / Math.max(1, count)) * 2 * Math.PI;
        out.set(kw.id, {
          x: base.x + rRing * Math.cos(phiKw),
          y: base.y + rRing * 0.4 * Math.sin(phiKw * 2),
          z: base.z + rRing * Math.sin(phiKw),
        });
      } else {
        // Orphaned: outer halo
        const i     = others.indexOf(kw);
        const beltR = 180 + albums.length * 12;
        const phi   = (i / Math.max(1, others.length)) * 2 * Math.PI;
        out.set(kw.id, { x: beltR * Math.cos(phi), y: Math.sin(i * 0.618) * 30, z: beltR * Math.sin(phi) });
      }
    }
  }

  return out;
}

export function animateArrange<N extends ArrangeNode>(
  nodes: N[],
  targets: Map<string, { x: number; y: number; z: number }>,
  fg: { current: unknown } | { refresh?: () => void },
  durationMs = 1400,
): void {
  // Accept either a React ref ({ current: fg }) or a direct fg instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgInst: any = (fg as any)?.current !== undefined ? (fg as any).current : fg;
  const startTime = performance.now();
  const snapshots = new Map(nodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }]));

  const step = (now: number) => {
    const raw = Math.min(1, (now - startTime) / durationMs);
    const t = easeInOutQuad(raw);
    nodes.forEach(n => {
      const snap = snapshots.get(n.id);
      const tgt = targets.get(n.id);
      if (!snap || !tgt) return;
      const fx = snap.x + (tgt.x - snap.x) * t;
      const fy = snap.y + (tgt.y - snap.y) * t;
      const fz = snap.z + (tgt.z - snap.z) * t;
      n.fx = fx; n.fy = fy; n.fz = fz;
      n.x  = fx; n.y  = fy; n.z  = fz;
    });
    fgInst?.refresh?.();
    if (raw < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
