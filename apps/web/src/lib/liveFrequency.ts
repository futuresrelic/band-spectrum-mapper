// Unified Live Frequency tier system.
// Replaces the old dual-concept "Game Rarity" + "Live Frequency" display.
// BandRpgSongProfile.liveStatus is the canonical source; Song.rarity is the fallback.

export type LiveFrequencyTier =
  | 'Essential'    // Staple live performance
  | 'Frequent'     // Common live performance
  | 'Occasional'   // Occasional live performance
  | 'Rare'         // Rare live performance
  | 'Legendary'    // Extremely rare live performance
  | 'Mythic'       // Never played live
  | 'Unclassified'; // No data available

// Maps BandRpgSongProfile.liveStatus → LiveFrequencyTier
export function tierFromLiveStatus(status: string): LiveFrequencyTier {
  switch (status) {
    case 'Staple':         return 'Essential';
    case 'Common':         return 'Frequent';
    case 'Occasional':     return 'Occasional';
    case 'Rare':           return 'Rare';
    case 'Extremely Rare': return 'Legendary';
    case 'Never Played':   return 'Mythic';
    default:               return 'Unclassified';
  }
}

// Maps Song.rarity (SongRarity enum) → LiveFrequencyTier as an estimated fallback
export function tierFromRarity(rarity: string): LiveFrequencyTier {
  switch (rarity) {
    case 'Common':    return 'Frequent';
    case 'Uncommon':  return 'Occasional';
    case 'Rare':      return 'Rare';
    case 'Legendary': return 'Legendary';
    case 'Mythic':    return 'Mythic';
    default:          return 'Unclassified';
  }
}

// Canonical derivation function.
// Prefers real liveStatus data; falls back to Song.rarity with source='estimated'.
export function deriveLiveFrequency(
  liveStatus: string | null | undefined,
  fallbackRarity: string | null | undefined,
): { tier: LiveFrequencyTier; source: 'live' | 'estimated' } {
  if (liveStatus && liveStatus !== 'Unknown') {
    return { tier: tierFromLiveStatus(liveStatus), source: 'live' };
  }
  if (fallbackRarity) {
    return { tier: tierFromRarity(fallbackRarity), source: 'estimated' };
  }
  return { tier: 'Unclassified', source: 'estimated' };
}

export const LIVE_FREQUENCY_TIER_ORDER: LiveFrequencyTier[] = [
  'Essential', 'Frequent', 'Occasional', 'Rare', 'Legendary', 'Mythic', 'Unclassified',
];

export const LIVE_FREQUENCY_COLOR: Record<LiveFrequencyTier, string> = {
  Essential:     'text-emerald-400',
  Frequent:      'text-sky-400',
  Occasional:    'text-blue-400',
  Rare:          'text-violet-400',
  Legendary:     'text-amber-400',
  Mythic:        'text-pink-400',
  Unclassified:  'text-gray-500',
};

export const LIVE_FREQUENCY_BG: Record<LiveFrequencyTier, { bg: string; border: string; glow: string }> = {
  Essential:     { bg: 'bg-emerald-950/60',  border: 'border-emerald-800/60',  glow: '0 0 40px rgba(52,211,153,0.12)'   },
  Frequent:      { bg: 'bg-sky-950/60',      border: 'border-sky-800/60',      glow: '0 0 40px rgba(56,189,248,0.10)'   },
  Occasional:    { bg: 'bg-blue-950/60',     border: 'border-blue-800/60',     glow: ''                                  },
  Rare:          { bg: 'bg-violet-950/60',   border: 'border-violet-800/60',   glow: '0 0 40px rgba(167,139,250,0.12)'  },
  Legendary:     { bg: 'bg-amber-950/60',    border: 'border-amber-800/60',    glow: '0 0 40px rgba(251,191,36,0.15)'   },
  Mythic:        { bg: 'bg-pink-950/60',     border: 'border-pink-800/60',     glow: '0 0 40px rgba(244,114,182,0.15)'  },
  Unclassified:  { bg: 'bg-slate-900/60',    border: 'border-slate-700/60',    glow: ''                                  },
};

export const LIVE_FREQUENCY_EMOJI: Record<LiveFrequencyTier, string> = {
  Essential:     '⚪',
  Frequent:      '🟢',
  Occasional:    '🔵',
  Rare:          '🟣',
  Legendary:     '🟡',
  Mythic:        '🟠',
  Unclassified:  '⬛',
};

// Score bonuses for Band RPG — based on how hard it is to encounter a song live.
// Essential/Frequent songs are easy to collect → no bonus.
// Rarer tiers reward the player more.
export const LIVE_FREQUENCY_SCORE_BONUS: Record<LiveFrequencyTier, number> = {
  Essential:     0,
  Frequent:      0,
  Occasional:    25,
  Rare:          75,
  Legendary:     200,
  Mythic:        500,
  Unclassified:  0,
};
