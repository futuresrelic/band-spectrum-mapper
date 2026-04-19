import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { userService } from '../services/userService.js';
import { requireAuth } from '../middleware/requireAuth.js';
import type { AuthTokenPayload } from '../middleware/requireAuth.js';

const CLIENT_ID       = process.env['GOOGLE_CLIENT_ID'] ?? '';
const CLIENT_SECRET   = process.env['GOOGLE_CLIENT_SECRET'] ?? '';
const CALLBACK_URL    = process.env['GOOGLE_CALLBACK_URL'] ?? 'http://localhost:3001/api/auth/google/callback';
const WEB_URL         = process.env['WEB_URL'] ?? 'http://localhost:3000';
const JWT_SECRET      = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';

if (CLIENT_ID && CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      { clientID: CLIENT_ID, clientSecret: CLIENT_SECRET, callbackURL: CALLBACK_URL },
      async (_access, _refresh, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value ?? '';
          const user = await userService.findOrCreate({
            googleId: profile.id,
            email,
            ...(profile.displayName ? { name: profile.displayName } : {}),
            ...(profile.photos?.[0]?.value ? { avatarUrl: profile.photos[0].value } : {}),
          });
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );
} else {
  console.warn('[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google login disabled');
}

export const authRouter = Router();

authRouter.get('/google', (req, res, next) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(503).json({ error: 'Google login is not configured on this server' });
    return;
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

authRouter.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${WEB_URL}?authError=true` }),
  (req, res) => {
    // req.user is set by passport after the strategy callback
    const u = req.user as unknown as { id: string; email: string; name: string | null; avatarUrl: string | null };
    const payload: AuthTokenPayload = {
      userId: u.id,
      email: u.email,
      ...(u.name ? { name: u.name } : {}),
      ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
    res.redirect(`${WEB_URL}?token=${encodeURIComponent(token)}`);
  },
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// Client drops the token; this endpoint exists for symmetry / future blocklist
authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
