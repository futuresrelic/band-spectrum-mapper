import { prisma } from './prisma.js';

const ADJECTIVES = [
  'ancient', 'amber', 'arctic', 'bold', 'brave', 'bright', 'calm',
  'clever', 'cosmic', 'dark', 'deep', 'distant', 'electric', 'endless',
  'epic', 'fierce', 'fluid', 'free', 'fresh', 'golden', 'grand',
  'hidden', 'hollow', 'iron', 'keen', 'light', 'loyal', 'lucid',
  'lunar', 'mystic', 'noble', 'northern', 'patient', 'polar', 'proud',
  'pure', 'quick', 'quiet', 'rare', 'rich', 'royal', 'sharp',
  'silent', 'silver', 'sleek', 'smooth', 'solar', 'sonic', 'stark',
  'still', 'stormy', 'swift', 'tidal', 'true', 'vast', 'vivid',
  'warm', 'wild', 'wise',
];

const NOUNS = [
  'albatross', 'anvil', 'apex', 'atlas', 'aurora', 'beacon',
  'bear', 'canyon', 'cascade', 'circuit', 'comet', 'condor',
  'crane', 'delta', 'dusk', 'eagle', 'echo', 'ember', 'falcon',
  'flare', 'flux', 'forge', 'harbor', 'hawk', 'heron', 'horizon',
  'lynx', 'mesa', 'nebula', 'nova', 'orbit', 'panther', 'peak',
  'phoenix', 'pine', 'prism', 'pulse', 'raven', 'reef', 'ridge',
  'river', 'shard', 'signal', 'spark', 'stag', 'summit', 'tide',
  'timber', 'vortex', 'wave', 'wolf', 'zenith',
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateCandidate(suffix?: number): string {
  const adj  = randomItem(ADJECTIVES);
  const noun = randomItem(NOUNS);
  return suffix !== undefined ? `${adj}-${noun}-${suffix}` : `${adj}-${noun}`;
}

export async function generateUniqueUsername(): Promise<string> {
  // Try a plain adjective-noun first, then add numeric suffixes until unique.
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt < 10
      ? generateCandidate()
      : generateCandidate(Math.floor(Math.random() * 9000) + 1000);

    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (!existing) return candidate;
  }
  // Extremely unlikely fallback: timestamp-based
  return `user-${Date.now()}`;
}
