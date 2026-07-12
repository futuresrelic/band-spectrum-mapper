/**
 * Headliner — Concert Review System (Creative Bible §7, Phase Z.17.13)
 *
 * Centralized, deterministic template data for the post-show review. This
 * replaces the small set of hardcoded sentences concertEngine.ts previously
 * built inline. No runtime AI anywhere: every sentence is picked by matching
 * real, engine-computed metric thresholds against a fixed template pool —
 * identical inputs always produce the identical review.
 *
 * A review is Opening + Identity + Crowd + Pacing + Encore/Ending + Closing
 * verdict (Bible §7.1). Selection rule: among templates whose conditions all
 * hold, the most specific one wins (most conditions first); ties fall back
 * to a fixed array order. Some same-band template pairs in the Bible list
 * more than one flavor for the identical threshold (e.g. two "≥800" opening
 * lines) — those are intentional future variants for seeded rotation (Bible
 * §16.B, not implemented this phase); today the first one deterministically
 * wins every time, which still satisfies "same inputs ⇒ same review."
 *
 * ENC-09 (Bible §7.6) requires knowing the show's single biggest reaction
 * happened specifically during the encore, which needs peak-position data
 * the engine doesn't expose yet (Bible §16.B). It is intentionally left out
 * of the active pool below — see the TODO next to ENCORE_TEMPLATES.
 */

import type { EngineState, ScoreMetric } from './concertEngine.js';

type ReviewMetricKey = ScoreMetric | 'overallScore';
export type ReviewSlot = 'opening' | 'identity' | 'crowd' | 'pacing' | 'encore' | 'closing';

interface MetricCondition {
  metric: ReviewMetricKey;
  min?: number;
  maxExclusive?: number;
}

export interface ReviewTemplate {
  id: string;
  slot: ReviewSlot;
  conditions: MetricCondition[];
  /** encore slot only: true = requires an encore was played, false = requires no encore, undefined = don't care */
  requiresEncorePlayed?: boolean;
  text: string;
}

interface ReviewContext {
  metrics: Record<ScoreMetric, number>;
  overallScore: number;
  encorePlayed: boolean;
}

function metricValue(ctx: ReviewContext, key: ReviewMetricKey): number {
  return key === 'overallScore' ? ctx.overallScore : ctx.metrics[key];
}

function matchesConditions(conditions: MetricCondition[], ctx: ReviewContext): boolean {
  return conditions.every((c) => {
    const v = metricValue(ctx, c.metric);
    if (c.min !== undefined && v < c.min) return false;
    if (c.maxExclusive !== undefined && v >= c.maxExclusive) return false;
    return true;
  });
}

function matchesTemplate(t: ReviewTemplate, ctx: ReviewContext): boolean {
  if (t.requiresEncorePlayed !== undefined && t.requiresEncorePlayed !== ctx.encorePlayed) return false;
  return matchesConditions(t.conditions, ctx);
}

/** Most-specific-wins, stable-order tiebreak. Deterministic: same pool + same context ⇒ same template every time. */
function selectTemplate(pool: readonly ReviewTemplate[], ctx: ReviewContext): ReviewTemplate | null {
  const eligible = pool.filter((t) => matchesTemplate(t, ctx));
  if (eligible.length === 0) return null;
  let best = eligible[0]!;
  for (const t of eligible.slice(1)) {
    if (t.conditions.length > best.conditions.length) best = t;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 7.2 Opening templates (12) — keyed to overallScore
// ---------------------------------------------------------------------------

export const OPENING_TEMPLATES: readonly ReviewTemplate[] = [
  { id: 'OPEN-01', slot: 'opening', conditions: [{ metric: 'overallScore', min: 900 }],
    text: "Nights like this are why setlists get framed — [Band Name] didn't play a show so much as make an argument nobody could answer." },
  { id: 'OPEN-02', slot: 'opening', conditions: [{ metric: 'overallScore', min: 800, maxExclusive: 900 }],
    text: 'A legendary night for [Band Name] — the kind the crowd will exaggerate for years without needing to.' },
  { id: 'OPEN-03', slot: 'opening', conditions: [{ metric: 'overallScore', min: 800, maxExclusive: 900 }],
    text: "Every so often a set clicks shut like a lock. This was [Band Name]'s." },
  { id: 'OPEN-04', slot: 'opening', conditions: [{ metric: 'overallScore', min: 600, maxExclusive: 800 }],
    text: 'A strong, well-run [Band Name] show — the work of a band that knew exactly what room it was in.' },
  { id: 'OPEN-05', slot: 'opening', conditions: [{ metric: 'overallScore', min: 600, maxExclusive: 800 }],
    text: '[Band Name] delivered the kind of night that doesn\'t make headlines but makes fans.' },
  { id: 'OPEN-06', slot: 'opening', conditions: [{ metric: 'overallScore', min: 600, maxExclusive: 800 }],
    text: 'No wasted motion tonight: [Band Name] played a confident set and the room repaid it.' },
  { id: 'OPEN-07', slot: 'opening', conditions: [{ metric: 'overallScore', min: 400, maxExclusive: 600 }],
    text: 'A serviceable [Band Name] set with room to grow — flashes of a great show inside a decent one.' },
  { id: 'OPEN-08', slot: 'opening', conditions: [{ metric: 'overallScore', min: 400, maxExclusive: 600 }],
    text: '[Band Name] gave the room a fair night\'s music; the great night stayed just out of reach.' },
  { id: 'OPEN-09', slot: 'opening', conditions: [{ metric: 'overallScore', min: 400, maxExclusive: 600 }],
    text: 'You could see the show this wanted to be — [Band Name] got it about two-thirds of the way there.' },
  { id: 'OPEN-10', slot: 'opening', conditions: [{ metric: 'overallScore', min: 200, maxExclusive: 400 }],
    text: 'A rough night for [Band Name] — the crowd never quite connected, and you could feel both sides trying.' },
  { id: 'OPEN-11', slot: 'opening', conditions: [{ metric: 'overallScore', min: 200, maxExclusive: 400 }],
    text: 'Some nights the room and the setlist just don\'t agree. Tonight they argued from the first song.' },
  { id: 'OPEN-12', slot: 'opening', conditions: [{ metric: 'overallScore', maxExclusive: 200 }],
    text: 'A night [Band Name] will want back — very little landed, and the set never found the door into the room.' },
];

// ---------------------------------------------------------------------------
// 7.3 Identity templates (12) — keyed to spectrumMatch, with authenticity/diversity sub-conditions
// ---------------------------------------------------------------------------

export const IDENTITY_TEMPLATES: readonly ReviewTemplate[] = [
  { id: 'IDEN-01', slot: 'identity', conditions: [{ metric: 'spectrumMatch', min: 85 }],
    text: 'Every pick felt true to the band — this setlist could have been sworn in as testimony about who [Band Name] is.' },
  { id: 'IDEN-02', slot: 'identity', conditions: [{ metric: 'spectrumMatch', min: 85 }, { metric: 'authenticity', min: 85 }],
    text: 'The set landed dead on the band\'s identity, and it was built almost entirely on the real thing — no padding, no guesswork.' },
  { id: 'IDEN-03', slot: 'identity', conditions: [{ metric: 'spectrumMatch', min: 70, maxExclusive: 85 }],
    text: 'The setlist stayed close to the band\'s core sound, wandering only where wandering suited it.' },
  { id: 'IDEN-04', slot: 'identity', conditions: [{ metric: 'spectrumMatch', min: 70, maxExclusive: 85 }, { metric: 'diversity', min: 70 }],
    text: 'True to the band\'s identity while ranging across the catalog — the hardest balance in setlist-craft, mostly struck.' },
  { id: 'IDEN-05', slot: 'identity', conditions: [{ metric: 'spectrumMatch', min: 55, maxExclusive: 70 }],
    text: 'The band\'s identity was recognizable in the set, if softened around the edges.' },
  { id: 'IDEN-06', slot: 'identity', conditions: [{ metric: 'spectrumMatch', min: 55, maxExclusive: 70 }, { metric: 'authenticity', maxExclusive: 55 }],
    text: 'The shape of the band was there, but too much of the set rested on songs the record barely knows — the outline was right, the ink was thin.' },
  { id: 'IDEN-07', slot: 'identity', conditions: [{ metric: 'spectrumMatch', min: 40, maxExclusive: 55 }],
    text: 'The setlist drifted from the band\'s core sound — individually fine picks that added up to somebody else\'s show.' },
  { id: 'IDEN-08', slot: 'identity', conditions: [{ metric: 'spectrumMatch', maxExclusive: 40 }],
    text: "Whatever band this setlist described, it wasn't quite [Band Name] — the identity drifted early and never came home." },
  { id: 'IDEN-09', slot: 'identity', conditions: [{ metric: 'authenticity', min: 85 }, { metric: 'spectrumMatch', min: 55, maxExclusive: 85 }],
    text: 'Nearly every song came with its full identity on record — a set built on bedrock, even where its aim wobbled.' },
  { id: 'IDEN-10', slot: 'identity', conditions: [{ metric: 'authenticity', min: 70, maxExclusive: 85 }],
    text: 'Most of the set stood on real data, with only a little neutral-estimate scaffolding holding up the rest.' },
  { id: 'IDEN-11', slot: 'identity', conditions: [{ metric: 'authenticity', min: 40, maxExclusive: 55 }],
    text: 'A large share of tonight ran on neutral estimates rather than the band\'s real profile — the review, like the crowd, could only judge what it could hear.' },
  { id: 'IDEN-12', slot: 'identity', conditions: [{ metric: 'authenticity', maxExclusive: 40 }],
    text: 'Most of this set was played on placeholder data — until more of these songs are fully analyzed, nights like this are being scored in silhouette.' },
];

// ---------------------------------------------------------------------------
// 7.4 Crowd templates (12) — keyed to audienceRetention, crowdPeak, rarityExcitement
// ---------------------------------------------------------------------------

export const CROWD_TEMPLATES: readonly ReviewTemplate[] = [
  { id: 'CROWD-01', slot: 'crowd', conditions: [{ metric: 'audienceRetention', min: 85 }],
    text: "The room was fuller-feeling at the end than the start — nobody wanted to be the first to leave, so nobody left." },
  { id: 'CROWD-02', slot: 'crowd', conditions: [{ metric: 'audienceRetention', min: 70, maxExclusive: 85 }],
    text: 'The crowd stayed and stayed engaged, riding the set\'s choices rather than merely tolerating them.' },
  { id: 'CROWD-03', slot: 'crowd', conditions: [{ metric: 'audienceRetention', min: 55, maxExclusive: 70 }],
    text: "The room held together, with some fraying at the edges during the set's less generous stretches." },
  { id: 'CROWD-04', slot: 'crowd', conditions: [{ metric: 'audienceRetention', min: 40, maxExclusive: 55 }],
    text: 'A slow leak of walkouts ran through the night — never a rupture, always a reminder.' },
  { id: 'CROWD-05', slot: 'crowd', conditions: [{ metric: 'audienceRetention', maxExclusive: 40 }],
    text: 'The room emptied by degrees, and by the closer the set was playing to the people who stay for anything.' },
  { id: 'CROWD-06', slot: 'crowd', conditions: [{ metric: 'crowdPeak', min: 85 }],
    text: 'One moment towered over the night — for a single song, part of this crowd got everything it came for at once.' },
  { id: 'CROWD-07', slot: 'crowd', conditions: [{ metric: 'crowdPeak', min: 85 }, { metric: 'audienceRetention', maxExclusive: 55 }],
    text: "Even on a night of walkouts, there was one song where a corner of the room lost its mind — the peak survived the show around it." },
  { id: 'CROWD-08', slot: 'crowd', conditions: [{ metric: 'rarityExcitement', min: 70, maxExclusive: 85 }],
    text: 'The setlist historians got fed tonight — the rare picks landed with the people who knew exactly how rare they were.' },
  { id: 'CROWD-09', slot: 'crowd', conditions: [{ metric: 'rarityExcitement', min: 85 }],
    text: "At least one call tonight will end up in fan lore — the kind of rarity people claim to have witnessed in greater numbers than the room could hold." },
  { id: 'CROWD-10', slot: 'crowd', conditions: [{ metric: 'rarityExcitement', maxExclusive: 40 }, { metric: 'audienceRetention', min: 55 }],
    text: 'A steady room, though the deep-cut contingent went home with empty notebooks — nothing tonight surprised anyone.' },
  { id: 'CROWD-11', slot: 'crowd', conditions: [{ metric: 'crowdPeak', min: 55, maxExclusive: 85 }, { metric: 'audienceRetention', min: 55 }],
    text: 'No single moment detonated, but the crowd found plenty to hold onto.' },
  { id: 'CROWD-12', slot: 'crowd', conditions: [{ metric: 'crowdPeak', maxExclusive: 40 }],
    text: 'The night never produced a true peak — no song where any part of the room fully ignited.' },
];

// ---------------------------------------------------------------------------
// 7.5 Pacing templates (12) — keyed to energyCurveFit, paceDiscipline, emotionalJourney
// ---------------------------------------------------------------------------

export const PACING_TEMPLATES: readonly ReviewTemplate[] = [
  // PACE-01/02 carry an added overallScore>=200 guard per the Bible's 7.8 forbidden-combination
  // table: pacing metrics this good cannot honestly co-occur with a Poor overallScore; if they
  // ever did, prefer the harsher slot below (PACE-03..05) and drop the praise.
  { id: 'PACE-01', slot: 'pacing', conditions: [{ metric: 'energyCurveFit', min: 85 }, { metric: 'overallScore', min: 200 }],
    text: "The pacing built and released tension like a tide chart — the set breathed exactly when the room needed it to." },
  { id: 'PACE-02', slot: 'pacing', conditions: [{ metric: 'energyCurveFit', min: 70, maxExclusive: 85 }, { metric: 'overallScore', min: 200 }],
    text: 'The energy climbed, broke, and climbed again in the right places — a set with an actual shape.' },
  { id: 'PACE-03', slot: 'pacing', conditions: [{ metric: 'energyCurveFit', min: 55, maxExclusive: 70 }],
    text: 'The pacing mostly worked, give or take a stretch that idled where it should have shifted.' },
  { id: 'PACE-04', slot: 'pacing', conditions: [{ metric: 'energyCurveFit', min: 40, maxExclusive: 55 }],
    text: 'The energy curve felt uneven — runs of similar songs stacked back to back where contrast was owed.' },
  { id: 'PACE-05', slot: 'pacing', conditions: [{ metric: 'energyCurveFit', maxExclusive: 40 }],
    text: 'The set moved like a flat line with a nervous tic — no build, no release, just adjacency.' },
  { id: 'PACE-06', slot: 'pacing', conditions: [{ metric: 'paceDiscipline', min: 85 }],
    text: 'Not one pacing foul all night — transitions clean, momentum husbanded like it was rationed.' },
  { id: 'PACE-07', slot: 'pacing', conditions: [{ metric: 'paceDiscipline', maxExclusive: 45 }],
    text: 'The set kept stepping on its own momentum — pacing penalties piled up where discipline should have been.' },
  { id: 'PACE-08', slot: 'pacing', conditions: [{ metric: 'emotionalJourney', min: 85 }],
    text: 'Emotionally, the night traveled — it took the room somewhere, held it there, and brought it back changed.' },
  { id: 'PACE-09', slot: 'pacing', conditions: [{ metric: 'emotionalJourney', min: 70, maxExclusive: 85 }],
    text: 'There was a real emotional arc under the songs, not just a sequence of them.' },
  { id: 'PACE-10', slot: 'pacing', conditions: [{ metric: 'emotionalJourney', maxExclusive: 40 }],
    text: 'Emotionally the set stayed on one floor — never rose, never fell, never risked the elevator.' },
  { id: 'PACE-11', slot: 'pacing', conditions: [{ metric: 'energyCurveFit', min: 70 }, { metric: 'emotionalJourney', min: 70 }],
    text: 'Shape and feeling moved together tonight — the energy carried the emotion and the emotion justified the energy.' },
  { id: 'PACE-12', slot: 'pacing', conditions: [{ metric: 'energyCurveFit', maxExclusive: 55 }, { metric: 'paceDiscipline', min: 70 }],
    text: "Disciplined but shapeless — no fouls, no flow; a set that obeyed every rule except the one about going somewhere." },
];

// ---------------------------------------------------------------------------
// 7.6 Encore/Ending templates — keyed to encoreQuality and encore-played state.
//
// Bible lists 10 (ENC-01..10). ENC-09 is intentionally NOT included below:
// it requires knowing the show's biggest crowd-peak moment happened during
// the encore specifically, which needs peak-position-in-set data the engine
// doesn't expose today (Bible §7.6 footnote, §16.B). TODO(Bible §7.6 ENC-09):
// implement once per-pick peak position is threaded into EngineState/report.
// ---------------------------------------------------------------------------

export const ENCORE_TEMPLATES: readonly ReviewTemplate[] = [
  // ENC-01/02 carry an added audienceRetention>=40 guard per the Bible's 7.8 table:
  // an emptied room does not produce a triumphant encore.
  { id: 'ENC-01', slot: 'encore', requiresEncorePlayed: true,
    conditions: [{ metric: 'encoreQuality', min: 85 }, { metric: 'audienceRetention', min: 40 }],
    text: "The encore didn't just land — it re-priced the whole evening. That last call is the one the room walked out humming about." },
  { id: 'ENC-02', slot: 'encore', requiresEncorePlayed: true,
    conditions: [{ metric: 'encoreQuality', min: 70, maxExclusive: 85 }, { metric: 'audienceRetention', min: 40 }],
    text: 'The crowd earned an encore and the encore repaid them — a genuine ending, not an appendix.' },
  { id: 'ENC-03', slot: 'encore', requiresEncorePlayed: true, conditions: [{ metric: 'encoreQuality', min: 55, maxExclusive: 70 }],
    text: 'The encore landed, if softly — a good ending that a braver call might have made a great one.' },
  { id: 'ENC-04', slot: 'encore', requiresEncorePlayed: true, conditions: [{ metric: 'encoreQuality', min: 40, maxExclusive: 55 }],
    text: "The encore came back to a warm room and cooled it slightly — the night's one gift, half-unwrapped." },
  { id: 'ENC-05', slot: 'encore', requiresEncorePlayed: true, conditions: [{ metric: 'encoreQuality', maxExclusive: 40 }],
    text: 'The crowd demanded one more and got the wrong one — an encore that answered the request but not the reason for it.' },
  { id: 'ENC-06', slot: 'encore', requiresEncorePlayed: false, conditions: [{ metric: 'audienceRetention', min: 70 }],
    text: 'No encore tonight — the room was warm, but never quite crossed into demanding more. A closer with more conviction might have tipped it.' },
  { id: 'ENC-07', slot: 'encore', requiresEncorePlayed: false, conditions: [{ metric: 'audienceRetention', min: 40, maxExclusive: 70 }],
    text: "No encore tonight — the crowd wasn't won over enough to ask, and the houselights agreed." },
  { id: 'ENC-08', slot: 'encore', requiresEncorePlayed: false, conditions: [{ metric: 'audienceRetention', maxExclusive: 40 }],
    text: 'The set ended and the room, what remained of it, accepted the ending without protest.' },
  { id: 'ENC-10', slot: 'encore', requiresEncorePlayed: true,
    conditions: [{ metric: 'encoreQuality', min: 55 }, { metric: 'rarityExcitement', min: 70 }],
    text: 'Ending on a rarity is a bet that the faithful outnumber the tired — tonight, they did.' },
];

// ---------------------------------------------------------------------------
// 7.7 Closing verdict templates (12) — keyed to overallScore, colored by diversity
// ---------------------------------------------------------------------------

export const CLOSING_TEMPLATES: readonly ReviewTemplate[] = [
  { id: 'CLOSE-01', slot: 'closing', conditions: [{ metric: 'overallScore', min: 800 }],
    text: 'File this one under proof: proof of what this catalog can do when somebody sequences it like they mean it.' },
  { id: 'CLOSE-02', slot: 'closing', conditions: [{ metric: 'overallScore', min: 800 }, { metric: 'diversity', min: 80 }],
    text: "Songs pulled from across the whole discography, welded into one night — a set that treated the catalog like a country and toured all of it." },
  { id: 'CLOSE-03', slot: 'closing', conditions: [{ metric: 'overallScore', min: 800 }],
    text: 'Whatever the next room is, this set just bought the ticket to it.' },
  { id: 'CLOSE-04', slot: 'closing', conditions: [{ metric: 'overallScore', min: 600, maxExclusive: 800 }],
    text: "A night that keeps a reputation growing — not the show they'll write books about, but absolutely the show they'll come back for." },
  { id: 'CLOSE-05', slot: 'closing', conditions: [{ metric: 'overallScore', min: 600, maxExclusive: 800 }, { metric: 'diversity', min: 70 }],
    text: 'The breadth of the catalog did quiet work all night — a strong show made sturdier by how much ground it covered.' },
  { id: 'CLOSE-06', slot: 'closing', conditions: [{ metric: 'overallScore', min: 600, maxExclusive: 800 }],
    text: 'The verdict from the floor: worth it, and next time might be special.' },
  { id: 'CLOSE-07', slot: 'closing', conditions: [{ metric: 'overallScore', min: 400, maxExclusive: 600 }],
    text: 'A decent night with a visible ceiling — the pieces of a much better show were all on stage; they just never met.' },
  // CLOSE-08 carries an added spectrumMatch<85 guard per the Bible's 7.8 forbidden-combination
  // table: high-identity praise (IDEN-01/02) reading next to a "too narrow a catalog" scolding
  // closer would sound like two different reviewers.
  { id: 'CLOSE-08', slot: 'closing',
    conditions: [{ metric: 'overallScore', min: 400, maxExclusive: 600 }, { metric: 'diversity', maxExclusive: 40 }, { metric: 'spectrumMatch', maxExclusive: 85 }],
    text: "Leaning this hard on one corner of the catalog kept the night smaller than the band is — the discography has more doors than the set knocked on." },
  { id: 'CLOSE-09', slot: 'closing', conditions: [{ metric: 'overallScore', min: 400, maxExclusive: 600 }],
    text: "Nobody left angry; nobody left changed. There's a better version of this set, and it's close." },
  { id: 'CLOSE-10', slot: 'closing', conditions: [{ metric: 'overallScore', min: 200, maxExclusive: 400 }],
    text: 'Rough nights are tuition — the Show Report is the receipt, and it itemizes exactly what tonight paid for.' },
  { id: 'CLOSE-11', slot: 'closing', conditions: [{ metric: 'overallScore', min: 200, maxExclusive: 400 }],
    text: 'The room and the set never found each other tonight — but rooms have short memories and setlists are rewritable.' },
  { id: 'CLOSE-12', slot: 'closing', conditions: [{ metric: 'overallScore', maxExclusive: 200 }],
    text: 'Very little worked, and pretending otherwise would insult everyone involved — start from the crowd read, rebuild from the opener, and let this one go.' },
];

// ---------------------------------------------------------------------------
// Assembly — Opening + Identity + Crowd + Pacing + Encore/Ending + Closing,
// mandatory fallback disclosure appended last (Bible §7.1 rule 3).
// ---------------------------------------------------------------------------

function fillBandName(text: string, bandName: string): string {
  return text.replace(/\[Band Name\]/g, bandName);
}

export interface ConcertNarrative {
  reviewText: string;
  highlights: string[];
}

export function buildConcertReview(
  bandName: string,
  metrics: Record<ScoreMetric, number>,
  overallScore: number,
  encorePlayed: boolean,
  fallbackSongCount: number,
): string {
  const ctx: ReviewContext = { metrics, overallScore, encorePlayed };

  const slots = [
    selectTemplate(OPENING_TEMPLATES, ctx),
    selectTemplate(IDENTITY_TEMPLATES, ctx),
    selectTemplate(CROWD_TEMPLATES, ctx),
    selectTemplate(PACING_TEMPLATES, ctx),
    selectTemplate(ENCORE_TEMPLATES, ctx),
    selectTemplate(CLOSING_TEMPLATES, ctx),
  ];

  const sentences = slots
    .filter((t): t is ReviewTemplate => t !== null)
    .map((t) => fillBandName(t.text, bandName));

  if (fallbackSongCount > 0) {
    sentences.push(
      `${fallbackSongCount} song${fallbackSongCount > 1 ? 's' : ''} in this set still ${fallbackSongCount > 1 ? "don't" : "doesn't"} have full identity data — scores for those songs used a neutral estimate.`,
    );
  }

  return sentences.join(' ');
}

// ---------------------------------------------------------------------------
// Highlights — short bullet fragments, centralized alongside the review so
// no narrative Headliner strings remain scattered across the engine file.
// Trigger logic and text are unchanged from the pre-Bible implementation.
// ---------------------------------------------------------------------------

export function buildConcertHighlights(
  rarestSongCount: number,
  metrics: Record<ScoreMetric, number>,
  encorePlayed: boolean,
  showFinished: boolean,
): string[] {
  const highlights: string[] = [];

  if (rarestSongCount === 1) highlights.push('One certified rarity made it into the set.');
  if (rarestSongCount > 1) highlights.push(`${rarestSongCount} rarely-played songs made it into the set.`);
  if (metrics.spectrumMatch >= 85) highlights.push("The setlist landed squarely on the band's true identity.");
  if (metrics.spectrumMatch < 40) highlights.push('The setlist drifted far from what defines this band.');
  if (encorePlayed) highlights.push('The crowd earned an encore.');
  if (!encorePlayed && showFinished) highlights.push('No encore tonight — the crowd wasn\'t won over enough.');
  if (metrics.diversity >= 80) highlights.push('Songs were pulled from across the whole discography.');

  return highlights;
}

/** Convenience wrapper matching the shape concertEngine.ts's buildReport needs. */
export function buildConcertNarrative(state: EngineState, metrics: Record<ScoreMetric, number>, overallScore: number): ConcertNarrative {
  const playedSongs = state.bundle.songs.filter((s) => state.playedSongIds.includes(s.id));
  const rarestSongCount = playedSongs.filter((s) => s.liveTier === 'Legendary' || s.liveTier === 'Mythic').length;

  return {
    reviewText: buildConcertReview(state.bundle.bandName, metrics, overallScore, state.encorePlayed, state.fallbackSongCount),
    highlights: buildConcertHighlights(rarestSongCount, metrics, state.encorePlayed, state.phase === 'finished'),
  };
}
