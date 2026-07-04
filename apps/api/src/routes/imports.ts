import { Router } from 'express';
import multer from 'multer';
import { importService } from '../services/importService.js';
import { scoreImportService } from '../services/scoreImportService.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const importsRouter = Router();

// Admin-only — bulk file/paste import writes directly to canonical Band/Album/
// Song/Lyric/score data with no review step.
importsRouter.use(requireAuth);
importsRouter.use(requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    const allowed = ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/x-markdown'];
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const allowedExt = ['txt', 'md', 'csv', 'json'];
    if (allowed.includes(file.mimetype) || allowedExt.includes(ext ?? '')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Use .txt, .md, .csv, or .json'));
    }
  },
});

importsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await importService.list());
  } catch (e) { next(e); }
});

importsRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'No file uploaded');

    const bandId = typeof req.body['bandId'] === 'string' ? req.body['bandId'] : '';
    if (!bandId) throw new HttpError(400, 'bandId is required');

    const content = req.file.buffer.toString('utf-8');

    const result = await importService.processImport({
      bandId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      content,
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// Paste-based score import — accepts a flat array OR a nested { artist, albums } discography object
importsRouter.post('/scores', async (req, res, next) => {
  try {
    const { bandId, scores } = req.body as { bandId?: string; scores?: unknown };
    if (!bandId || typeof bandId !== 'string') throw new HttpError(400, 'bandId is required');
    if (scores === undefined || scores === null) throw new HttpError(400, 'scores is required');
    res.json(await scoreImportService.importScores(bandId, scores));
  } catch (e) { next(e); }
});
