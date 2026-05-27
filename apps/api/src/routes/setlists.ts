import { Router, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

export const setlistsRouter = Router();
setlistsRouter.use(requireAuth);

const SETLIST_BASE = 'https://api.setlist.fm/rest/1.0';

function getApiKey(res: Response): string | null {
  const key = process.env['SETLISTFM_API_KEY'];
  if (!key) {
    res.status(503).json({ error: 'SETLISTFM_API_KEY not configured — add it in Railway environment variables' });
    return null;
  }
  return key;
}

async function setlistFetch(path: string, key: string) {
  const resp = await fetch(`${SETLIST_BASE}${path}`, {
    headers: { 'x-api-key': key, Accept: 'application/json' },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw Object.assign(new Error(`setlist.fm ${resp.status}: ${body}`), { status: resp.status });
  }
  return resp.json() as Promise<unknown>;
}

// GET /api/setlists/search/artists?name=Tool&p=1
setlistsRouter.get('/search/artists', async (req, res, next): Promise<void> => {
  try {
    const key = getApiKey(res);
    if (!key) return;

    const name = req.query['name'];
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name query param required' });
      return;
    }
    const page = typeof req.query['p'] === 'string' ? req.query['p'] : '1';
    const data = await setlistFetch(
      `/search/artists?artistName=${encodeURIComponent(name)}&p=${page}&sort=relevance`,
      key,
    );
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/setlists/artist/:mbid/setlists?p=1
setlistsRouter.get('/artist/:mbid/setlists', async (req, res, next): Promise<void> => {
  try {
    const key = getApiKey(res);
    if (!key) return;

    const mbid = req.params['mbid'];
    if (!mbid) { res.status(400).json({ error: 'mbid required' }); return; }

    const page = typeof req.query['p'] === 'string' ? req.query['p'] : '1';
    const data = await setlistFetch(`/artist/${mbid}/setlists?p=${page}`, key);
    res.json(data);
  } catch (e) { next(e); }
});
