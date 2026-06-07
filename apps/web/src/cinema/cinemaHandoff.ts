/** Thin localStorage bridge: research tools → Cinema Mode band/tour preset. */

export interface CinemaHandoff {
  label: string;
  bandIds: string[];
  /** Optional graph preset to load. Defaults to 'artist-universe' if absent. */
  preset?: 'lyrical-dna';
  createdAt: string;
}

const KEY = 'cinema-handoff';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Save a handoff; Cinema will read it on next mount. */
export function pushCinemaHandoff(handoff: Omit<CinemaHandoff, 'createdAt'>): void {
  const full: CinemaHandoff = { ...handoff, createdAt: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(full)); } catch { /* ignore */ }
}

/** Read and consume the handoff (removes it from localStorage). Returns null if expired or absent. */
export function popCinemaHandoff(): CinemaHandoff | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as CinemaHandoff;
    localStorage.removeItem(KEY);
    if (Date.now() - new Date(h.createdAt).getTime() > MAX_AGE_MS) return null;
    return h;
  } catch {
    return null;
  }
}
