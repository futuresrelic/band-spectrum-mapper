/**
 * Shared 3D graph layout utilities.
 * Extracted here so ThreeDGraphView and CinemaPage can both use them
 * without duplicating ~200 lines of pure math.
 */

export type ArrangeMode = 'natural' | 'radial' | 'sphere' | 'galaxy' | 'solar-system';

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
