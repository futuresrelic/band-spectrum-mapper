/**
 * Headliner — Campaign Stage Copy (Creative Bible §6, Phase Z.17.14 Part A)
 *
 * Centralized, per-stage narrative text: title tagline, intro, venue
 * fantasy, audience feeling, why-it-matters/player-learns framing, and the
 * victory/star/failure/unlock copy for a finished run. Also builds the
 * locked-stage explanation (Bible §11 #12) from real progress data.
 *
 * This is copy only — no new score formulas or balance rules. It's a layer
 * on top of the existing CampaignStageConfig (campaignStages.ts) and real
 * run results (stars, unlockRequiresStars, bestStars). Centralizing it here
 * keeps HeadlinerPage.tsx and campaignService.ts free of scattered literal
 * strings: callers ask these functions for text, they don't compose it.
 */

import type { StageKey, CampaignStageConfig } from './campaignStages.js';

export interface CampaignStarText {
  one: string;
  two: string;
  three: string;
}

export interface CampaignStageCopy {
  stageKey: StageKey;
  titleTagline: string;
  intro: string;
  venueFantasy: string;
  audienceFeeling: string;
  whyItMatters: string;
  playerLearns: string;
  victoryText: string;
  starText: CampaignStarText;
  /** Describes the next room opening (or, for the final stage, that the ladder ends). */
  unlockText: string;
  /** null only for stages that cannot meaningfully fail (Rehearsal Room) — the generic Bible §11 #7 wrapper is used instead. */
  failureText: string | null;
}

export const CAMPAIGN_STAGE_COPY: Record<StageKey, CampaignStageCopy> = {
  rehearsal_room: {
    stageKey: 'rehearsal_room',
    titleTagline: 'Where sets are born',
    intro: "Before there's a show, there's a room where three songs get played in a row on purpose for the first time. This is that room. A few friends came to listen. Nothing is at stake except learning what your songs sound like next to each other.",
    venueFantasy: "The player is the band's inner circle: cables, folding chairs, the first end-to-end run of a real set.",
    audienceFeeling: "Unconditional. Friends and first-timers who will clap for anything — which paradoxically makes this the only room where the player can hear the set itself.",
    whyItMatters: "Every habit the ladder will test — opening choice, contrast, the shape of three songs — is formed here, free.",
    playerLearns: "The core loop (call songs, watch the crowd read, see the Show Report) and the idea that order matters: the same three songs in a different order are a different show.",
    victoryText: "Three songs, one shape. Your friends noticed the set had a beginning, a middle, and an end — even if they couldn't say why. That's craft, and it travels.",
    starText: {
      one: "A set happened, start to finish. That's genuinely all this room asks.",
      two: "The room stayed with you the whole way. These songs are starting to belong together.",
      three: "Even here, with nothing at stake, you built an arc. Rooms with stakes are going to like you.",
    },
    unlockText: "Word travels the way it always has: someone knew someone. The Local Bar has an open Thursday and a corner stage. This time, the crowd pays — and paying crowds make choices.",
    failureText: null,
  },
  local_bar: {
    stageKey: 'local_bar',
    titleTagline: 'The first paying crowd',
    intro: "A small stage in the corner and a crowd that showed up on purpose. They paid — not much, but the transaction changes everything. Tonight, staying is a decision your audience re-makes every song, and the door is right there.",
    venueFantasy: "The classic first real gig: sticky floor, house PA, the band's name misspelled on the chalkboard, and the electric fact of strangers listening.",
    audienceFeeling: "Friendly but honest. Warmth is available and walkouts are real; the room gives you its attention and watches what you do with it.",
    whyItMatters: "This is where Attendance becomes a living number — the ladder's first true test: can this band hold a room it doesn't personally know?",
    playerLearns: "Retention. Walkouts as consequence. That the casual majority is won with warmth and lost with neglect, and that one well-placed emotional song does what three clever ones can't.",
    victoryText: "Stage Cleared. The room was fuller at the end than the middle — in a bar, that's the miracle number. Somebody asked when you're playing next. Somebody always knows a guy at the Small Theatre.",
    starText: {
      one: "Cleared — the set held together and enough of the room held with it. The rough edges are exactly the kind this stage exists to sand off.",
      two: "A genuinely good bar gig: the crowd stayed, the set had shape, and the regulars will vouch for you. Vouching is currency.",
      three: "Three stars. Packed corner stage, encore in a bar — the bartender's nod, the hardest-won review in music. This room has nothing left to teach you.",
    },
    unlockText: "A crowd that stays becomes a crowd that talks. The Small Theatre books on talk — real seats, real lights, and the first audience that will listen closely enough to hear what your set is made of.",
    failureText: "Stage Not Cleared — the room thinned before the end, and thin rooms are the bar's way of teaching. Look at the Show Report: where did the walkouts cluster? Bars are won with warmth — open accessible, land one emotional peak, give the loud contingent one loud song. Your Collection already has tonight's answer in it.",
  },
  small_theatre: {
    stageKey: 'small_theatre',
    titleTagline: 'The listening room',
    intro: "Real seats, real lighting, and a crowd that knows the difference between a real setlist and a lazy one. When the lights drop, this room goes silent — and silence means they're listening to everything, including what your set is built on.",
    venueFantasy: "The step where a band becomes an act: a lighting cue, a proper soundcheck, a printed ticket with the band's name on it.",
    audienceFeeling: "Attentive and discerning. Not hostile — invested. This crowd wants to be shown something true and can tell when it isn't.",
    whyItMatters: "Authenticity enters the game. A theatre crowd senses when a set leans on songs the game barely knows (fallback data) — the ladder's first demand that the player's Collection be deep, not just big.",
    playerLearns: 'That Authenticity is a real dimension of quality; that Spectrum Match matters to a listening crowd; that album diversity and a first rare pick are how a set earns the word "curated."',
    victoryText: "Stage Cleared. Theatre crowds don't cheer for effort — they cheered for the show. Between songs you could hear the silence holding, which is the sound of a room deciding you're real.",
    starText: {
      one: "Cleared. The room heard a real set — and heard exactly where it stretched thin. Theatres are honest that way; use it.",
      two: "A proper theatre night: authentic material, a true shape, a crowd that leaned in and stayed leaned. The ladder's middle rung, climbed properly.",
      three: "Three stars. Identity intact, catalog ranged, one pick nobody expected — the ovation had seats-up in it. Festival bookers read theatre reviews.",
    },
    unlockText: "A theatre ovation carries past the lobby. There's a festival side stage with a Thursday slot and a crowd that walks between stages mid-song — the most restless audience you've ever faced, and the most rewarding one to stop in its tracks.",
    failureText: "Stage Not Cleared — this room asks more than the bar did, and it tells you precisely what was missing. Low Authenticity? The set leaned on songs without full identity data — recover and analyze deeper. Faded crowd? Check which factions the middle third forgot. The theatre will hold your date.",
  },
  festival_side_stage: {
    stageKey: 'festival_side_stage',
    titleTagline: 'The restless crowd',
    intro: "A festival crowd drifting in from other stages — half already fans, half deciding right now, all of them one dull stretch away from wandering off to somewhere louder. Deep-cut hunters and hardcore fans came looking for something specific. Give it to them.",
    venueFantasy: "Golden-hour slot, competing kick drums in the distance, a tent that could hold three hundred or three thousand depending entirely on the next forty minutes.",
    audienceFeeling: "Kinetic and conditional. The warmest crowd on the ladder when won, the fastest-evaporating when not. Their attention is a tide.",
    whyItMatters: "The ladder's test of nerve. Safe sets die here; the house rewards rarity, intensity, and a refusal to flatline — the skills the Major Theatre will demand at scale.",
    playerLearns: "That rarity is a strategy, not a flourish (the playRareOrBelow objective has teeth here); that hardcore and hunter momentum are worth courting on purpose; that a strong encore is built long before it's called.",
    victoryText: "Stage Cleared. People walked toward your tent mid-set — at a festival that's the only review with legal standing. The crowd that leaves a side stage impressed is the crowd that buys the theatre ticket.",
    starText: {
      one: "Cleared — you held a crowd that owed you nothing. The set played it safer than this house loves, but it held, and holding a festival crowd is a real skill.",
      two: "A side-stage set with teeth: the hunters got a surprise, the front rows got their sweat, and the tent was fuller at the end. This is how reputations start at festivals.",
      three: "Three stars. Overflowing tent, an encore at a festival, and at least one call the setlist historians will argue about. The Major Theatre's booker was standing at the back with their arms crossed. They uncrossed them.",
    },
    unlockText: "Festival talk is loud and short-lived — unless a booker hears it. One did. The Major Theatre: a sold-out room, every faction in force, and the top of this ladder. Bring everything.",
    failureText: "Stage Not Cleared — festival crowds vote with their feet, and today they wandered. This house punishes caution: it wanted one genuine rarity, one sustained heavy stretch, and no flat middle. Check where Attendance sagged in the Show Report — that's where another stage's kick drum won. Next slot, bring nerve.",
  },
  major_theatre: {
    stageKey: 'major_theatre',
    titleTagline: 'Top of the ladder',
    intro: "A sold-out room that knows every rumor about this band — tonight decides which ones are true. Every faction is here in force: hunters counting rarities, prog heads mapping the arc, front rows measuring intensity, and a thousand people who just love the songs. There is nowhere in a set this long to hide a filler pick.",
    venueFantasy: "The marquee with the band's name in lights, the longest soundcheck of their life, and a room whose silence, when the lights drop, has physical weight.",
    audienceFeeling: "A jury of every kind of fan at once — demanding not because it's hostile, but because it contains everyone the ladder has taught you to serve, all at full strength, all at the same time.",
    whyItMatters: "It's the thesis of the whole game in one room: identity, stamina, nerve, balance, and an encore that means it. Clearing it is the proof; three-starring it is the legend.",
    playerLearns: "Synthesis. Nothing new — everything at once: the bar's warmth, the theatre's authenticity, the festival's nerve, sustained across ten-plus songs where pacing mistakes compound.",
    victoryText: "Stage Cleared. Three thousand people, five kinds of fan, one verdict — and it came back in your favor. Whatever the rumors said about this band, tonight made them true.",
    starText: {
      one: "Cleared — the top of the ladder, reached. The room saw the seams, and it also saw a band that belonged on that stage. Both things are true; only one of them is permanent.",
      two: "A major-theatre night the room will vouch for: every faction fed at least once, the identity held, the long set never buckled. What remains isn't a bigger room — it's a perfect night in this one.",
      three: "Three stars at the top of the ladder. Identity intact across thirteen songs, five factions fed, the catalog ranged, a rarity risked, an encore that meant it. There's a word for a band that can do that, and it's the name of this game.",
    },
    unlockText: "There is no next rung — only this room, and the difference between clearing it and owning it. The ladder ends; the craft doesn't.",
    failureText: "Stage Not Cleared — and no shame in it: this room is the whole game at once. No single fix clears it. Read the Show Report like a map: which gate missed — the score, the retention, the authenticity? The ladder taught each of these one rung at a time; tonight just asked for them together. The marquee keeps your name on file.",
  },
};

export function getStageCopy(stageKey: StageKey): CampaignStageCopy {
  return CAMPAIGN_STAGE_COPY[stageKey];
}

/**
 * Bible §11 #12 — the locked-stage explanation. Never a bare "Locked": it
 * always names the stars required, the stage that grants them, and the
 * player's current progress there.
 */
export function buildLockedStageExplanation(
  stage: CampaignStageConfig,
  previousStage: { name: string; bestStars: number; unlockRequiresStars: number },
): string {
  const n = previousStage.unlockRequiresStars;
  return `${stage.name} books on reputation: it opens when you've earned ${n} star${n === 1 ? '' : 's'} at `
    + `${previousStage.name} — you have ${previousStage.bestStars}. One more good night there and this door opens.`;
}

/**
 * The post-show flavor paragraph for a Campaign result: the stage's own
 * victory text plus the star-appropriate line for 1+ stars, or the stage's
 * failure text at 0 stars. Falls back to the generic Bible §11 #7 wrapper
 * only for a stage with no authored failure text (Rehearsal Room, which
 * cannot meaningfully fail) — this is a defensive fallback, not expected
 * to fire in normal play.
 */
export function buildCampaignResultText(stageKey: StageKey, stars: number): string {
  const copy = getStageCopy(stageKey);
  if (stars <= 0) {
    return copy.failureText
      ?? "Stage Not Cleared — the show finished below this room's bar. The Show Report breaks down exactly where the night leaked: check it, adjust one thing, and take the stage again. Nothing is lost but an evening.";
  }
  const starLine = stars >= 3 ? copy.starText.three : stars === 2 ? copy.starText.two : copy.starText.one;
  return `${copy.victoryText} ${starLine}`;
}

/** Bible §6 "Unlock text" — the just-cleared stage's own description of what opens next. */
export function buildUnlockCopy(clearedStageKey: StageKey): string {
  return getStageCopy(clearedStageKey).unlockText;
}
