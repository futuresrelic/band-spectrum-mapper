import { api } from '../lib/api';

export interface DuelBand {
  id: string;
  name: string;
  _count: { songs: number };
}

export interface DuelSong {
  id: string;
  title: string;
  album: { title: string; albumType: string } | null;
}

export interface DuelRule {
  id: string;
  name: string;
  shortDesc: string;
  description: string;
}

export interface MatchSetup {
  playerBandId: string;
  playerBandName: string;
  rivalBandId: string;
  rivalBandName: string;
  theme: string;
  themeDescription: string;
  rules: DuelRule[];
  introSpeech: string;
  rivalPickReason: string | null;
  totalRounds: number;
  difficulty: string;
  mode: string;
}

export interface BreakdownItem {
  ruleName: string;
  playerScore: number;
  rivalScore: number;
  note: string;
}

export interface RoundResult {
  playerSongId: string;
  playerSongTitle: string;
  playerLyricsExcerpt: string;
  rivalSongId: string;
  rivalSongTitle: string;
  rivalLyricsExcerpt: string;
  playerScore: number;
  rivalScore: number;
  breakdown: BreakdownItem[];
  playerHighlight: string;
  rivalHighlight: string;
  commentary: string;
  roundWinner: 'player' | 'rival' | 'draw';
}

export interface DuelScore {
  rank: number;
  playerDisplayName: string;
  avatarUrl: string | null;
  playerName: string;
  rivalName: string;
  playerPoints: number;
  rivalPoints: number;
  playerWins: number;
  rivalWins: number;
  totalRounds: number;
  theme: string;
  difficulty: string;
  mode: string;
  createdAt: string;
}

export const lyricDuelApi = {
  getBands(): Promise<DuelBand[]> {
    return api.get<DuelBand[]>('/api/lyric-duel/bands');
  },

  getSongs(bandId: string): Promise<DuelSong[]> {
    return api.get<DuelSong[]>(`/api/lyric-duel/songs?bandId=${encodeURIComponent(bandId)}`);
  },

  startMatch(data: {
    playerBandId: string;
    rivalBandId?: string;
    mode: string;
    difficulty: string;
    ruleCount?: number;
  }): Promise<MatchSetup> {
    return api.post<MatchSetup>('/api/lyric-duel/start', data);
  },

  playRound(data: {
    playerBandId: string;
    rivalBandId: string;
    theme: string;
    themeDescription: string;
    rules: DuelRule[];
    difficulty: string;
    roundIndex: number;
    usedPlayerSongIds: string[];
    usedRivalSongIds: string[];
    playerBandName: string;
    rivalBandName: string;
    albumTypes?: string[];
    forcedPlayerSongId?: string;
    forcedRivalSongId?: string;
  }): Promise<RoundResult> {
    return api.post<RoundResult>('/api/lyric-duel/round', data);
  },

  saveScore(data: {
    playerBandId: string;
    rivalBandId: string;
    playerName: string;
    rivalName: string;
    playerPoints: number;
    rivalPoints: number;
    playerWins: number;
    rivalWins: number;
    totalRounds: number;
    difficulty: string;
    mode: string;
    theme: string;
    won: boolean;
  }): Promise<{ ok: boolean; rank: number }> {
    return api.post<{ ok: boolean; rank: number }>('/api/lyric-duel/scores', data);
  },

  getScores(difficulty = 'normal', limit = 15): Promise<DuelScore[]> {
    return api.get<DuelScore[]>(`/api/lyric-duel/scores?difficulty=${encodeURIComponent(difficulty)}&limit=${limit}`);
  },
};
