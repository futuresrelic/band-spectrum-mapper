/**
 * Shared 3D graph layout utilities.
 * Extracted here so ThreeDGraphView and CinemaPage can both use them
 * without duplicating ~200 lines of pure math.
 */

export type ArrangeMode = 'natural' | 'radial' | 'sphere' | 'galaxy' | 'solar-system' | 'helix' | 'emotional-spectrum' | 'genre-web';

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

export function computeArrangeTargets<N extends ArrangeNode>(
  nodes: N[],
  mode: ArrangeMode,
  adj: Map<string, Set<string>>,
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
      n.fx = snap.x + (tgt.x - snap.x) * t;
      n.fy = snap.y + (tgt.y - snap.y) * t;
      n.fz = snap.z + (tgt.z - snap.z) * t;
    });
    fgInst?.refresh?.();
    if (raw < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
