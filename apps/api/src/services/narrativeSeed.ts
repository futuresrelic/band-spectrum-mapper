/**
 * Headliner — deterministic seeded narrative selection (Creative Bible §16.B)
 *
 * Some template pools carry more than one equally-eligible variant for the
 * same conditions (e.g. two "≥800" opening lines) — intentional flavor
 * variants, not duplicates. Previously the first array entry always won,
 * so they never rotated. This picks among tied variants using a stable
 * hash of show data instead of Math.random(): the same seed always
 * resolves to the same variant (a reopened show reads identically), while
 * different shows can land on different variants.
 */

function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Combines the given parts into one stable string and hashes it (FNV-1a, 32-bit). */
export function stableTemplateHash(...parts: readonly string[]): number {
  return fnv1aHash(parts.join('::'));
}

/** Deterministically picks one of `items` using a hash of `seedParts`. Never random, never time-based. */
export function pickBySeededHash<T>(items: readonly T[], ...seedParts: readonly string[]): T {
  if (items.length <= 1) return items[0]!;
  const index = stableTemplateHash(...seedParts) % items.length;
  return items[index]!;
}
