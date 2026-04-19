import { Router } from 'express';
import multer from 'multer';
import { importService } from '../services/importService.js';
import { scoreImportService } from '../services/scoreImportService.js';
import { HttpError } from '../middleware/errorHandler.js';

export const importsRouter = Router();

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

// Paste-based score import
importsRouter.post('/scores', async (req, res, next) => {
  try {
    const { bandId, scores } = req.body as { bandId?: string; scores?: unknown };
    if (!bandId || typeof bandId !== 'string') throw new HttpError(400, 'bandId is required');
    if (!Array.isArray(scores)) throw new HttpError(400, 'scores must be an array');
    res.json(await scoreImportService.importScores(bandId, scores));
  } catch (e) { next(e); }
});
