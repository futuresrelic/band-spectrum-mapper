const BASE = import.meta.env['VITE_API_URL'] ?? '';

export interface DiscographyImportRow {
  albumTitle: string;
  trackNumber: number;
  songTitle: string;
  songSlug: string;
  songAction: 'create' | 'existing';
  scoreAction: 'create' | 'update' | 'unchanged';
  scores: {
    aggression: number;
    complexity: number;
    atmosphere: number;
    emotion: number;
    psychedelic: number;
    concept: number;
  };
}

export interface DiscographyImportResult {
  dryRun: boolean;
  band: { name: string; slug: string; action: 'create' | 'existing' };
  totals: {
    albums: { created: number; existing: number };
    songs: { created: number; existing: number };
    scores: { created: number; updated: number; unchanged: number };
  };
  rows: DiscographyImportRow[];
}

export const discographyApi = {
  async run(payload: unknown, dryRun: boolean): Promise<DiscographyImportResult> {
    const res = await fetch(`${BASE}/api/discography/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, dryRun }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? 'Import failed');
    }
    return res.json() as Promise<DiscographyImportResult>;
  },
};
