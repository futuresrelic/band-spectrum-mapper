import { Router } from 'express';
import { discographyImportService } from '../services/discographyImportService.js';
import { HttpError } from '../middleware/errorHandler.js';

export const discographyRouter = Router();

// POST /api/discography/import?dry=true  — dry-run preview
// POST /api/discography/import           — real import
discographyRouter.post('/import', async (req, res, next) => {
  try {
    const { payload, dryRun } = req.body as { payload?: unknown; dryRun?: unknown };
    if (payload === undefined || payload === null) {
      throw new HttpError(400, 'payload is required');
    }
    const dry = dryRun === true || dryRun === 'true';
    res.json(await discographyImportService.run(payload, dry));
  } catch (e) { next(e); }
});
