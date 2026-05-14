/**
 * Song Nodes routes — builds Cytoscape.js graph data for the network view.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { buildGraph, listScopeOptions, type GraphLayoutPreset } from '../services/songNodesService.js';

export const songNodesRouter = Router();
songNodesRouter.use(requireAuth);
songNodesRouter.use(requireAdmin);

const VALID_PRESETS: GraphLayoutPreset[] = [
  'artist-universe', 'album-cluster', 'theme-constellation',
  'maynard-universe', 'emotional-similarity', 'lyrical-dna',
];

// GET /api/song-nodes?preset=artist-universe&bandIds=id1,id2&albumId=id
songNodesRouter.get('/', async (req, res, next): Promise<void> => {
  try {
    const preset = (req.query['preset'] as string) ?? 'artist-universe';
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const albumId = (req.query['albumId'] as string) ?? '';

    if (!VALID_PRESETS.includes(preset as GraphLayoutPreset)) {
      res.status(400).json({ error: `preset must be one of: ${VALID_PRESETS.join(', ')}` });
      return;
    }

    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').filter(Boolean) : [];
    const data = await buildGraph(preset as GraphLayoutPreset, {
      bandIds,
      ...(albumId ? { albumId } : {}),
    });

    res.json(data);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) {
      res.status((err as Error & { statusCode: number }).statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// GET /api/song-nodes/scopes — list bands and albums for UI selectors
songNodesRouter.get('/scopes', async (_req, res, next): Promise<void> => {
  try {
    const data = await listScopeOptions();
    res.json(data);
  } catch (err) { next(err); }
});
