# Headliner — Creative Bible

**Status:** Permanent creative foundation. Proposal-stage for future phases; binding for all Headliner writing from this point forward.
**Scope:** Tone, vocabulary, character writing, review grammar, tutorial copy, empty/failure states, achievements, Historical Mode creative roadmap, and implementation handoff.
**Audience:** The engineer (or writer) implementing any future Headliner phase, and anyone writing player-facing copy for the game.
**Rules inherited from CLAUDE.md that bind this document:** band-agnostic everywhere; no invented facts about real bands or real music history; every piece of text is a deterministic template selected by real, engine-computed metric conditions — never a live language-model call; limitations stated honestly.

**How to use this document:** Sections 1–2 define the voice and the words. Sections 3–6 define the characters (factions, venues, contexts, Campaign stages). Sections 7–8 are the writing systems (post-show reviews, in-show reaction log). Sections 9–13 cover mode-specific copy and the Historical Mode roadmap. Sections 14–15 are presentation and safety principles. Section 16 is the engineering handoff. Nothing in this document is code; Section 16's shapes are illustrative only.

---

## 1. CREATIVE IDENTITY

### The emotional promise

Headliner is the feeling of standing at the side of the stage with the setlist in your hand, knowing this crowd, this room, and this band well enough to make the next call — and then watching the room answer. Every show is a conversation between a band's true identity and a specific audience on a specific night, and the player's job is to conduct that conversation honestly: build tension, release it, honor the deep listeners without losing the newcomers, and walk off having *earned* the encore. The promise is competence and care, not power fantasy: you don't buy the crowd, you don't trick the crowd, you *read* the room and you respect the music — and when it works, the game should feel the way a great setlist feels from the floor: inevitable in hindsight, surprising in the moment.

### Tone

- **Warm, knowledgeable, and a little dry.** The narrator's voice is a veteran stagehand or tour manager: someone who has seen a thousand shows, loves them all, and doesn't gush. Compliments are specific and earned; criticism is specific and kind.
- **Music-first.** The game takes music seriously without taking itself seriously. Songs are never "content," crowds are never "users," and a setlist is never a "loadout."
- **Grounded, never mystical.** Crowd behavior is explainable. Every reaction the player sees traces to a real metric. The writing may be evocative, but it never pretends the game knows something it can't measure.

### Pacing of the writing

- In-show text (Section 8) is **short**: one line, readable in two seconds, because the player is mid-decision.
- Post-show text (Section 7) is **measured**: four to six sentences that read like a small local review, not a stat dump.
- Briefings and stage intros (Sections 5, 6, 9) are **two to four sentences**: enough to set a scene, never a wall of lore.

### Visual mood

Dark-room warmth. Headliner lives on BSM's dark public/game theme (bg-gray-950 world): stage-light accents on deep backgrounds, the glow of a mixing desk, not neon arcade. Motion is deliberate — a crowd swell, not a particle explosion. See Section 14.

### Writing personality

First person plural is never used ("we think you did great" — no). The game speaks in second person about the player's choices and third person about the crowd and the band: "You opened heavy. The back of the room noticed." The band itself is always "the band" or the band's actual name pulled from the player's own BSM data — the writing never invents facts about that band.

### Humor level

Low and dry. One wry line per screen at most, always at the situation's expense, never at the player's, never at a faction's, never at the music's. Example register: "The PA survived. So did most of the crowd." Never: puns about song titles, jokes about "nerds" or "normies," memes.

### Drama level

Medium, earned, and concentrated at real stakes: the encore decision, the final song, a Campaign stage's last objective, the Daily Challenge's one official attempt. Everyday moments stay calm so the big moments can land. No manufactured urgency ("HURRY!"), no fake countdowns outside the real Daily reset clock.

### How seriously the game treats music

Completely — and even-handedly. A three-chord anthem that holds a room and a fifteen-minute suite that rewires a listener's brain are both triumphs of the same art form. Headliner's deepest belief, expressed everywhere in its writing: **there is no wrong way to love music, only wrong rooms for a given song on a given night.** Rarity is exciting because it's rare, not because obscurity is virtue; accessibility is powerful because it opens doors, not because popularity is proof.

### What Headliner must NOT feel like

- **Not a spreadsheet.** Numbers exist, but the player should experience a room, not a dashboard. If a screen reads like a KPI review, rewrite it.
- **Not a generic music quiz.** Headliner is never about trivia recall; it is about judgment. No "gotcha" framing, no right-answer smugness.
- **Not a fake band manager.** No merch tables, no contract negotiations, no invented drama between invented band members. The band is the player's real BSM data; Headliner never writes fiction about it.
- **Not a cynical popularity simulator.** The crowd is never a resource to be farmed or manipulated. "Selling out" is not a mechanic, and pandering is not a strategy the game rewards or even names.
- **Not a random card game.** Every outcome is deterministic and explainable from the setlist, the venue, and the crowd. The game must always be able to answer "why did that happen?" — and the writing should make the answer feel discoverable.

---

## 2. CORE LANGUAGE

One term per concept. These are the official words; UI, reviews, tutorials, and docs all use them. Where this table deviates from a currently shipped UI string, the deviation is flagged with rationale — everything unflagged matches shipped copy or established BSM vocabulary.

| Concept | Official term | Usage notes |
|---|---|---|
| Starting a concert | **Take the Stage** | Verb phrase on the start button (shipped: "Take the Stage →"). Never "Start Game," "Begin Run," or "Launch." |
| Choosing the next song | **Call** / "call the next song" | Real gig vocabulary. Buttons: "Call it." Narration: "You called [Song Title]." Never "select," "deploy," or "play card." |
| The songs available to call | **Candidates** | "Candidate songs" on first reference, "candidates" after. Never "hand," "deck," or "options pool." |
| Crowd reaction (in-show) | **Crowd read** | "The crowd read after that call." A single faction's response is a "reaction." Never "feedback" or "score tick." |
| Attendance loss | **Walkouts** / "losing the room" | The live number is **Attendance**. People leaving are "walkouts"; the ongoing failure state is "losing the room." Never "churn," "decay," or "HP loss." |
| The report metric behind attendance | **Audience Retention** | Shipped report label; maps to `audienceRetention`. In-show it's presented as Attendance (see above); in the final report it's Audience Retention. Daily Challenge's `finalAttendance` is presented as "Final Attendance." |
| Spectrum movement during a show | **Drift** (away from identity) / **Locked in** (close to it) | "The set is drifting from the band's identity." Maps to live spectrum-vs-target distance and post-show `spectrumMatch` (shipped label "Spectrum Match"). |
| The band's true profile | **Band Identity Target** | The catalog-wide 6-axis profile the setlist is measured against. "Identity" alone is acceptable on second reference. |
| The running setlist profile | **Current Concert Spectrum** | The live 6-axis average of songs played so far. |
| Authenticity | **Authenticity** | Shipped label; maps to `authenticity` — the share of the set built on real (non-fallback) identity data. Player-facing gloss: "how much of tonight was built on real data." Never "data coverage" in player copy. |
| Pacing | **Pacing** | Player-facing name for `paceDiscipline` (shipped report label "Pace Discipline" — **deviation:** in prose and tutorials use plain "Pacing"; keep "Pace Discipline" only as the report line-item label since it's shipped). The energy-arc metric keeps its shipped label **Energy Curve** (`energyCurveFit`). |
| Encore | **Encore** — the crowd **earns** it, the player **answers** it | "The crowd earned an encore" (shipped highlight). The player's encore pick is "the encore call." Maps to `encoreQuality`. |
| Stage completion | **Stage Cleared** | Shipped. Failure counterpart: "Stage Not Cleared" (shipped). Never "Victory/Defeat," never "You Win/Lose." |
| Stars | **stars** (1★ / 2★ / 3★) | Lowercase in prose, star glyphs in UI. "A three-star night." Never "grades," "medals," or "ranks" for this concept. |
| Campaign progress | **the ladder** / "climbing the ladder" | The Campaign is a ladder of venues. "The next rung." Never "levels," "worlds," or "chapters." |
| Daily Challenge | **Daily Challenge** | Established. Its briefing screen is the **Daily Briefing**; its confirmed result is the **Verified Result** (both shipped screen names — reuse verbatim). |
| Practice runs | **Practice attempt** | Shipped ("Practice Attempt"). Verb: "run a practice." Never "casual mode" or "sandbox." |
| Official score | **Official attempt** / **official score** | Shipped ("Official Attempt"). The first completed run is official — always described exactly that way. |
| Recovered songs | **recovered songs** | Band RPG's established mechanic. Never "unlocked," "owned," or "collected songs." The library of them is the **Collection**. |
| Unrecovered songs | **not yet recovered** | Always phrased as a temporary state with a path forward. Never "locked songs" or "missing songs." |
| Crowd factions | **factions** (collective); each has a player-facing name | See Section 3. Collective prose alternative: "the crowd," "the room." Never "segments," "demographics," or "audience types" in player copy. |
| Venue expectations | **House expectations** / "what this room expects" | "Every house has expectations." Never "venue requirements" or "stage modifiers" in player copy. |
| Live-performance rarity | **Live Frequency** | Established BSM system, tiers verbatim: Essential, Frequent, Occasional, Rare, Legendary, Mythic, Unclassified. Never "drop rate," "rarity tier" alone, or invented tier names. |
| The 6-axis profile system | **Band Spectrum** / **Song Spectrum** | Established BSM vocabulary; axes: aggression, complexity, atmosphere, emotion, psychedelic, concept. |
| The full post-show report | **the Show Report** | Contains the review, highlights, and metric lines. Maps to the engine's completed-show output. Never "results screen" in player copy. |

**Deliberate deviations from shipped strings (complete list):**

1. **"Pacing" over "Pace Discipline" in prose.** "Pace Discipline" survives only as the report's line-item label (it's shipped and renaming shipped labels is churn); everywhere else — tutorials, reviews, reaction log — plain "Pacing." Rationale: "discipline" reads punitive and jargon-heavy in sentences.
2. **"Attendance" in-show vs. "Audience Retention" in-report.** Both shipped surfaces are kept, but this bible fixes which word appears where, since current copy uses them loosely.
3. **No new synonyms otherwise.** Everything else in the table matches shipped UI strings or established BSM vocabulary exactly.

**The "Prog Heads" reconciliation** is documented in Section 3 (short version: the shipped player-facing label **Prog Heads** wins; "Progressive Listeners" is retired).

---

## 3. CROWD FACTION PERSONALITIES

Five factions, five legitimate ways of loving music. Each reads a song's 10-dimension audience profile (progressive, heavy, technical, atmospheric, experimental, accessible, psychedelic, emotional, aggressive, improvisational — each 0–100), each carries its own momentum across the show, and all five blend into Audience Retention. **House rule for all faction writing: no faction is stupid, no faction is superior.** The Casual Listener who wants the songs they know is not shallow; the Deep-Cut Hunter who wants the song played twice in a decade is not a snob. Any copy that punches at a faction gets cut.

### Naming reconciliation: "Prog Heads"

The engine id is `progHeads` and the shipped UI label is **Prog Heads**. An earlier brief called this faction "Progressive Listeners." Decision: **the player-facing name is "Prog Heads"** (engine id `progHeads`), and "Progressive Listeners" is retired. Rationale: "Prog Heads" is already shipped, it's how this community genuinely self-describes (affectionate, not pejorative), and it carries character; "Progressive Listeners" reads like a market-research segment — exactly the spreadsheet feeling Section 1 forbids. All faction names below are the shipped labels.

### 3.1 Casual Listeners (`casual`) — ~35% of a typical crowd

- **Who they are:** The biggest block of almost every room. They know the songs from the records they love, they came to sing along, and they are the reason live music is a public art and not a private club.
- **What they value:** Accessibility and emotion (weighted toward `accessible` + `emotional`). Melody they can hold onto; a chorus that pays off.
- **What excites them:** A beloved, singable song landing at the right moment; an emotional peak they can feel without homework.
- **What fatigues them:** Long technical or experimental stretches (weighted against `technical`/`experimental`/`progressive`); three complex songs in a row reads to them as the band showing off to someone else.
- **What makes them leave:** A show that never once turns toward them. They're patient — 35% of the room doesn't walk over one odd pick — but sustained inaccessibility drains their momentum steadily.
- **Reaction to Rare/Legendary/Mythic picks:** Mild curiosity, not excitement. A Mythic pick means little to them *as a rarity* — but if the song itself is accessible and emotional, they'll love it without knowing it's historic.
- **Reaction to familiar songs:** Their best moments. Familiarity is their rarity.
- **Pacing preference:** Clear builds and clear releases; they feel the Energy Curve more directly than any other faction.
- **Preferred review language:** "singing along," "won the room," "the songs everyone came for," "carried out on a chorus."

### 3.2 Hardcore Fans (`hardcore`) — ~20%

- **Who they are:** The front rows. They've seen the band before, they want intensity, and they measure a show in sweat.
- **What they value:** Heaviness, aggression, and technical force (weighted toward `heavy` + `aggressive` + `technical`, against `accessible`).
- **What excites them:** An aggressive one-two punch; the heaviest song in the catalog dropped when the room is already moving.
- **What fatigues them:** Soft mid-tempo stretches; a set that never bares its teeth. Accessibility for its own sake reads as pulled punches.
- **What makes them leave:** They rarely leave — they came on purpose — but their momentum craters when a show goes gentle for too long, and a low hardcore floor drags Retention hard in hardcore-heavy houses (Festival Side Stage, Hardcore Crowd nights).
- **Reaction to Rare/Legendary/Mythic picks:** Strong if the rare song is heavy — a Legendary aggressive song is their perfect moment. Rarity alone, without intensity, earns a nod, not a pit.
- **Reaction to familiar songs:** Happy to hear the heavy staples; bored by the gentle ones everyone knows.
- **Pacing preference:** They tolerate — even relish — sustained intensity that would exhaust others, but they still reward contrast: the quiet song makes the loud one hit harder, and they know it.
- **Preferred review language:** "the room opened up," "relentless," "no mercy in the back half," "earned every drop of sweat."

### 3.3 Deep-Cut Hunters (`deepCut`) — ~15%

- **Who they are:** The ones checking the setlist history on their phones. They've heard everything; they came for the song the band *doesn't* play.
- **What they value:** Experimentation, improvisation, and the progressive edge of the catalog (weighted toward `experimental` + `improvisational` + `progressive`, against `accessible`) — and above all, **Live Frequency**. They carry the highest rarity-excitement weighting of any faction; `rarityExcitement` is substantially their metric.
- **What excites them:** A Rare pick earns real respect. A Legendary pick is why they bought the ticket. A **Mythic** pick — a song never played live — is a once-in-a-lifetime event, and the writing should treat it that way *for them specifically*.
- **What fatigues them:** A set of Essentials. They don't hate the staples — they've just heard them, and a predictable set slowly flattens their momentum.
- **What makes them leave:** Predictability without a single gesture toward them. One genuine rarity buys enormous goodwill; zero rarities over a long set is how you lose them.
- **Reaction to familiar songs:** Tolerant, briefly. They understand the Essentials hold the room together; they just need the show to prove it knows they're there too.
- **Pacing preference:** They forgive pacing sins others won't — a weird transition into a Mythic song is a *story*, not a mistake. But they still notice sloppiness; forgiveness is not blindness.
- **Preferred review language:** "the setlist nerds got their night," "a pick nobody had on their card," "worth the ticket for one song alone," "they'll be talking about that call for years."

### 3.4 Prog Heads (`progHeads`) — ~15%

- **Who they are:** The architecture listeners. They hear a show the way an engineer reads a bridge: structure first, then ornament. They want the long-form material given room to breathe.
- **What they value:** Progressive construction, technical execution, and atmosphere (weighted toward `progressive` + `technical` + `atmospheric`, against `accessible`).
- **What excites them:** A long, complex song trusted to hold the room; atmospheric passages that connect songs into a larger shape; a set that has a *thesis*.
- **What fatigues them:** A string of short, simple songs; a show assembled like a playlist instead of composed like a suite.
- **What makes them leave:** Feeling condescended to — a whole night pitched only at the singalong. Like Deep-Cut Hunters, one substantial piece buys hours of patience.
- **Reaction to Rare/Legendary/Mythic picks:** Positive when the rarity is also *substantial* — a rare epic is their ideal. A rare novelty means less to them than to the Hunters; they care what the song is, not only how often it's played.
- **Reaction to familiar songs:** Fine, if the familiar songs are load-bearing. An Essential that's also complex is no compromise at all.
- **Pacing preference:** Patient with long builds, allergic to flat lines. They'll ride a ten-minute crescendo happily; they will not forgive four songs at identical energy.
- **Preferred review language:** "the long game paid off," "a set with a spine," "gave the big pieces room," "structure you could stand on."

### 3.5 First-Timers (`firstTimers`) — ~15%

- **Who they are:** Tonight is their first show — a friend's plus-one, a curious walk-in, someone who knows one song from somewhere. They are the future of the band's audience, and the game treats winning them as noble work, not pandering.
- **What they value:** Accessibility and emotion (weighted toward `accessible` + `emotional`, against `experimental`/`progressive`). They need a handhold.
- **What excites them:** The moment the show makes sense to them — an emotional, accessible song that turns "my friend's band" into "my band."
- **What fatigues them:** Being lost. Experimental and progressive stretches with no anchor make the show feel like a conversation in a language they don't speak.
- **What makes them leave:** Sustained alienation early. They have the least invested and the least context; the opening third of a show largely decides whether they stay.
- **Reaction to Rare/Legendary/Mythic picks:** None as rarity — they have no baseline. The song only registers as itself. (The writing must never mock this; not knowing the catalog is where every fan started.)
- **Reaction to familiar songs:** If they know one song, that song is everything. Broadly accessible material works nearly as well.
- **Pacing preference:** Gentle on-ramps. They reward shows that open warm and clear.
- **Preferred review language:** "made some fans tonight," "the plus-ones stayed," "somebody's new favorite band," "an open door of a show."

### 3.6 Reusable faction reaction templates

These are in-show and report-level reaction fragments, written once per emotional state with variants, each keyed to a real engine condition. `[faction]` slots take the player-facing name; per-faction flavor swaps are listed where the generic line shouldn't be used verbatim. Conditions reference the engine's per-faction, per-song reaction values and running momentum (both computed today; Section 16 notes what needs exposing to the UI).

**Delighted** — *trigger: faction's reaction to the just-played song in the top band (a strong positive hit, e.g. per-song faction reaction ≥ +threshold set by tuning), or faction momentum crossing into its highest band.*
1. "The [faction] just got exactly what they came for."
2. "[Faction] are lit up — that call landed dead center for them."
3. "Front to back, the [faction] are all the way in now."

**Intrigued** — *trigger: moderate positive reaction from a faction whose momentum was neutral-or-low — a hook, not a payoff.*
1. "The [faction] are leaning in. They want to see where this goes."
2. "That got the [faction]'s attention — not won yet, but watching."
3. "Heads turned among the [faction]. Curious is a good place to leave them."

**Restless** — *trigger: faction momentum declining for 2+ consecutive songs while still above the walkout band.*
1. "The [faction] are getting restless — this stretch isn't for them and they know it."
2. "You can feel the [faction] checking the time. Nothing lost yet."
3. "The [faction] are drifting toward the bar. Win them back soon."

**Disappointed** — *trigger: a strongly negative per-song reaction from a faction (bottom reaction band), momentum still above walkout threshold.*
1. "That one landed flat with the [faction]."
2. "The [faction] were hoping for something else there."
3. "A shrug from the [faction] — that call wasn't theirs."

**Re-engaged** — *trigger: faction momentum rising after 2+ songs of decline (the comeback signal).*
1. "There they are — the [faction] are back."
2. "That call pulled the [faction] right back into the room."
3. "The [faction] forgave the last stretch on the spot."

**Overwhelmed** — *trigger: 3+ consecutive songs each producing a negative reaction for the same faction (sustained mismatch, e.g. complexity overload for Casual Listeners/First-Timers or gentleness overload for Hardcore Fans).*
1. "It's too much of one thing for the [faction] — they've stopped trying to keep up."
2. "The [faction] have hit their limit with this stretch."
3. "Somewhere in the last three songs, the [faction] got left behind."
   - *First-Timers flavor:* "The first-timers look lost — nothing to hold onto in this stretch."
   - *Hardcore flavor:* "The hardcore fans are still waiting for the show to bare its teeth."

**Surprised** — *trigger: a Rare/Legendary/Mythic Live Frequency pick (rarity-excitement event), scaled per faction weight — biggest for Deep-Cut Hunters.*
1. "Nobody had that on their setlist card — least of all the [faction]."
2. "A genuine surprise, and the [faction] know exactly how rare it is."
3. "The [faction] are already texting people about that pick."
   - *Mythic, Deep-Cut Hunters only:* "A song never played live, until right now. The deep-cut hunters will remember tonight."
   - *First-Timers flavor (rarity means nothing to them — keep it honest):* "The first-timers don't know what they just witnessed — they just know they liked it." *(Only use when their own reaction to the song was positive.)*

**Emotionally moved** — *trigger: the just-played song's `emotional` audience-profile dimension in its top band AND the faction's reaction positive; report-level version keys to `emotionalJourney` ≥ high band.*
1. "Something in that one got the [faction] quiet."
2. "Phones down, eyes up — the [faction] felt that."
3. "That's the song the [faction] will carry home."

**Writing rule for all faction reactions:** a reaction line names *at most one faction* and never editorializes about the faction's taste ("finally, something good" is banned — the game reports the room, it doesn't take sides).

---

## 4. VENUE PERSONALITIES

### The venue writing framework (band-neutral, reusable)

A venue's personality is never invented lore — it is derived from mechanical facts, so any future venue can be written by filling in the same worksheet:

| Framework input | Where it comes from | What it drives in the writing |
|---|---|---|
| **Size & intimacy** | capacity | How personal the language is: small rooms see faces, big rooms see waves |
| **Spectrum affinities** | any per-venue axis leanings (future mechanic; Campaign stages today lean only via crowd mix) | Which kinds of songs the copy hints will "suit this room" |
| **Audience composition** | factionShare | Which factions the copy addresses directly |
| **Rarity bonus** | rarity-excitement weighting of the crowd mix (deepCut share) | Whether the copy invites deep cuts or steers toward staples |
| **Expected show length** | minSongs/maxSongs, showLengthMinutes | Whether the copy frames the night as a sprint or a marathon |
| **Emotional context** | contextLabel / stage order | The scene-setting image: what the player smells, hears, fears |
| **Campaign stage role** | tutorial flag, ladder position, star thresholds | Stakes language: "learn" → "prove" → "arrive" |

Every venue gets exactly seven writing fields: **Opening description** (2–3 sentences, read before Take the Stage), **Crowd expectation** (1–2 sentences naming the factions that matter here), **Strategic warning** (1 sentence, honest and mechanical), **Atmosphere** (1 sentence of pure scene, usable as a subtitle), **Success message** (Stage Cleared / good Quick Show), **Failure message** (Stage Not Cleared — encouraging, specific, never shaming), **Three-star message** (Campaign only; aspirational archetypes get one anyway for future use).

**Status key:** ✅ = real Campaign stage shipped today (Rehearsal Room, Local Bar, Small Theatre, Festival Side Stage, Major Theatre). 🔮 = future/aspirational venue archetype — copy written now so a future venue system inherits a consistent voice; nothing about these five exists in the engine today.

### 4.1 Rehearsal Room ✅ (Campaign stage 1 — tutorial)

- **Opening description:** "An empty room, a few folding chairs, and the songs you actually know. Tonight isn't about impressing anyone — it's about hearing how three songs fit together when they're played in a row. Nobody here is going anywhere."
- **Crowd expectation:** "Friends and first-timers, mostly. They'll clap for anything, which makes this the one room where you can listen to the *set* instead of the crowd."
- **Strategic warning:** "You can't fail here — so experiment. Try an opener you're unsure about. The habits you build in this room follow you up the ladder."
- **Atmosphere:** "Cables on the floor, a borrowed amp, and all the time in the world."
- **Success message:** "Three songs, played in order, on purpose. That's a set. The Local Bar has a corner stage with your name on it — well, taped to it."
- **Failure message:** *(unreachable by design — the stage can't meaningfully fail; if a run is abandoned, use the interrupted-run copy from Section 11)*
- **Three-star message:** "Even with nothing at stake, you built something with a shape. The ladder starts now."

### 4.2 Local Bar ✅ (Campaign stage 2)

- **Opening description:** "A small stage in the corner, a PA that's seen better days, and a crowd that showed up on purpose. These people paid — not much, but they paid — and for the first time, staying is a choice they make song by song."
- **Crowd expectation:** "Mostly casual listeners with a stubborn knot of hardcore fans by the speakers. Nobody here needs the deep catalog; everybody here needs a reason to stay for one more round."
- **Strategic warning:** "Attendance starts to matter tonight — a set that never turns toward the casual crowd will empty the room one walkout at a time."
- **Atmosphere:** "Glasses clink through the quiet songs. That's not disrespect — that's a bar."
- **Success message:** "Stage Cleared. The bartender nodded at you on the way out, which in this room is a rave review."
- **Failure message:** "Stage Not Cleared — the room thinned out before the end. Bars are won with warmth: open accessible, land one emotional peak, and give the regulars one loud song. Your Collection already has what this room needs."
- **Three-star message:** "Three stars. A packed corner stage on a weeknight — word of this gets around. The Small Theatre is asking about availability."

### 4.3 Small Theatre ✅ (Campaign stage 3)

- **Opening description:** "Real seats, real lighting, and a crowd that knows the difference between a real setlist and a lazy one. Tonight the room is quieter — which means they're listening. All of them. To everything."
- **Crowd expectation:** "A balanced house with real hardcore and prog contingents now, and the first deep-cut hunters checking the setlist history. This crowd notices what your set is built on."
- **Strategic warning:** "Authenticity expectations rise here — a set padded with songs the game barely knows will read as thin. Build on your fully-analyzed recovered songs."
- **Atmosphere:** "When the lights drop, the room goes silent — and silence is a promise you now have to keep."
- **Success message:** "Stage Cleared. A theatre crowd doesn't cheer for effort; they cheered for the show. That distinction is the whole game from here up."
- **Failure message:** "Stage Not Cleared — this room asks for more than the bar did, and tonight it didn't get it. Check the Show Report: if Authenticity ran low, recover and analyze more songs; if the crowd faded, watch which factions you fed and which you forgot."
- **Three-star message:** "Three stars. Seats emptied for the ovation, not the exits. Festival season just noticed you exist."

### 4.4 Festival Side Stage ✅ (Campaign stage 4)

- **Opening description:** "A festival crowd drifting in from other stages, half of them already fans, half of them deciding right now. Side stages are where reputations are made — deep-cut hunters and hardcore fans came looking for something specific, and they can leave for another stage mid-song."
- **Crowd expectation:** "The heaviest concentration of deep-cut hunters and hardcore fans on the ladder. They want intensity and at least one pick nobody predicted. The casuals wandering past decide fast."
- **Strategic warning:** "This crowd punishes a safe set — bring at least one Rare-or-rarer song, and don't let the energy flatline: there are four other stages within walking distance."
- **Atmosphere:** "You can hear another band's kick drum between your songs. Ignore it. Make them hear yours."
- **Success message:** "Stage Cleared. People walked *toward* your stage mid-set — at a festival, that's the only review that counts."
- **Failure message:** "Stage Not Cleared — festival crowds vote with their feet, and tonight they wandered. This house rewards nerve: a rarity for the hunters, a heavy stretch for the front rows, and no long flat middle. Look at where the walkouts clustered."
- **Three-star message:** "Three stars. The tent was overflowing by the encore and the festival booker was standing at the back. The Major Theatre wants a word."

### 4.5 Major Theatre ✅ (Campaign stage 5 — top of the ladder)

- **Opening description:** "A sold-out room that knows every rumor about this band — tonight decides which ones are true. Every faction is here in force, every choice carries, and there is nowhere to hide a filler pick in a set this long."
- **Crowd expectation:** "The most demanding balance on the ladder: hunters counting rarities, prog heads mapping the arc, hardcore fans measuring intensity, and casuals and first-timers who still deserve their night. Everyone must be fed."
- **Strategic warning:** "Ten-plus songs means your pacing mistakes compound — a flat middle third here costs more than a bad opener at the bar ever did."
- **Atmosphere:** "Three thousand people go quiet at once, and the silence has weight."
- **Success message:** "Stage Cleared. A major-theatre crowd is a jury of every kind of fan at once — and the verdict came back in your favor."
- **Failure message:** "Stage Not Cleared — the top of the ladder, and it plays like it. No single trick clears this room: it wants identity, stamina, at least one act of nerve, and an encore that means it. The Show Report will show you which of those was missing tonight."
- **Three-star message:** "Three stars at the top of the ladder. Every faction fed, the identity intact, the encore earned. There's a word for a band that can do that: a headliner."

### 4.6 Arena 🔮 (aspirational archetype)

- **Opening description:** "A room so large the back rows watch the screens. Nuance survives here — but only when it's built to scale. Tonight is about broad strokes that stay true: the biggest songs, the clearest arcs, and moments designed to reach the cheap seats."
- **Crowd expectation:** "Casuals and first-timers in their thousands, with every other faction present but diluted. This is the most accessible-leaning house imaginable — and the easiest room in which to lose the faithful while chasing the rafters."
- **Strategic warning:** "Scale amplifies pacing: a lull the bar would forgive becomes ten thousand phones lighting up."
- **Atmosphere:** "The roar arrives a half-second late from the back, like weather."
- **Success message:** "You made the biggest room feel small at least twice tonight. That's the entire art of arenas."
- **Failure message:** "The arena swallowed the set. Big rooms don't need bigger songs so much as clearer shapes — a set the back row can follow without hearing a single lyric."
- **Three-star message:** "Every seat, every faction, one show. The kind of night that turns a band into a memory people share with strangers."

### 4.7 Historic Venue 🔮 (aspirational archetype; natural home of future Historical Mode, Section 13)

- **Opening description:** "Rooms like this have a memory. Every band that plays here plays against everyone who played here before — and the crowd knows it. Tonight your setlist isn't just heard; it's *compared*."
- **Crowd expectation:** "A listening crowd, heavy on prog heads and deep-cut hunters, who bought tickets to the room as much as the band. They reward reverence expressed as effort, not imitation."
- **Strategic warning:** "This house expects a set with a thesis — identity drift reads louder here than anywhere."
- **Atmosphere:** "The walls have heard better bands than yours. Prove them wrong anyway."
- **Success message:** "The room accepted you. Some houses applaud with their hands; this one applauds by remembering."
- **Failure message:** "The room stayed polite, which here is the harshest review there is. Historic houses want conviction — a set that knows exactly what this band is."
- **Three-star message:** "Tonight goes in the room's memory alongside the nights people still talk about. No higher shelf exists."

### 4.8 Outdoor Amphitheatre 🔮 (aspirational archetype)

- **Opening description:** "Open sky, long sightlines, and sound that rolls uphill over a lawn of blankets and lawn chairs. Amphitheatres forgive volume and reward atmosphere — dusk is coming, and the set that uses it wins."
- **Crowd expectation:** "A relaxed, casual-leaning crowd up close and a drifting lawn behind them. Atmospheric and emotional material carries further outdoors than aggression does."
- **Strategic warning:** "Attention disperses outdoors — long ambient stretches without an emotional anchor turn the lawn into a picnic with a soundtrack."
- **Atmosphere:** "Somewhere in the third song, the sun goes down, and the show becomes the only light."
- **Success message:** "The lawn stood up. People who came for a nice evening left having had a *night*."
- **Failure message:** "The evening stayed pleasant, which isn't the same as the show working. Outdoors, build toward dusk: atmosphere early, emotion at nightfall, energy under the stars."
- **Three-star message:** "A show that used the sky as a lighting rig. Nobody who was on that lawn will describe it as 'nice.'"

### 4.9 Intimate Club 🔮 (aspirational archetype)

- **Opening description:** "A hundred people, zero distance. Every face is visible from the stage and every choice is personal. Clubs are confessionals: the crowd hears intention, hesitation, and honesty at point-blank range."
- **Crowd expectation:** "Devotees — a deep-cut and hardcore heavy room where everyone chose to be inches from the band. Safe sets feel like a broken promise here."
- **Strategic warning:** "Nowhere amplifies rarity like a club — and nowhere exposes a phoned-in setlist faster."
- **Atmosphere:** "You can hear one person's sharp breath when the song starts. It might be yours."
- **Success message:** "A hundred people will spend years insisting 'you had to be there.' They're right."
- **Failure message:** "At this range, the room could tell the set's heart wasn't in it. Clubs reward the bold pick — the song you'd never risk in a theatre is exactly what these walls are for."
- **Three-star message:** "The kind of club night bands measure the rest of a tour against. Legendary at a scale of one hundred."

### 4.10 Festival Main Stage 🔮 (aspirational archetype)

- **Opening description:** "The biggest crowd of the ladder's life, and most of them didn't come for this band — yet. Main stages are conversion engines: an hour to turn a field of strangers into fans, with the faithful pressed against the rail holding the center."
- **Crowd expectation:** "First-timers at unprecedented scale, casuals in waves behind them, and the band's whole hardcore contingent compressed into the front. Two shows at once, sharing one setlist."
- **Strategic warning:** "Serve only the rail and lose the field; serve only the field and hollow out the front row that got you here. Alternate. Relentlessly."
- **Atmosphere:** "From the stage, the crowd doesn't end — it just fades into the festival."
- **Success message:** "A field of strangers left knowing the band's name and at least one chorus. That's how catalogs find their next generation."
- **Failure message:** "The field drifted and the rail deserved better. Main stages want the band's clearest, truest self at maximum size — identity, loudly."
- **Three-star message:** "The festival's talking. Somewhere in that field, a few thousand first-timers just became casuals, and a few casuals just became hardcore. That's the whole food chain of fandom, fed in one hour."

---

## 5. SHOW CONTEXTS

Show contexts are the "why tonight is different" layer on top of a venue. **Engine honesty:** today the engine supports contexts only as crowd-mix (factionShare) and show-rule (song count, encore threshold) adjustments — exactly what the Daily Challenge's Standard Night / Hardcore Crowd / Newcomer Night do. Anything needing scoring-weight changes, mid-show events, band-state, or new canonical data is tagged accordingly. Tags: **[TODAY]** = expressible now with factionShare/ShowRules tweaks + copy; **[NEW MECHANICS]** = requires engine additions named in the entry (and cross-referenced in Section 16).

Each context gets six fields: **Intro** (player-facing, pre-show), **Audience expectation**, **Scoring emphasis** (which real metrics the context spotlights — today this can only be *presentation* emphasis, not weight changes, unless tagged), **Risks**, **Opportunities**, **Final-review flavor** (a context-specific sentence the review's closing slot may append).

### 5.1 Neutral Show **[TODAY]** *(exists: Daily's "Standard Night")*
- **Intro:** "A typical night, a typical crowd. No excuses, no advantages — just the band, the room, and your calls."
- **Audience expectation:** The default faction mix; every faction present in ordinary proportion.
- **Scoring emphasis:** None — the balanced baseline all other contexts are felt against.
- **Risks:** Only the usual ones. A neutral night exposes pure setlist craft.
- **Opportunities:** The cleanest read on whether a set strategy actually works.
- **Final-review flavor:** "An ordinary night — which made what the set did with it entirely its own."

### 5.2 Festival Slot **[TODAY]** *(factionShare skew toward deepCut/hardcore + tighter song count — mechanically the Festival Side Stage pattern, reusable as a context)*
- **Intro:** "A shared bill and a hard curfew. The crowd is only partly yours, and the clock doesn't care."
- **Audience expectation:** Restless, mixed, deep-cut/hardcore leaning; walk-through casuals deciding fast.
- **Scoring emphasis:** Audience Retention and Energy Curve — hooks early, no flat middle.
- **Risks:** Slow-build sets die in short slots; drifting casuals leave for other stages.
- **Opportunities:** Rarity plays huge to a hunter-heavy field; a tight set punches above its length.
- **Final-review flavor:** "For a crowd that could have been anywhere on the grounds, an awful lot of them stayed right here."

### 5.3 Album Anniversary **[NEW MECHANICS: album-targeting objective — engine must know which album is being honored and check representation from it]**
- **Intro:** "Tonight honors one album — the crowd bought tickets expecting to hear its heart, if not its every track."
- **Audience expectation:** Devotees of one era; unusually warm toward that album's material, cooler toward detours.
- **Scoring emphasis:** Diversity inverts here — depth in one album is the point (needs a context-scoped objective, not a weight change).
- **Risks:** A set that ignores the honored album breaks a promise the ticket made.
- **Opportunities:** That album's Rare and Legendary tracks become the night's expected miracles.
- **Final-review flavor:** "A night that kept the promise printed on the ticket."

### 5.4 New Album Tour **[NEW MECHANICS: release-recency data on albums — BSM has album metadata but no "newest album" context wiring]**
- **Intro:** "New songs in the set and nobody's sure of them yet — including the crowd. Introduce the new material like you believe in it."
- **Audience expectation:** Curious but conservative — they'll accept new songs bracketed by trusted ones.
- **Scoring emphasis:** Emotional Journey and Pacing — new material lands when the arc carries it.
- **Risks:** Front-loading unfamiliar songs drains casuals and first-timers before goodwill accrues.
- **Opportunities:** Pairing a new song with a beloved staple lends it borrowed trust.
- **Final-review flavor:** "By the encore, the new songs weren't new anymore."

### 5.5 Final Night of Tour **[NEW MECHANICS: tour-state — no concept of multi-show continuity exists]**
- **Intro:** "Last night of the run. Everything the tour learned is in your hands, and everyone on stage knows there's no tomorrow to fix it."
- **Audience expectation:** A celebratory, forgiving crowd expecting looseness, generosity, and at least one 'only tonight' gesture.
- **Scoring emphasis:** Rarity Excitement and Encore Quality — finales are measured by their gifts.
- **Risks:** Sentimentality without structure; a sloppy 'anything goes' set is still sloppy.
- **Opportunities:** The one night a Mythic call feels almost expected.
- **Final-review flavor:** "A closing night that closed something properly."

### 5.6 Hometown Show **[NEW MECHANICS: hometown/loyalty data — nothing canonical exists; must never be invented for real bands]**
- **Intro:** "Everyone in this room has a story about this band that starts with 'before they were anybody.' Play like you remember it too."
- **Audience expectation:** Maximum warmth, maximum scrutiny — a crowd of witnesses, not customers.
- **Scoring emphasis:** Spectrum Match — of all nights, tonight the band must sound like itself.
- **Risks:** A generic set reads as forgetting where you came from.
- **Opportunities:** Early-catalog material and emotional peaks hit multiples of their usual force.
- **Final-review flavor:** "The kind of night a hometown files away as evidence it was right all along."

### 5.7 Deep-Cut Night **[TODAY]** *(factionShare skew hard toward deepCut — the Hardcore Crowd pattern pointed at hunters)*
- **Intro:** "Advertised as a night for the faithful: the rarities, the b-sides, the never-played. The setlist historians are front and center, and they brought receipts."
- **Audience expectation:** Hunter-dominated; Essentials tolerated only as connective tissue.
- **Scoring emphasis:** Rarity Excitement above all; Authenticity close behind (obscure songs with fallback data undercut the premise).
- **Risks:** Rare songs with thin data; a 'deep' set that's merely unfamiliar, with no arc.
- **Opportunities:** The one room where Mythic and Legendary calls are the *center* of the show, not seasoning.
- **Final-review flavor:** "The faithful got the night they were promised — and they're the hardest crowd in music to keep a promise to."

### 5.8 Short Set **[TODAY]** *(ShowRules minSongs/maxSongs override — already how Rehearsal Room works)*
- **Intro:** "A handful of songs and no room for a single wasted call. Short sets are arguments: state the thesis, prove it, get off."
- **Audience expectation:** Standard mix, compressed patience — every song is a third of the show.
- **Scoring emphasis:** Energy Curve and Pacing — the arc must exist in miniature.
- **Risks:** One mismatched pick is a huge fraction of the night; no time to recover a lost faction.
- **Opportunities:** Easiest format in which to land a perfect arc; a flawless short set is a real craft achievement.
- **Final-review flavor:** "Not a note wasted — the short set as a closing statement."

### 5.9 Exhausted Band **[NEW MECHANICS: band-fatigue state — no per-song stamina cost or band condition exists; would need an energy-budget system]**
- **Intro:** "Months on the road and it shows. Tonight the band's reserves are finite — spend them where they count."
- **Audience expectation:** The crowd doesn't know or care about the odometer; expectations are undimmed.
- **Scoring emphasis:** Pacing — the fantasy is resource-managed pacing, alternating demanding and merciful material.
- **Risks:** Stacking the most demanding songs consecutively; a set the band can't physically deliver.
- **Opportunities:** Atmospheric and emotional material shines — intensity isn't the only currency.
- **Final-review flavor:** "A tired band played a smart show, which is its own kind of virtuosity."

### 5.10 Intimate Performance **[TODAY]** *(small-capacity framing + factionShare skew toward devotees + short-to-mid ShowRules)*
- **Intro:** "A small room, close enough to see everyone. Nothing to hide behind — and nothing you'd want to."
- **Audience expectation:** Devotee-leaning, quiet, attentive; rarity and emotion at point-blank range.
- **Scoring emphasis:** Emotional Journey and Rarity Excitement — intimacy magnifies both.
- **Risks:** Arena-scaled bombast feels absurd at ten feet.
- **Opportunities:** The quietest, strangest, most personal material in the Collection finds its natural room.
- **Final-review flavor:** "A show built for the people actually in the room."

### 5.11 Arena Spectacle **[NEW MECHANICS: no arena-scale venue exists; needs the Arena archetype (4.6) as a real venue plus, ideally, scale-sensitive presentation]**
- **Intro:** "The biggest stage there is. Tonight is architecture: broad shapes, clear peaks, and songs that can fill all that air."
- **Audience expectation:** Casual/first-timer dominated at enormous scale; the faithful diluted but present.
- **Scoring emphasis:** Audience Retention and Energy Curve — the back row follows shape, not detail.
- **Risks:** Subtlety evaporating; losing the faithful while courting the rafters.
- **Opportunities:** The catalog's biggest songs doing exactly what they were built for.
- **Final-review flavor:** "A show that reached the last row without abandoning the first."

### 5.12 Rain-Soaked Festival **[NEW MECHANICS: weather/condition events — no mid-show event system exists]**
- **Intro:** "The rain started an hour ago and nobody left. That's not an audience anymore — that's a congregation. Reward them."
- **Audience expectation:** Whoever stayed is committed; a smaller, fiercer, more forgiving crowd.
- **Scoring emphasis:** Emotional Journey and Crowd Peak — misery-plus-music forges the biggest single moments.
- **Risks:** Playing it safe for people who are literally standing in the rain is an insult.
- **Opportunities:** Weather turns any big emotional song into a story people tell for years.
- **Final-review flavor:** "Everyone who stayed got a reason to be glad they did."

### 5.13 Unexpected Encore **[NEW MECHANICS: post-show extension event — encore flow exists, but a surprise second encore demands an event system]**
- **Intro (mid-show event text):** "The houselights came up and the crowd didn't move. They want one more — you didn't plan this. Choose fast, choose true."
- **Audience expectation:** Pure goodwill; an audience that has already decided the night was great and wants a coda.
- **Scoring emphasis:** Encore Quality and Crowd Peak — a bonus swing on top of a finished show.
- **Risks:** A limp pick can dent a triumphant ending; declining is safe but joyless.
- **Opportunities:** House money — the boldest call in the Collection, risked at the cheapest price of the night.
- **Final-review flavor:** "And then, when it was over, it wasn't — and the last surprise was the best one."

### 5.14 Technical Delay **[NEW MECHANICS: mid-show interruption events + momentum penalty/recovery mechanics]**
- **Intro (mid-show event text):** "Something just died on stage — could be five minutes, could be twenty. The crowd's patience is now part of the setlist."
- **Audience expectation:** Goodwill draining in real time; the next call after the delay carries double weight.
- **Scoring emphasis:** Audience Retention and the re-engagement arc — the comeback made mechanical.
- **Risks:** Resuming with a slow build into a room that's gone cold.
- **Opportunities:** The perfect restart call becomes the night's defining moment precisely *because* of the failure.
- **Final-review flavor:** "The gear failed; the setlist didn't."

### 5.15 Benefit Concert **[NEW MECHANICS partially — the crowd mix is a factionShare tweak (TODAY), but the distinct scoring frame (unity over identity) needs context-scoped emphasis]**
- **Intro:** "Tonight is for a cause bigger than the band, and the room is full of people who've never shared a crowd before. Find the songs that hold strangers together."
- **Audience expectation:** The broadest mix possible — heavy casual/first-timer, but every faction present, all primed for generosity.
- **Scoring emphasis:** Audience Retention and Emotional Journey — unity of the room over purity of identity.
- **Risks:** The catalog's most divisive material splitting a crowd that came to be joined.
- **Opportunities:** Emotional, accessible peaks reach further tonight than any other night.
- **Final-review flavor:** "For one night, five kinds of fan were one kind of crowd."

---

## 6. CAMPAIGN STAGE WRITING

The Campaign is a reputation, not a grind. The player is not "leveling up" — the *band's live standing* is growing, one room at a time, and every stage's writing reinforces the same loop: a room extends trust → the set repays it or doesn't → the story of that night opens the next room. Mechanical facts below (song counts, requirements, gates) are the shipped configuration and must not be contradicted; the creative layer is what this section adds.

**Eligibility copy rule (binding, already policy):** Campaign stages are recovered-songs-only, checked against the player's real recovered count and total duration. When a player is ineligible, the copy always says exactly what's missing and how to fix it — never a bare "Locked." Section 11 has the templates; each stage's "Recover more songs" guidance below is the stage-flavored version.

### Stage 1 — Rehearsal Room *(3 songs, tutorial, cannot meaningfully fail; needs 3 recovered songs)*

- **Title treatment:** Rehearsal Room — *"Where sets are born"*
- **Intro:** "Before there's a show, there's a room where three songs get played in a row on purpose for the first time. This is that room. A few friends came to listen. Nothing is at stake except learning what your songs sound like next to each other."
- **Venue fantasy:** The player is the band's inner circle: cables, folding chairs, the first end-to-end run of a real set.
- **Audience feeling:** Unconditional. Friends and first-timers who will clap for anything — which paradoxically makes this the only room where the player can hear the *set itself*.
- **Why it matters:** Every habit the ladder will test — opening choice, contrast, the shape of three songs — is formed here, free.
- **What the player learns:** The core loop (call songs, watch the crowd read, see the Show Report) and the idea that order matters: the same three songs in a different order are a different show.
- **Victory text:** "Three songs, one shape. Your friends noticed the set had a beginning, a middle, and an end — even if they couldn't say why. That's craft, and it travels."
- **1★ text:** "A set happened, start to finish. That's genuinely all this room asks."
- **2★ text:** "The room stayed with you the whole way. These songs are starting to belong together."
- **3★ text:** "Even here, with nothing at stake, you built an arc. Rooms with stakes are going to like you."
- **Unlock text (→ Local Bar):** "Word travels the way it always has: someone knew someone. The Local Bar has an open Thursday and a corner stage. This time, the crowd pays — and paying crowds make choices."
- **Encouraging failure text:** *(not applicable — the stage cannot meaningfully fail; abandoned runs use Section 11's interrupted-run copy)*
- **Recover more songs guidance (if < 3 recovered):** "The Rehearsal Room needs three recovered songs — a set is three songs minimum, even here. Recover songs in Band RPG and come back; the folding chairs aren't going anywhere."

### Stage 2 — Local Bar *(4–5 songs, needs 5 recovered / 15+ min; retention begins to matter)*

- **Title treatment:** Local Bar — *"The first paying crowd"*
- **Intro:** "A small stage in the corner and a crowd that showed up on purpose. They paid — not much, but the transaction changes everything. Tonight, staying is a decision your audience re-makes every song, and the door is right there."
- **Venue fantasy:** The classic first real gig: sticky floor, house PA, the band's name misspelled on the chalkboard, and the electric fact of strangers listening.
- **Audience feeling:** Friendly but honest. Warmth is available and walkouts are real; the room gives you its attention and watches what you do with it.
- **Why it matters:** This is where Attendance becomes a living number — the ladder's first true test: can this band hold a room it doesn't personally know?
- **What the player learns:** Retention. Walkouts as consequence. That the casual majority is won with warmth and lost with neglect, and that one well-placed emotional song does what three clever ones can't.
- **Victory text:** "Stage Cleared. The room was fuller at the end than the middle — in a bar, that's the miracle number. Somebody asked when you're playing next. Somebody always knows a guy at the Small Theatre."
- **1★ text:** "Cleared — the set held together and enough of the room held with it. The rough edges are exactly the kind this stage exists to sand off."
- **2★ text:** "A genuinely good bar gig: the crowd stayed, the set had shape, and the regulars will vouch for you. Vouching is currency."
- **3★ text:** "Three stars. Packed corner stage, encore in a *bar* — the bartender's nod, the hardest-won review in music. This room has nothing left to teach you."
- **Unlock text (→ Small Theatre):** "A crowd that stays becomes a crowd that talks. The Small Theatre books on talk — real seats, real lights, and the first audience that will listen closely enough to hear what your set is made of."
- **Encouraging failure text:** "Stage Not Cleared — the room thinned before the end, and thin rooms are the bar's way of teaching. Look at the Show Report: where did the walkouts cluster? Bars are won with warmth — open accessible, land one emotional peak, give the loud contingent one loud song. Your Collection already has tonight's answer in it."
- **Recover more songs guidance (if < 5 recovered / < 15 min):** "The Local Bar books acts with at least 5 recovered songs and 15 minutes of material — a paying crowd needs a real set. You have [X] songs / [Y] minutes recovered. Recover a few more in Band RPG and this stage opens."

### Stage 3 — Small Theatre *(6–8 songs, needs 8 recovered / 28+ min; authenticity expectations rise)*

- **Title treatment:** Small Theatre — *"The listening room"*
- **Intro:** "Real seats, real lighting, and a crowd that knows the difference between a real setlist and a lazy one. When the lights drop, this room goes silent — and silence means they're listening to everything, including what your set is built on."
- **Venue fantasy:** The step where a band becomes an *act*: a lighting cue, a proper soundcheck, a printed ticket with the band's name on it.
- **Audience feeling:** Attentive and discerning. Not hostile — *invested*. This crowd wants to be shown something true and can tell when it isn't.
- **Why it matters:** Authenticity enters the game. A theatre crowd senses when a set leans on songs the game barely knows (fallback data) — the ladder's first demand that the player's Collection be *deep*, not just big.
- **What the player learns:** That Authenticity is a real dimension of quality; that Spectrum Match matters to a listening crowd; that album diversity and a first rare pick are how a set earns the word "curated."
- **Victory text:** "Stage Cleared. Theatre crowds don't cheer for effort — they cheered for the show. Between songs you could hear the silence holding, which is the sound of a room deciding you're real."
- **1★ text:** "Cleared. The room heard a real set — and heard exactly where it stretched thin. Theatres are honest that way; use it."
- **2★ text:** "A proper theatre night: authentic material, a true shape, a crowd that leaned in and stayed leaned. The ladder's middle rung, climbed properly."
- **3★ text:** "Three stars. Identity intact, catalog ranged, one pick nobody expected — the ovation had seats-up in it. Festival bookers read theatre reviews."
- **Unlock text (→ Festival Side Stage):** "A theatre ovation carries past the lobby. There's a festival side stage with a Thursday slot and a crowd that walks between stages mid-song — the most restless audience you've ever faced, and the most rewarding one to stop in its tracks."
- **Encouraging failure text:** "Stage Not Cleared — this room asks more than the bar did, and it tells you precisely what was missing. Low Authenticity? The set leaned on songs without full identity data — recover and analyze deeper. Faded crowd? Check which factions the middle third forgot. The theatre will hold your date."
- **Recover more songs guidance (if < 8 recovered / < 28 min):** "The Small Theatre needs 8 recovered songs and 28 minutes — a theatre set has acts, and acts take material. You have [X] songs / [Y] minutes. A few more recoveries in Band RPG and the seats are yours."

### Stage 4 — Festival Side Stage *(8–10 songs, needs 10 recovered / 35+ min; hunter/hardcore-heavy)*

- **Title treatment:** Festival Side Stage — *"The restless crowd"*
- **Intro:** "A festival crowd drifting in from other stages — half already fans, half deciding right now, all of them one dull stretch away from wandering off to somewhere louder. Deep-cut hunters and hardcore fans came looking for something specific. Give it to them."
- **Venue fantasy:** Golden-hour slot, competing kick drums in the distance, a tent that could hold three hundred or three thousand depending entirely on the next forty minutes.
- **Audience feeling:** Kinetic and conditional. The warmest crowd on the ladder when won, the fastest-evaporating when not. Their attention is a tide.
- **Why it matters:** The ladder's test of *nerve*. Safe sets die here; the house rewards rarity, intensity, and a refusal to flatline — the skills the Major Theatre will demand at scale.
- **What the player learns:** That rarity is a strategy, not a flourish (the `playRareOrBelow` objective has teeth here); that hardcore and hunter momentum are worth courting on purpose; that a strong encore is built long before it's called.
- **Victory text:** "Stage Cleared. People walked *toward* your tent mid-set — at a festival that's the only review with legal standing. The crowd that leaves a side stage impressed is the crowd that buys the theatre ticket."
- **1★ text:** "Cleared — you held a crowd that owed you nothing. The set played it safer than this house loves, but it *held*, and holding a festival crowd is a real skill."
- **2★ text:** "A side-stage set with teeth: the hunters got a surprise, the front rows got their sweat, and the tent was fuller at the end. This is how reputations start at festivals."
- **3★ text:** "Three stars. Overflowing tent, an encore at a *festival*, and at least one call the setlist historians will argue about. The Major Theatre's booker was standing at the back with their arms crossed. They uncrossed them."
- **Unlock text (→ Major Theatre):** "Festival talk is loud and short-lived — unless a booker hears it. One did. The Major Theatre: a sold-out room, every faction in force, and the top of this ladder. Bring everything."
- **Encouraging failure text:** "Stage Not Cleared — festival crowds vote with their feet, and today they wandered. This house punishes caution: it wanted one genuine rarity, one sustained heavy stretch, and no flat middle. Check where Attendance sagged in the Show Report — that's where another stage's kick drum won. Next slot, bring nerve."
- **Recover more songs guidance (if < 10 recovered / < 35 min):** "Festival slots demand 10 recovered songs and 35 minutes — restless crowds eat material fast. You have [X] songs / [Y] minutes. Deepen the Collection in Band RPG, and pack at least one rarity when you come back."

### Stage 5 — Major Theatre *(10–13 songs, needs 12 recovered / 45+ min; every faction demanding)*

- **Title treatment:** Major Theatre — *"Top of the ladder"*
- **Intro:** "A sold-out room that knows every rumor about this band — tonight decides which ones are true. Every faction is here in force: hunters counting rarities, prog heads mapping the arc, front rows measuring intensity, and a thousand people who just love the songs. There is nowhere in a set this long to hide a filler pick."
- **Venue fantasy:** The marquee with the band's name in lights, the longest soundcheck of their life, and a room whose silence, when the lights drop, has physical weight.
- **Audience feeling:** A jury of every kind of fan at once — demanding not because it's hostile, but because it contains everyone the ladder has taught you to serve, all at full strength, all at the same time.
- **Why it matters:** It's the thesis of the whole game in one room: identity, stamina, nerve, balance, and an encore that means it. Clearing it is the proof; three-starring it is the *legend*.
- **What the player learns:** Synthesis. Nothing new — everything at once: the bar's warmth, the theatre's authenticity, the festival's nerve, sustained across ten-plus songs where pacing mistakes compound.
- **Victory text:** "Stage Cleared. Three thousand people, five kinds of fan, one verdict — and it came back in your favor. Whatever the rumors said about this band, tonight made them true."
- **1★ text:** "Cleared — the top of the ladder, reached. The room saw the seams, and it also saw a band that belonged on that stage. Both things are true; only one of them is permanent."
- **2★ text:** "A major-theatre night the room will vouch for: every faction fed at least once, the identity held, the long set never buckled. What remains isn't a bigger room — it's a perfect night in this one."
- **3★ text:** "Three stars at the top of the ladder. Identity intact across thirteen songs, five factions fed, the catalog ranged, a rarity risked, an encore that meant it. There's a word for a band that can do that, and it's the name of this game."
- **Unlock text:** *(final stage — nothing further unlocks)* "There is no next rung — only this room, and the difference between clearing it and owning it. The ladder ends; the craft doesn't."
- **Encouraging failure text:** "Stage Not Cleared — and no shame in it: this room is the whole game at once. No single fix clears it. Read the Show Report like a map: which gate missed — the score, the retention, the authenticity? The ladder taught each of these one rung at a time; tonight just asked for them together. The marquee keeps your name on file."
- **Recover more songs guidance (if < 12 recovered / < 45 min):** "The Major Theatre books 45-minute headline sets — 12 recovered songs minimum, and honestly, the deeper the Collection, the better the odds against a room this complete. You have [X] songs / [Y] minutes. The top rung will wait; it's been waiting for every band that ever reached it."

---

## 7. CONCERT REVIEW SYSTEM

The post-show review is Headliner's signature text: four to six sentences that read like a small local review, assembled deterministically from slotted templates keyed to the ten real metrics. It replaces the current handful of hardcoded sentences in the engine's review builder. **No runtime AI anywhere:** the whole system is template selection over metric thresholds; identical inputs must always produce the identical review.

### 7.0 Standard metric bands (used by every template in Sections 7–8)

All ten metrics are 0–100. `overallScore` is 0–1000, weighted (not averaged).

| Band | 0–100 metrics | overallScore |
|---|---|---|
| **Exceptional** | ≥ 85 | ≥ 800 (matches shipped "legendary night" threshold) |
| **Strong** | 70–84 | 600–799 (matches shipped "strong show") |
| **Solid** | 55–69 | 400–599 (matches shipped "serviceable set") |
| **Shaky** | 40–54 | 200–399 |
| **Poor** | < 40 | < 200 |

For `overallScore` prose, Shaky and Poor share the shipped "rough night" register (< 400), with Poor getting the bleaker variants.

### 7.1 Review grammar

A review is: **Opening + Identity + Crowd + Pacing + Encore/Ending + Closing verdict**, in that order, one sentence (occasionally two) per slot. Selection rules:

1. Each slot has a template pool; eligible templates are those whose conditions all hold; among eligible templates, selection is deterministic (e.g., seeded by run id) so replays of the same result show the same review.
2. `[Band Name]` is always the player's real band name from BSM data; `[N]` slots take real numbers from the report. No other facts may be interpolated.
3. If `usedFallbackData` is true, the review MUST end (after the closing verdict) with the fallback disclosure sentence — the existing honest sentence pattern is kept verbatim in spirit: "[N] song(s) in this set still don't have full identity data — scores for those songs used a neutral estimate." This is non-negotiable honesty copy.
4. The contradiction rules in 7.8 filter the eligible pools before selection.

### 7.2 Opening templates (keyed to `overallScore`) — 12

| id | Condition | Text |
|---|---|---|
| OPEN-01 | ≥ 900 | "Nights like this are why setlists get framed — [Band Name] didn't play a show so much as make an argument nobody could answer." |
| OPEN-02 | ≥ 800 | "A legendary night for [Band Name] — the kind the crowd will exaggerate for years without needing to." |
| OPEN-03 | ≥ 800 | "Every so often a set clicks shut like a lock. This was [Band Name]'s." |
| OPEN-04 | 600–799 | "A strong, well-run [Band Name] show — the work of a band that knew exactly what room it was in." |
| OPEN-05 | 600–799 | "[Band Name] delivered the kind of night that doesn't make headlines but makes fans." |
| OPEN-06 | 600–799 | "No wasted motion tonight: [Band Name] played a confident set and the room repaid it." |
| OPEN-07 | 400–599 | "A serviceable [Band Name] set with room to grow — flashes of a great show inside a decent one." |
| OPEN-08 | 400–599 | "[Band Name] gave the room a fair night's music; the great night stayed just out of reach." |
| OPEN-09 | 400–599 | "You could see the show this wanted to be — [Band Name] got it about two-thirds of the way there." |
| OPEN-10 | 200–399 | "A rough night for [Band Name] — the crowd never quite connected, and you could feel both sides trying." |
| OPEN-11 | 200–399 | "Some nights the room and the setlist just don't agree. Tonight they argued from the first song." |
| OPEN-12 | < 200 | "A night [Band Name] will want back — very little landed, and the set never found the door into the room." |

### 7.3 Identity templates (keyed to `spectrumMatch`, with `authenticity` sub-conditions) — 12

| id | Condition | Text |
|---|---|---|
| IDEN-01 | spectrumMatch ≥ 85 | "Every pick felt true to the band — this setlist could have been sworn in as testimony about who [Band Name] is." |
| IDEN-02 | spectrumMatch ≥ 85 AND authenticity ≥ 85 | "The set landed dead on the band's identity, and it was built almost entirely on the real thing — no padding, no guesswork." |
| IDEN-03 | spectrumMatch 70–84 | "The setlist stayed close to the band's core sound, wandering only where wandering suited it." |
| IDEN-04 | spectrumMatch 70–84 AND diversity ≥ 70 | "True to the band's identity while ranging across the catalog — the hardest balance in setlist-craft, mostly struck." |
| IDEN-05 | spectrumMatch 55–69 | "The band's identity was recognizable in the set, if softened around the edges." |
| IDEN-06 | spectrumMatch 55–69 AND authenticity < 55 | "The shape of the band was there, but too much of the set rested on songs the record barely knows — the outline was right, the ink was thin." |
| IDEN-07 | spectrumMatch 40–54 | "The setlist drifted from the band's core sound — individually fine picks that added up to somebody else's show." |
| IDEN-08 | spectrumMatch < 40 | "Whatever band this setlist described, it wasn't quite [Band Name] — the identity drifted early and never came home." |
| IDEN-09 | authenticity ≥ 85 AND spectrumMatch 55–84 | "Nearly every song came with its full identity on record — a set built on bedrock, even where its aim wobbled." |
| IDEN-10 | authenticity 70–84 | "Most of the set stood on real data, with only a little neutral-estimate scaffolding holding up the rest." |
| IDEN-11 | authenticity 40–54 | "A large share of tonight ran on neutral estimates rather than the band's real profile — the review, like the crowd, could only judge what it could hear." |
| IDEN-12 | authenticity < 40 | "Most of this set was played on placeholder data — until more of these songs are fully analyzed, nights like this are being scored in silhouette." |

### 7.4 Crowd templates (keyed to `audienceRetention`, `crowdPeak`, `rarityExcitement`) — 12

| id | Condition | Text |
|---|---|---|
| CROWD-01 | audienceRetention ≥ 85 | "The room was fuller-feeling at the end than the start — nobody wanted to be the first to leave, so nobody left." |
| CROWD-02 | audienceRetention ≥ 70 | "The crowd stayed and stayed engaged, riding the set's choices rather than merely tolerating them." |
| CROWD-03 | audienceRetention 55–69 | "The room held together, with some fraying at the edges during the set's less generous stretches." |
| CROWD-04 | audienceRetention 40–54 | "A slow leak of walkouts ran through the night — never a rupture, always a reminder." |
| CROWD-05 | audienceRetention < 40 | "The room emptied by degrees, and by the closer the set was playing to the people who stay for anything." |
| CROWD-06 | crowdPeak ≥ 85 | "One moment towered over the night — for a single song, part of this crowd got everything it came for at once." |
| CROWD-07 | crowdPeak ≥ 85 AND audienceRetention < 55 | "Even on a night of walkouts, there was one song where a corner of the room lost its mind — the peak survived the show around it." |
| CROWD-08 | rarityExcitement ≥ 70 | "The setlist historians got fed tonight — the rare picks landed with the people who knew exactly how rare they were." |
| CROWD-09 | rarityExcitement ≥ 85 | "At least one call tonight will end up in fan lore — the kind of rarity people claim to have witnessed in greater numbers than the room could hold." |
| CROWD-10 | rarityExcitement < 40 AND audienceRetention ≥ 55 | "A steady room, though the deep-cut contingent went home with empty notebooks — nothing tonight surprised anyone." |
| CROWD-11 | crowdPeak 55–84 AND audienceRetention ≥ 55 | "No single moment detonated, but the crowd found plenty to hold onto." |
| CROWD-12 | crowdPeak < 40 | "The night never produced a true peak — no song where any part of the room fully ignited." |

### 7.5 Pacing templates (keyed to `energyCurveFit`, `paceDiscipline`, `emotionalJourney`) — 12

| id | Condition | Text |
|---|---|---|
| PACE-01 | energyCurveFit ≥ 85 | "The pacing built and released tension like a tide chart — the set breathed exactly when the room needed it to." |
| PACE-02 | energyCurveFit ≥ 70 | "The energy climbed, broke, and climbed again in the right places — a set with an actual shape." |
| PACE-03 | energyCurveFit 55–69 | "The pacing mostly worked, give or take a stretch that idled where it should have shifted." |
| PACE-04 | energyCurveFit 40–54 | "The energy curve felt uneven — runs of similar songs stacked back to back where contrast was owed." |
| PACE-05 | energyCurveFit < 40 | "The set moved like a flat line with a nervous tic — no build, no release, just adjacency." |
| PACE-06 | paceDiscipline ≥ 85 | "Not one pacing foul all night — transitions clean, momentum husbanded like it was rationed." |
| PACE-07 | paceDiscipline < 45 | "The set kept stepping on its own momentum — pacing penalties piled up where discipline should have been." |
| PACE-08 | emotionalJourney ≥ 85 | "Emotionally, the night traveled — it took the room somewhere, held it there, and brought it back changed." |
| PACE-09 | emotionalJourney ≥ 70 | "There was a real emotional arc under the songs, not just a sequence of them." |
| PACE-10 | emotionalJourney < 40 | "Emotionally the set stayed on one floor — never rose, never fell, never risked the elevator." |
| PACE-11 | energyCurveFit ≥ 70 AND emotionalJourney ≥ 70 | "Shape and feeling moved together tonight — the energy carried the emotion and the emotion justified the energy." |
| PACE-12 | energyCurveFit < 55 AND paceDiscipline ≥ 70 | "Disciplined but shapeless — no fouls, no flow; a set that obeyed every rule except the one about going somewhere." |

### 7.6 Encore/Ending templates (keyed to `encoreQuality` and encore-played state) — 10

| id | Condition | Text |
|---|---|---|
| ENC-01 | encore played, encoreQuality ≥ 85 | "The encore didn't just land — it re-priced the whole evening. That last call is the one the room walked out humming about." |
| ENC-02 | encore played, encoreQuality ≥ 70 | "The crowd earned an encore and the encore repaid them — a genuine ending, not an appendix." |
| ENC-03 | encore played, encoreQuality 55–69 | "The encore landed, if softly — a good ending that a braver call might have made a great one." |
| ENC-04 | encore played, encoreQuality 40–54 | "The encore came back to a warm room and cooled it slightly — the night's one gift, half-unwrapped." |
| ENC-05 | encore played, encoreQuality < 40 | "The crowd demanded one more and got the wrong one — an encore that answered the request but not the reason for it." |
| ENC-06 | no encore, audienceRetention ≥ 70 | "No encore tonight — the room was warm, but never quite crossed into demanding more. A closer with more conviction might have tipped it." |
| ENC-07 | no encore, audienceRetention 40–69 | "No encore tonight — the crowd wasn't won over enough to ask, and the houselights agreed." |
| ENC-08 | no encore, audienceRetention < 40 | "The set ended and the room, what remained of it, accepted the ending without protest." |
| ENC-09 | encore played, encoreQuality ≥ 70 AND crowdPeak ≥ 85 achieved during encore* | "The single biggest reaction of the night came *after* the houselights teased — the encore was the show's true summit." |
| ENC-10 | encore played, encoreQuality ≥ 55 AND rarityExcitement ≥ 70 | "Ending on a rarity is a bet that the faithful outnumber the tired — tonight, they did." |

*ENC-09 requires knowing the peak's position in the set — a small engine addition (Section 16.B); until then the template stays dormant.

### 7.7 Closing verdict templates (keyed to `overallScore`, colored by `diversity` and the run's context) — 12

| id | Condition | Text |
|---|---|---|
| CLOSE-01 | ≥ 800 | "File this one under proof: proof of what this catalog can do when somebody sequences it like they mean it." |
| CLOSE-02 | ≥ 800 AND diversity ≥ 80 | "Songs pulled from across the whole discography, welded into one night — a set that treated the catalog like a country and toured all of it." |
| CLOSE-03 | ≥ 800 | "Whatever the next room is, this set just bought the ticket to it." |
| CLOSE-04 | 600–799 | "A night that keeps a reputation growing — not the show they'll write books about, but absolutely the show they'll come back for." |
| CLOSE-05 | 600–799 AND diversity ≥ 70 | "The breadth of the catalog did quiet work all night — a strong show made sturdier by how much ground it covered." |
| CLOSE-06 | 600–799 | "The verdict from the floor: worth it, and next time might be special." |
| CLOSE-07 | 400–599 | "A decent night with a visible ceiling — the pieces of a much better show were all on stage; they just never met." |
| CLOSE-08 | 400–599 AND diversity < 40 | "Leaning this hard on one corner of the catalog kept the night smaller than the band is — the discography has more doors than the set knocked on." |
| CLOSE-09 | 400–599 | "Nobody left angry; nobody left changed. There's a better version of this set, and it's close." |
| CLOSE-10 | 200–399 | "Rough nights are tuition — the Show Report is the receipt, and it itemizes exactly what tonight paid for." |
| CLOSE-11 | 200–399 | "The room and the set never found each other tonight — but rooms have short memories and setlists are rewritable." |
| CLOSE-12 | < 200 | "Very little worked, and pretending otherwise would insult everyone involved — start from the crowd read, rebuild from the opener, and let this one go." |

### 7.8 Contradiction-prevention rules

A review must never argue with itself. Rules, applied as filters before selection:

1. **Opening and closing must share a band.** Both keyed to `overallScore`, so this holds automatically — but any future template keyed more loosely must still match the run's overallScore band.
2. **No slot may praise what another slot's metric condemns.** Concretely: a template may only *mention* a metric it names a condition on, and its tone for that metric must match that metric's band.
3. **Fallback disclosure is mandatory and last.** If `usedFallbackData`, the disclosure sentence always appends after the closing verdict; no template may claim "no guesswork" (IDEN-02 requires authenticity ≥ 85 partly for this reason).
4. **Encore honesty.** If `encoreQuality` = 0 because no encore occurred, only ENC-06/07/08 are eligible; no template may imply an encore happened.
5. **Peak vs. retention.** CROWD-06 (towering moment) may not appear with CLOSE-12 (nothing worked); use CROWD-07, built for that split, when peak ≥ 85 and retention < 55.

**Forbidden-combination table (enforced mechanically):**

| Never pair… | …with | Why |
|---|---|---|
| OPEN-01/02/03 (legendary) | CLOSE-07..12 (mediocre/rough) | Verdict whiplash — impossible anyway if both key to overallScore, kept as a guard for future templates |
| IDEN-01/02 (identity nailed) | CLOSE-08 (catalog too narrow) | High spectrumMatch praise + a scolding closer reads as two reviewers |
| IDEN-02 ("no guesswork") | `usedFallbackData` = true | Direct factual contradiction with the mandatory disclosure |
| CROWD-01/02 (room stayed) | ENC-08 ("what remained of the room") | ENC-08's clause asserts heavy walkouts; requires retention < 40 |
| PACE-01/02 (great shape) | OPEN-12 / CLOSE-12 (nothing worked) | A set with genuinely great pacing cannot honestly score < 200; if metrics ever disagree this hard, prefer the harsher slot and drop the praise |
| ENC-01/02 (triumphant encore) | CROWD-05 (room emptied) | An emptied room does not produce a triumphant encore; ENC eligibility must check retention ≥ 40 when encoreQuality ≥ 70 |
| CROWD-09 (fan lore rarity) | rarityExcitement < 85 | Template's own condition — listed here because it's the most tempting one to loosen later. Don't. |

---

## 8. LIVE REACTION LOG

One-line messages surfaced between songs. Reading time budget: two seconds. No metric numbers in the text — the meters show numbers; the log shows *meaning*. Each message type lists its trigger (in terms of the engine's in-show state: per-song crowd reads, faction momentum, running spectrum distance, energy sequence) and 2–3 variants. Variants rotate deterministically (seeded per run). At most two log lines per song; priority order when more trigger: walkout-risk lines > faction spikes > pacing observations > spectrum notes.

1. **Strong opener** — *trigger: song 1 produces net-positive crowd read across ≥ 3 factions.*
   - "Strong open — the room decided to like tonight."
   - "That's how you say hello. The floor is yours for now."
2. **Weak opener** — *trigger: song 1 produces net-negative crowd read.*
   - "Cold start — the room is waiting to be convinced."
   - "That opener asked a lot of a crowd that doesn't know you yet."
3. **Successful contrast** — *trigger: consecutive songs with large energy/axis gap AND positive net read on the second.*
   - "Whiplash, the good kind — the contrast made both songs bigger."
   - "The gear-change landed. The room likes being surprised on purpose."
4. **Repetitive stretch** — *trigger: 3+ consecutive songs within a narrow energy band (the pacing-penalty precondition).*
   - "Three of a kind in a row — the room is starting to hear one long song."
   - "This stretch is looping. Contrast would be oxygen right now."
5. **Energy surge** — *trigger: net crowd momentum rising sharply after the current song.*
   - "The floor just woke up."
   - "Momentum's building — you can hear it between songs now."
6. **Emotional peak** — *trigger: song's `emotional` dimension in top band AND net positive read.*
   - "That one landed somewhere deeper than applause."
   - "Quiet in the room — the good kind."
7. **Complexity overload** — *trigger: 3+ consecutive high-`technical`/`progressive` songs with declining casual + firstTimers momentum.*
   - "The casual crowd stopped keeping up two songs ago."
   - "Impressive stretch — for the third of the room still following it."
8. **Accessibility boost** — *trigger: high-`accessible` song producing positive casual/firstTimers reads after their decline.*
   - "A handhold, at last — the back of the room grabbed it."
   - "That one let everybody in. Attendance thanks you."
9. **Deep-cut surprise** — *trigger: Rare/Legendary/Mythic pick played (rarity-excitement event).*
   - "Setlist historians, start your engines — that was a genuine rarity."
   - "Somebody in the front row just gasped for archival reasons."
   - *(Mythic only:)* "Never played live — until fifteen seconds ago."
10. **Casual-fan loss** — *trigger: casual faction momentum crossing into its walkout band.*
    - "The casual crowd is heading for the doors — this stretch gave them nothing."
    - "Walkouts starting at the back. They wanted a song to hold onto."
11. **Hardcore excitement** — *trigger: hardcore reaction in top band on the current song.*
    - "The front rows just went off."
    - "That's the song the pit was waiting through the ballads for."
12. **Crowd recovery** — *trigger: net momentum rising after 2+ songs of decline.*
    - "You pulled the room back. That was the risky part of the night."
    - "The bleeding stopped — the crowd's yours again, gently."
13. **Spectrum correction** — *trigger: running spectrum distance to Band Identity Target shrinking materially after this call.*
    - "That pick steered the set back toward the band's true north."
    - "Identity re-centering — the show sounds like this band again."
14. **Spectrum drift** — *trigger: running spectrum distance growing for 2+ consecutive songs.*
    - "The set is drifting from what this band is. Deliberate, or a current?"
    - "Two picks off-identity in a row — the room can hear the compass spinning."
15. **Successful encore setup** — *trigger: crowd momentum crosses the venue's encore-energy threshold before the final planned song.*
    - "The room's warm enough to want more — an encore is on the table if you land the closer."
    - "Keep this energy through the closer and they won't let you leave."
16. **Encore demand** — *trigger: main set ends with momentum above the encore threshold (encore unlocked).*
    - "They're not leaving. The floor is stamping for one more."
    - "Houselights up, nobody moving. Your call."
17. **Poor transition** — *trigger: a pacing penalty applied on the current transition.*
    - "Rough gear-change — the momentum snagged between those two songs."
    - "That transition asked the crowd to jump a gap. Some didn't."
18. **Excellent transition** — *trigger: consecutive songs with high curve-fit contribution and no penalty, both reads positive.*
    - "Seamless — those two songs shook hands mid-air."
    - "That's sequencing: the second song started before anyone finished cheering the first."

---

## 9. DAILY CHALLENGE PRESENTATION

Tone rule for the entire mode: **communal, not hyped.** The Daily Challenge's magic is that everyone gets the same show — same band, same crowd context, same candidates — so the copy leans on shared experience ("today's room," "everyone plays this one") and never on artificial urgency. The one real deadline (the daily reset) is stated as a fact, not a threat. Screen names **Daily Briefing** and **Verified Result** are shipped and reused verbatim.

- **Briefing text (Daily Briefing screen):**
  "Today's show: [Band Name] for a [context name] crowd. Everyone playing today gets this exact room, this exact catalog, these exact conditions — one shared puzzle, one official attempt. Read the house, build your set, take the stage."
  *(Context lines, appended by crowd context: Standard Night — "A typical crowd, in typical proportions. Pure setlist craft." / Hardcore Crowd — "The floor skews heavy tonight: deep-cut hunters and hardcore fans out in force." / Newcomer Night — "A gentle house: casual listeners and first-timers make up most of the room.")*

- **Official-attempt warning:**
  "Your first completed run is your Official Attempt — it's the one that goes on the leaderboard, and it can't be re-run. Practice attempts are unlimited, before or after. No pressure to be perfect; every player faces this room exactly once for real."

- **Practice-mode explanation:**
  "Practice attempts use today's exact show — same crowd, same candidates — but never touch the leaderboard. Rehearse freely; only the Official Attempt counts, and only the first completed run is official."

- **Countdown text (to next challenge):**
  "Today's show holds the stage for another [H]h [M]m. A new room, a new band, a new puzzle at the reset."
  *(Already completed variant:)* "Your Verified Result is in for today. Next show in [H]h [M]m."

- **Result-verification text (Verified Result screen):**
  "Verified Result — official and final. Final Attendance [N] · Satisfaction [N] · Score [N]. Same show, same rules, everyone: this is where your night stands."
  *(Note: `satisfaction` is the unweighted mean of all ten metrics and is distinct from the weighted overall score — the screen should gloss it once: "Satisfaction averages all ten measures equally; Score weights what this crowd cared about.")*

- **Leaderboard-entry text:**
  "Your Official Attempt placed [rank] of [total] tonight. Everyone above and below you played the same room with the same songs — the whole difference is the calls."

- **Rank-improvement text** *(shown on later days, comparing to the player's usual standing):*
  "Your best placement yet on a [context name]. Whatever you did with that room, remember it."
  *(General improvement:)* "That's a climb — [X] places better than your average night."

- **"Yesterday's challenge" text:**
  "Yesterday's room: [Band Name], [context name]. Winning score: [N]. The stage is struck — yesterday's show can be viewed and practiced, but official attempts closed at the reset."

- **Share-summary templates** *(text the player can copy out; no invented facts, no spoilers of today's candidate list, uses only the player's own verified numbers):*
  1. "Headliner Daily — [date]. Official Attempt: [score]. Final Attendance [N], Satisfaction [N]. Same show, same songs, one attempt each."
  2. "Played tonight's room ([context name]) — official score [score], rank [rank]/[total]. Everyone gets the same stage. Your setlist would've been different, and that's the whole game."
  3. *(Modest-score variant, self-deprecating never shame-y:)* "Headliner Daily [date]: the crowd and I agreed to disagree. Official score [score]. Same room's waiting for you."

---

## 10. TUTORIAL WRITING

Rules: one or two sentences, no jargon, dismissible, shown once at first encounter (re-openable from a help affordance). Each message teaches the *why* before the *what*. No message may reference another tutorial message.

1. **Band Identity Target:** "This is the band's true sound, averaged across everything they've made. Your setlist gets compared to it at the end — sounding like yourself is worth points."
2. **Current Concert Spectrum:** "This is what your show sounds like *so far*, updated with every song you call. Watch how each pick pulls it toward or away from the band's identity."
3. **Crowd factions:** "Five kinds of fan share this room, and each hears every song differently. No group is wrong — they just came for different things."
4. **Attendance:** "This is how many people are still with you. Nobody leaves over one odd pick, but a long stretch that ignores part of the room will thin it out."
5. **Authenticity vs. Satisfaction:** "Authenticity measures how much of your set was built on fully-analyzed songs rather than neutral estimates. Satisfaction is the crowd's overall verdict — you can have one without the other."
6. **Pacing:** "Crowds feel rhythm across songs, not just within them. Vary the energy — three similar songs in a row starts to sound like one long one."
7. **Live Frequency:** "Every song carries a record of how often it's actually played live, from Essential (nearly every show) to Mythic (never). Rare picks thrill the fans who track these things."
8. **Candidate songs:** "These are your options for the next call. Each shows what it would bring — the skill is choosing for the show you're building, not just the best song."
9. **Recovered songs:** "Songs you've recovered in Band RPG make up your Collection — Campaign shows are built only from these. The deeper your Collection, the bigger the rooms you can book."
10. **Encore:** "Encores are earned, not scheduled. Leave the crowd with enough energy at the end of the set and they'll demand one more — then make that last call count."
11. **Stars:** "Every Campaign stage rates your show up to three stars: one for clearing it, two for doing it well, three for meeting the room's every objective. Stars unlock the ladder."
12. **Daily official attempt:** "Your first completed run of today's challenge is your Official Attempt — the one the leaderboard keeps. Practice runs are unlimited and never count."
13. **Campaign eligibility:** "Each venue books acts with enough recovered material — a real set needs real songs and real minutes. If a stage isn't available yet, it will say exactly what it needs."

---

## 11. EMPTY, LOCKED, AND FAILURE STATES

Binding rule (inherited from the Campaign's design): **never a bare "Locked" or "Unavailable."** Every blocked or empty state says (a) what's true, (b) why, and (c) the specific next action. Numbers in brackets are real values from the player's data. Tone: matter-of-fact and forward-looking; the game is a booking agent, not a bouncer.

1. **No recovered songs (Campaign entry with empty Collection):**
   "Your Collection is empty — Campaign shows are built entirely from songs you've recovered in Band RPG. Recover your first few songs there, and the Rehearsal Room will be waiting. (Quick Show doesn't need recoveries, if you want to play tonight.)"
2. **Too few songs for a stage:**
   "[Stage name] books sets of [min]–[max] songs, so it needs at least [required] recovered songs — you have [current]. Recover [difference] more in Band RPG and this room opens."
3. **Insufficient total duration:**
   "[Stage name] runs a [N]-minute show, and your recovered songs total [current] minutes — [difference] short. A couple more recoveries covers it; longer songs cover it faster."
4. **Missing spectrum data (song has no Song Spectrum):**
   "[Song title] hasn't been analyzed yet, so it has no Song Spectrum — in a show, it would play on a neutral estimate and lower your Authenticity. Run AI analysis on it from the library to bring its real identity on stage."
5. **Missing audience profile:**
   "[Song title] doesn't have an audience profile yet, so the crowd factions can't react to it accurately — it will read as neutral to everyone. Analyzing the song fills this in."
6. **Incomplete band data (band-level gap blocking a mode):**
   "[Band name] doesn't have enough analyzed songs to build a reliable Band Identity Target yet — Headliner would be scoring against a guess, and it won't pretend otherwise. Analyze [N] more songs and this band takes the stage."
7. **Failed run (generic Stage Not Cleared wrapper — stage-flavored versions live in Section 6):**
   "Stage Not Cleared — the show finished below this room's bar. The Show Report breaks down exactly where the night leaked: check it, adjust one thing, and take the stage again. Nothing is lost but an evening."
8. **Interrupted run (abandoned/disconnected mid-show):**
   "This show ended before the last song — interrupted runs aren't scored, for better and worse. The room resets, no record is kept, and the stage is yours whenever you want to start clean."
9. **Challenge unavailable (Daily can't be generated/loaded):**
   "Today's Daily Challenge couldn't take the stage — the show data didn't come through. This is on the venue, not you: your official attempt is untouched. Try again in a moment."
10. **Leaderboard empty:**
    "No verified results yet for today's show — the board fills as players complete their Official Attempts. Play yours and this list starts with you."
11. **Daily already completed:**
    "Your Official Attempt for today is in the books — [score], rank [rank]. The room stays open for practice attempts until the reset in [H]h [M]m; practice never changes your official result."
12. **Campaign stage locked (prior stage not cleared to requirement):**
    "[Stage name] books on reputation: it opens when you've earned [N] star(s) at [previous stage name] — you have [current]. One more good night there and this door opens."
13. **No encore earned:**
    "The houselights came up and the crowd went home — warm, but not demanding more. Encores unlock when the set ends above this room's energy bar; a stronger closing stretch gets you there next time."

---

## 12. ACHIEVEMENTS AND TITLES

Thirty achievements. Naming voice: live-music vernacular, understated, zero cheese — names a touring musician would tolerate on a t-shirt. Tiers: **Standard** (natural play), **Notable** (deliberate skill), **Rare** (mastery or dedication), **Legendary** (the long game). Measurability flags: **[NOW]** = computable from data the engine already produces per run (final metrics, setlist contents, Live Frequency tiers, stars, Daily results — assumes only a persistence layer for achievement state, which is new but purely additive); **[NOW+]** = needs a small engine addition (e.g., per-song momentum history in the report, cross-run counters); **[FUTURE]** = depends on mechanics/data that don't exist yet (new venues, contexts, historical data).

| # | Name | Description | Condition (objective) | Tier | Flag |
|---|---|---|---|---|---|
| 1 | **The Real Thing** | Build a show on nothing but the genuine article. | Complete a show with authenticity = 100 (zero fallback songs, 6+ songs) | Notable | NOW |
| 2 | **Bedrock** | Ten shows built on solid ground. | 10 completed shows with authenticity ≥ 85 | Rare | NOW+ (cross-run counter) |
| 3 | **Nobody Left Early** | Hold the whole room to the last note. | Complete a show (6+ songs) with audienceRetention ≥ 90 | Notable | NOW |
| 4 | **Packed House** | Hold the hardest rooms. | audienceRetention ≥ 80 at Festival Side Stage or Major Theatre | Rare | NOW |
| 5 | **Tide Chart** | Pace a show like the sea. | energyCurveFit ≥ 90 in a completed show | Notable | NOW |
| 6 | **Clean Hands** | A long show, not one pacing foul. | paceDiscipline = 100 in a show of 8+ songs | Rare | NOW |
| 7 | **Somewhere Else Entirely** | Take the room on a real journey. | emotionalJourney ≥ 90 in a completed show | Notable | NOW |
| 8 | **The Turnaround** | Lose the room, then win it back. | Attendance/momentum drops below 40 mid-show, finishes ≥ 70 | Rare | NOW+ (needs momentum history in the report) |
| 9 | **Dug Deep** | Feed the hunters properly. | Play 3+ Rare-or-rarer songs in one show | Notable | NOW |
| 10 | **The Archivist** | Make rarity a way of life. | 25 Rare-or-rarer songs played across all shows | Rare | NOW+ (cross-run counter) |
| 11 | **First Time for Everything** | Play a song that has never been played live. | Play a Mythic song in a completed show | Notable | NOW |
| 12 | **Witness** | Make the impossible routine. | Play Mythic songs in 5 different completed shows | Legendary | NOW+ (cross-run counter) |
| 13 | **Full Catalog** | Tour the whole discography in one night. | diversity ≥ 90 with 8+ songs and 5+ albums represented | Notable | NOW |
| 14 | **Era-Proof** | Breadth as a habit. | 10 shows with 4+ albums represented | Rare | NOW+ (cross-run counter) |
| 15 | **One More** | Earn your first encore. | Complete any show where the encore was earned and played | Standard | NOW |
| 16 | **Exit Through the Roof** | End on the night's high note. | encoreQuality ≥ 85 | Notable | NOW |
| 17 | **Always Wanted** | Never leave without being asked back. | Earn the encore in 10 consecutive completed shows | Legendary | NOW+ (streak counter) |
| 18 | **Off Book** | Finish the tutorial and mean it. | Clear Rehearsal Room | Standard | NOW |
| 19 | **Working Band** | Climb into real rooms. | Clear Local Bar and Small Theatre | Standard | NOW |
| 20 | **Top of the Marquee** | Reach the top of the ladder. | Clear Major Theatre | Notable | NOW |
| 21 | **No Notes** | Perfect a room. | Earn 3★ on any stage | Notable | NOW |
| 22 | **The Whole Ladder** | Leave nothing behind. | Earn 3★ on all five Campaign stages | Legendary | NOW |
| 23 | **Showed Up** | Play your first Daily Challenge. | Complete an Official Attempt | Standard | NOW |
| 24 | **Regular** | Make the Daily a habit. | Official Attempts on 7 consecutive days | Rare | NOW+ (streak counter) |
| 25 | **Same Room, Better Night** | Beat your own history. | Official score exceeds your previous best official score | Standard | NOW+ (personal-best tracking) |
| 26 | **House Favorite** | Master a demanding house. | 3★ Festival Side Stage with rarityExcitement ≥ 70 | Rare | NOW |
| 27 | **Friend of the Floor** | Send every faction home happy. | Complete a show where all five factions end with positive momentum | Rare | NOW+ (per-faction finals in the report) |
| 28 | **Speaks Fluent Hunter** | Win the hardest listeners on their own terms. | deepCut faction ends at its highest momentum band in a Hardcore Crowd Daily | Rare | NOW+ (per-faction finals) |
| 29 | **Open Door Policy** | Turn a room of strangers into a crowd. | firstTimers faction ends at its highest momentum band on a Newcomer Night Daily | Rare | NOW+ (per-faction finals) |
| 30 | **Matinee Idol, Evening Legend** | Master every kind of room there is. | Clear a show in every venue archetype, including future venues (Arena, Historic Venue, Outdoor Amphitheatre, Intimate Club, Festival Main Stage) | Legendary | FUTURE (requires the Section 4 aspirational venues to exist) |

Notes: no achievement rewards obscurity *over* accessibility or vice versa — for every hunter-flavored achievement (#9–12, #28) there is a room-holding or newcomer-flavored counterpart (#3, #4, #27, #29), by design. No achievement is triggerable by fallback-heavy shows where it would be hollow (authenticity conditions guard #1–2; implementations should apply a minimum-authenticity sanity floor of 50 to #5–7 so estimated data can't mint pacing/emotion medals).

---

## 13. HISTORICAL MODE CREATIVE DESIGN

*Future mode. Nothing in this section is implemented, and nothing in it may be implemented until the data-integrity requirements below are met. This section defines the experience and — more importantly — the honesty constraints.*

### The fantasy

BSM already ingests real setlist data via its Setlist.fm-derived Live Intelligence (the same pipeline that powers Live Frequency). Historical Mode points Headliner at a *specific real show that actually happened*: a real date, a real venue name, a real setlist, as recorded in that data. The player steps into the night with today's engine and plays it their way.

### The player experience (six pillars)

1. **Recreate the historical setlist.** Play the documented setlist in its documented order and watch what today's engine makes of it — a study mode: why did this sequence work (or wobble) by Headliner's measures?
2. **Beat the historical result.** Since no real crowd-reaction data exists, "beating history" NEVER means beating the real crowd's real response — it means **beating the engine's score for the documented setlist**. The engine scores the historical order first; the player's re-imagined set competes against that number. Same songs available, same length constraints, your calls.
3. **Change one pivotal song.** A constrained variant: the documented setlist, but the player may swap exactly one song. A study in marginal decisions — which single change moves the engine's score most?
4. **Preserve the era's identity.** Where BSM's own data can scope a Band Spectrum to an era (e.g., albums released by the show's date), the identity target becomes the era's, not the career's — playing a period-faithful set is the challenge. If era-scoping isn't computable from BSM's own data, this pillar ships later, not approximately.
5. **Handle real venue conditions.** Only conditions present in the real data (venue name, city, date, festival vs. own show *if the data says so*) may be surfaced. Everything else — weather, crowd size, incidents — is out unless a verifiable data source provides it. No atmosphere may be invented for a real night.
6. **Compare to history.** Post-show, the player's set and the documented set side by side: songs shared, songs swapped, rarity profile then vs. now, engine score vs. engine score.

### Facts that must be verified from real Setlist.fm-derived data before display

A historical show may only be presented if ALL of the following exist in BSM's own stored data (not fetched-and-guessed, not inferred): the show's **date**; the **venue name and city** as recorded; the **complete documented setlist in order** (shows with partial/ambiguous setlists are excluded from the mode, or explicitly labeled "partial record — not playable as a challenge"); and a **song-by-song match to BSM's library** (a documented song that can't be matched to a library song either excludes the show or is displayed as unplayable-but-listed, never silently dropped, never fuzzily substituted).

### What must never be invented — plainly stated

**No invented crowd reactions and no invented setlist claims are acceptable — only what real data can support.** Concretely banned, forever, regardless of how much better it would feel:

- Any claim about how the real crowd reacted that night ("the crowd went wild when…") — no such data exists in BSM, so no such sentence may exist in the mode.
- Any claim about the band's intent, mood, health, or backstage events.
- Any invented weather, attendance figure, ticket price, or venue detail.
- Any "historical review" written in the voice of a real publication or real critic.
- Filling gaps in a partial setlist with plausible songs.
- Presenting the engine's score of a historical setlist as a judgment of the *actual night*. The framing is always: *this is what Headliner's model makes of this sequence of songs* — a lens, never a verdict on a real evening that real people lived.

### How comparisons must be phrased

Always engine-vs-engine, dated, and attributed to the model — never player-vs-band. Approved shapes:

- "On [date] at [venue], the band played these [N] songs in this order. Headliner's engine scores that sequence [X]. Your set scored [Y]."
- "Your set shared [N] songs with the documented setlist and made [M] different calls."
- Banned shapes: "You outperformed the band," "Your setlist was better than the real one," "The real crowd would have preferred…" — the first two claim superiority over real people doing their real jobs with information we don't have; the third invents a crowd.

### Completion screens

- **Recreation complete:** "That was the documented setlist from [venue], [date] — played through Headliner's model. Score: [X]. This is a reading of the sequence, not a grade on the night: the model hears data; the room heard a band."
- **Beat-the-benchmark result (player wins):** "Your set: [Y]. The documented sequence: [X], by the same measure. Different night, different calls — the documented set remains the one that actually happened, and that's a category your score doesn't compete in."
- **Beat-the-benchmark result (history 'wins'):** "The documented sequence scored [X] to your [Y] — whatever they knew that night, the model can measure some of it. Study the order; the answer's in there."
- **One-song-swap result:** "One change: [documented song] out, [player's song] in. The model's score moved from [X] to [Y]. Small hinges, big doors."

### Educational value (the mode's real purpose)

Historical Mode is BSM's analysis platform pointed at live history: it teaches *why documented setlists are shaped the way they are* — how real sequences manage energy, where rarities were actually risked, how era catalogs constrained the possible. The tone is a museum with the lights on, not a leaderboard against ghosts: curiosity, respect, and the repeated honest disclaimer that the model measures songs-in-sequence, not nights-in-history.

---

## 14. VISUAL PRESENTATION PRINCIPLES

Headliner lives on BSM's dark game theme (bg-gray-950 family). The governing principle: **hierarchy and emotional readability over dashboards** — a player mid-show should absorb the state of the room in one glance, the way a performer does, and only then read numbers if they want them. Principles, per surface:

- **Crowd emotion:** One primary, glanceable representation of the whole room (a single crowd-mood presence — e.g., a warmth gradient or crowd-density silhouette), with the five factions as secondary detail beneath it. The room first, the segments second. Faction detail expands on demand; it is never five equal meters shouting side by side by default.
- **Attendance loss:** Show people, not percentages — a thinning room reads emotionally; a decrementing number reads clinically. Walkouts should be visible as departure (a fading edge of the crowd), paired with the number for precision. Loss is depicted as calm fact, never with alarm-red flashing (see Section 15).
- **Spectrum balance:** The Band Identity Target and the Current Concert Spectrum share one visual so drift is *seen* as distance, not computed by the player. Prefer outline-vs-outline or axis-by-axis offset bars over stacked filled radar shapes — **two filled radar charts overlapping are unreadable** and are explicitly banned. Label axes in plain words (the six Spectrum axes), never abbreviations.
- **Candidate trade-offs:** Each candidate song answers three glanceable questions — what it does to energy, whom it pleases, what it does to identity drift — via consistent iconography, before any numbers. Numbers appear on hover/expand. A candidate card is a suggestion, not a spreadsheet row; five candidates should be comparable in under five seconds.
- **Venue mood:** Each venue archetype owns a subtle, persistent tonal treatment (accent hue, header art, texture — folding-chair plainness for Rehearsal Room up through marquee glow for Major Theatre) so progression up the ladder is *felt* ambiently. Venue mood never competes with show-state information; it is background, in both senses.
- **Faction reactions:** Reactions surface as brief, attributable moments — a faction's icon plus its one-line read (Section 8), appearing and settling, not as five oscillating gauges. A strong reaction is bigger and slower to fade than a mild one: size and dwell time carry intensity, so meaning survives color-blindness and motion reduction.
- **Encore tension:** The encore threshold is a visible line the crowd's energy approaches — the question "will they demand more?" should be legible as a gap closing. When earned, the moment gets the night's one deliberate dramatic beat (houselights pause, held breath), because it's the game's realest cliffhanger. One such beat per show; scarcity is what makes it land.
- **Campaign progression:** The ladder is drawn as venues, not as a level list — five rooms of visibly increasing scale, stars resting under each. Locked stages appear as real places with stated bookings requirements (Section 11), never as grayed padlocks.
- **Daily status:** One compact block answers, in order: played today? official score? time to reset? Leaderboard rank is one line, not a wall. Yesterday exists as a quiet link, not a competing panel.
- **Final review (Show Report):** The review text (Section 7) leads — full width, comfortable reading size, styled like editorial copy, because it is the payoff. Metrics follow as a supporting table; highlights sit between them. The emotional order is: how the night felt → what stood out → the numbers, and layout must enforce it.

**Explicitly avoided, everywhere:** more than three always-visible meters during a show; overlapping filled radar charts; any color whose meaning isn't taught on first use and reinforced by a non-color cue; flashing/pulsing arcade effects, screen shake, and score-ticker spam; celebratory particle storms that outshine the information they celebrate.

---

## 15. ACCESSIBILITY AND EMOTIONAL SAFETY

These are requirements, not aspirations. Player-facing features that can't meet them aren't done (per the project's definition of done).

**Accessibility:**
- **Reduced motion:** Every animation — crowd swell, reaction settle, encore beat — has a reduced-motion variant (opacity/position snap instead of movement), honoring the platform's reduced-motion preference automatically. No information may exist only in motion.
- **Color-independent signals:** Every color-coded state (faction identity, positive/negative reads, drift direction, star tiers) carries a redundant channel: icon, label, position, or weight. The game must be fully playable in grayscale.
- **Readable reaction text:** In-show log lines meet body-text size minimums (no "flavor text = tiny text"), persist long enough to be read twice, and accumulate in a reviewable log — nothing important is ephemeral. Contrast meets WCAG AA on the dark theme.
- **Touch-friendly interactions:** Every in-show decision (calling a song, the encore call, dismissing a tutorial) works with single taps on comfortably sized targets — no hover-only information, no drag-only mechanics, no timing-based inputs. Desktop-first, but a phone on a couch is a legitimate stage.

**Emotional safety:**
- **Never shame failure.** A failed run is described by what the room needed, never by what the player lacks. Banned vocabulary in failure copy: "you failed to," "poor choice," "mistake" as a noun aimed at the player, mockery of any kind. Every failure state includes a forward path (Section 11 models this).
- **No inferior factions.** No copy, achievement, or visual treatment may frame any faction as lesser — not the First-Timers for knowing nothing, not the Casual Listeners for wanting choruses, not the Deep-Cut Hunters for wanting the opposite. The factions are five loves, not a taste hierarchy (Section 3's house rule, restated here as a safety rule because it is one).
- **Obscurity is not virtue; popularity is not sin.** Rare picks are exciting because they're rare, and the game says so — it never says or implies they're *better music*. Accessible picks hold rooms together, and the game says so — it never frames them as compromise, "pandering," or "the easy way." Any copy draft containing "sellout," "normie," "pretentious," or their cousins is rejected on sight.
- **Failure is tuition, and the game says so out loud.** The recurring register for bad nights (CLOSE-10's "rough nights are tuition") is the mode-wide truth: every rough show produces a legible reason and a next move. A player should end their worst night curious, not embarrassed.

---

## 16. IMPLEMENTATION HANDOFF

For the engineer implementing any part of this bible. Everything above is copy and rules; nothing requires runtime text generation — every surface is deterministic template selection over metrics the engine already computes (or small, named additions below).

### A. Ready to implement using existing metrics (no engine changes)

- **Section 7 review system** — all template pools except ENC-09 key entirely to the ten shipped metrics, `overallScore`, encore state, and `usedFallbackData`/`fallbackSongCount`, all already in the completed-show report. This directly replaces the current hardcoded review-builder sentences.
- **Section 2 vocabulary normalization** across shipped UI strings (rename-level copy edits only).
- **Section 6 Campaign stage copy** — the stage config already carries name/description/context fields; this adds the richer field set (victory/star/unlock/failure/guidance text) as static per-stage copy.
- **Section 9 Daily Challenge copy** — briefing, warnings, verified-result, countdown, share templates: all use existing Daily fields (`finalAttendance`, `satisfaction`, official/practice state, context name, reset time).
- **Sections 10 and 11 tutorial + state copy** — static strings plus values already available at each surface (recovered counts, durations, star counts are all checked today by eligibility code).
- **Achievements flagged [NOW]** (Section 12) — conditions computable from a single run's report + setlist contents; needs only additive persistence for earned-achievement state.

### B. Requires small engine additions

- **Per-song / per-faction exposure for the Live Reaction Log (Section 8):** the engine computes per-faction reactions and momentum internally; the log needs those per-song deltas surfaced in the in-show payload, plus the derived flags (consecutive-decline counts, drift direction, penalty-applied) that triggers key on.
- **Momentum history in the Show Report:** enables comeback detection (achievement #8), ENC-09 (peak-position-in-set), and per-faction final standings (#27–29).
- **Cross-run counters / streaks / personal bests:** achievements #2, #10, #12, #14, #17, #24, #25 — pure additive persistence keyed to completed runs.
- **Deterministic variant selection:** a seeded pick (e.g., by run id) over eligible template variants, so identical results render identical text.
- **Context-scoped scoring emphasis:** Section 5 contexts marked [NEW MECHANICS] that only need an objective or presentation emphasis (Album Anniversary's album-targeting, Benefit Concert's frame) rather than new simulation.

### C. Requires new canonical data

- **Era-scoped Band Spectrum** (Historical Mode pillar 4): identity targets computed from albums-released-by-date — derivable from BSM's own album data if release dates are reliably present; otherwise this is a data-quality project first.
- **New venue archetypes** (Section 4's five 🔮 venues): real venue configs (capacity, factionShare, show rules) — copy is written; the configs and any spectrum-affinity mechanic are new.
- **Contexts needing band/tour state:** Hometown Show, New Album Tour, Final Night of Tour, Exhausted Band — each names its missing data/mechanic in Section 5; none may ship with invented stand-in data.

### D. Requires future historical data

- **All of Section 13.** Gated on verified Setlist.fm-derived records meeting the completeness bar defined there (date, venue, complete ordered setlist, full song matching). The honesty constraints in 13 are load-bearing requirements, not copy suggestions.
- **Mid-show event contexts** (Rain-Soaked Festival, Technical Delay, Unexpected Encore) also sit here-adjacent: they need an event system that doesn't exist, and their copy ships only with it.

### E. Pure presentation/copy only

- Sections 1 (identity), 14 (visual principles), 15 (accessibility/safety) — design law, no data dependencies.
- Section 3 faction personality prose and Section 4/5 venue/context copy for shipped surfaces — static strings behind existing conditions.

### Illustrative shapes

*Illustrative only — field inventories for template records, NOT production code, not tied to any file, class, or actual type system. Real implementations will differ; what matters is that every template carries an id, explicit metric conditions, deterministic variants, and declared metric dependencies.*

```
// ReviewTemplate (Section 7) — one slotted sentence in the post-show review
{
  id: "IDEN-06",
  slot: "identity",                       // opening | identity | crowd | pacing | encore | closing
  conditions: [                            // ALL must hold; thresholds from Section 7.0 bands
    { metric: "spectrumMatch", min: 55, max: 69 },
    { metric: "authenticity", max: 54 }
  ],
  forbiddenWith: ["CLOSE-08"],            // contradiction guards from 7.8
  text: "The shape of the band was there, but…",
  metricDependencies: ["spectrumMatch", "authenticity"]
}

// ReactionTemplate (Section 8 / Section 3.6) — one in-show log line
{
  id: "REACT-deep-cut-surprise-3",
  trigger: {                               // engine-side flags, per song
    kind: "rarityEvent",
    minTier: "Mythic"                      // Live Frequency tiers, verbatim
  },
  faction: "deepCut" | null,               // null = whole-room line
  variants: ["Never played live — until fifteen seconds ago."],
  priority: 2,                             // walkout-risk=1 > faction spike=2 > pacing=3 > spectrum=4
  maxPerShow: 1
}

// VenueCopy (Section 4) — the seven writing fields per venue
{
  venueKey: "small_theatre",              // Campaign StageKey or future archetype key
  status: "shipped" | "aspirational",
  openingDescription: "…", crowdExpectation: "…", strategicWarning: "…",
  atmosphere: "…", successMessage: "…", failureMessage: "…", threeStarMessage: "…"
}

// ContextCopy (Section 5)
{
  contextKey: "deep_cut_night",
  supportable: "today" | "new-mechanics",
  neededMechanics: ["…"],                 // empty when supportable today
  intro: "…", audienceExpectation: "…", scoringEmphasis: ["rarityExcitement", "authenticity"],
  risks: "…", opportunities: "…", finalReviewFlavor: "…"
}

// CampaignStageCopy (Section 6) — layered onto the existing stage config, not replacing it
{
  stageKey: "local_bar",
  titleTagline: "…", intro: "…", venueFantasy: "…", audienceFeeling: "…",
  whyItMatters: "…", playerLearns: "…", victoryText: "…",
  starText: { one: "…", two: "…", three: "…" },
  unlockText: "…", failureText: "…",
  recoverGuidance: "…"                    // with [X]/[Y] slots for real recovered counts/duration
}

// TutorialMessage (Section 10)
{
  id: "tut-authenticity-vs-satisfaction",
  surface: "showReport",                  // where it first appears
  text: "…",                              // 1–2 sentences, jargon-free
  dismissible: true, showOnce: true, reopenable: true
}

// AchievementDefinition (Section 12)
{
  id: "the-turnaround",
  name: "The Turnaround",
  description: "Lose the room, then win it back.",
  tier: "rare",                           // standard | notable | rare | legendary
  measurable: "now" | "now-plus" | "future",
  conditions: [
    { metric: "momentumHistoryMin", max: 39 },   // needs Section 16.B momentum history
    { metric: "audienceRetention", min: 70 }
  ],
  metricDependencies: ["audienceRetention", "momentumHistory"]
}
```

### Final note to the implementer

The single most important property of this system is the one the engine already has: **every sentence is explainable.** If a player asks "why did the review say that?", the answer must always be a metric and a threshold. Protect that property over any individual line of copy in this document — cut a sentence before you blur a condition.

---

*End of creative bible. Sections 1–3 are binding voice law; Sections 4–12 are binding copy plus clearly flagged aspirational material; Section 13 is a future-mode design gated on data integrity; Sections 14–16 are design and engineering law for everything above.*
