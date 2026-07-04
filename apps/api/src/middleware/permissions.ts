// Band Spectrum Mapper's permission model, formalized — Phase Z.17.6.
//
// Three tiers. Everything in the app maps to exactly one:
//
//   PUBLIC  Anyone, no auth. Browsing, viewing, reading — the Wiki, Song
//           Cards, spectrum/rhythm/live-frequency displays, stats.
//   PLAYER  Any logged-in user. May create/edit/delete ONLY rows they own:
//           personal ratings, notes, favorites, playlists/setlists,
//           collection, comments. Never the canonical catalog.
//   ADMIN   Curators. The only tier that may create/edit/delete canonical
//           data: Band/Album/Song/Lyric, Spectrum/Rhythm/Theme/Genre/
//           Summary scores, metadata, media, trivia — plus everything that
//           triggers generation, repair, external fetches, or moderation.
//
// This file does not introduce a new enforcement mechanism — Express
// middleware (requireAuth / requireAdmin / optionalAuth, all re-exported
// below) already does the enforcement and every route already uses them.
// What this file adds:
//   1. One documented vocabulary (Capability) so a route's *intent* is
//      named, not just its middleware chain — grep for a capability to find
//      every route that claims it.
//   2. requireOwner(), a single reusable ownership guard, so new
//      player-owned-resource routes don't each hand-roll
//      `row.userId !== req.user.userId`.
//
// Existing ownership checks in comments.ts, tagProposals.ts, bandRpg.ts
// (setlists), curatorRoutes.ts, appreciationRoutes.ts, ratings.ts, and
// genre-ratings.ts were audited in Z.17.6 and are already correct — they
// were not mass-migrated to requireOwner() purely for style; new
// player-owned routes should use it going forward.

import type { Request, Response, NextFunction } from 'express';

export type Capability =
  | 'canView'          // PUBLIC — read anything public-facing
  | 'canRate'          // PLAYER — personal + community ratings
  | 'canComment'       // PLAYER — post/delete own comments
  | 'canEditOwn'       // PLAYER — own notes/favorites/playlists/setlists/collection
  | 'canModerate'      // ADMIN  — approve/reject player-submitted contributions
  | 'canEditCanonical' // ADMIN  — Band/Album/Song/Lyric/metadata
  | 'canGenerate'      // ADMIN  — trigger AI analysis generation
  | 'canRepair'        // ADMIN  — re-run/regenerate existing analysis
  | 'canFetch'         // ADMIN  — pull external data (Setlist.fm, MusicBrainz, YouTube)
  | 'canDelete';       // ADMIN  — remove canonical data or media

export const CAPABILITY_TIER: Record<Capability, 'public' | 'player' | 'admin'> = {
  canView: 'public',
  canRate: 'player',
  canComment: 'player',
  canEditOwn: 'player',
  canModerate: 'admin',
  canEditCanonical: 'admin',
  canGenerate: 'admin',
  canRepair: 'admin',
  canFetch: 'admin',
  canDelete: 'admin',
};

export { requireAuth, optionalAuth } from './requireAuth.js';
export { requireAdmin } from './requireAdmin.js';

/**
 * Ownership guard for canEditOwn routes. `getOwnerId` loads the target row
 * and returns the userId that owns it (or null if the row doesn't exist).
 * The request proceeds only if the row exists AND the caller owns it or is
 * an admin. Must run after requireAuth.
 */
export function requireOwner(getOwnerId: (req: Request) => Promise<string | null>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
    const ownerId = await getOwnerId(req);
    if (ownerId === null) { res.status(404).json({ error: 'Not found' }); return; }
    if (ownerId !== req.user.userId && !req.user.isAdmin) {
      res.status(403).json({ error: 'You do not own this resource' });
      return;
    }
    next();
  };
}
