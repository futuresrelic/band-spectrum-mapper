import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SCORE_AXES, AXIS_INFO } from '@band-spectrum-mapper/shared';
import { AxisTag } from '../components/AxisTag';

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-surface-200">
      <button
        className="w-full flex items-start justify-between text-left py-4 gap-4 font-medium text-surface-900 hover:text-surface-700 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{q}</span>
        <span className="text-surface-400 flex-shrink-0 text-lg leading-none mt-0.5">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="pb-5 text-sm text-surface-700 leading-relaxed space-y-3">{children}</div>
      )}
    </div>
  );
}

function FaqGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-1">{title}</h2>
      <div className="divide-y divide-surface-200 border-t border-surface-200">{children}</div>
    </section>
  );
}


export default function HelpPage() {
  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* Nav */}
        <nav className="flex items-center gap-3 text-sm mb-10 text-surface-600">
          <Link to="/" className="hover:text-surface-900 transition-colors">Home</Link>
          <span className="text-surface-300">·</span>
          <Link to="/view" className="hover:text-surface-900 transition-colors">Library</Link>
          <span className="text-surface-300">·</span>
          <Link to="/legal" className="hover:text-surface-900 transition-colors">Legal</Link>
        </nav>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Help &amp; FAQ</h1>
        <p className="text-surface-600 mb-12">Everything you need to know about how Band Spectrum Mapper works.</p>

        {/* Quick links */}
        <div className="card mb-10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-3">Jump to</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {['Overview', 'Spectrum Scoring', 'AI Analysis', 'Comments & Community', 'Sharing', 'Account & Access'].map((s) => (
              <a
                key={s}
                href={`#${s.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                className="text-indigo-600 hover:underline"
              >
                {s}
              </a>
            ))}
          </div>
        </div>

        <div id="overview">
          <FaqGroup title="Overview">
            <FAQ q="What is Band Spectrum Mapper?">
              <p>
                A fan-built tool for deep music analysis. You can browse a library of bands, albums,
                and songs; read AI-generated lyrical and contextual analysis; explore Wikipedia-sourced
                research about songs and their history; rate songs across six spectrum axes; join
                discussions about what songs mean; and share analysis cards to social media.
              </p>
              <p>
                It's built for people who listen to albums front-to-back, read lyrics while listening,
                and argue passionately about what songs really mean.
              </p>
            </FAQ>

            <FAQ q="Who is this for?">
              <p>
                Music obsessives. If you've ever thought there should be a better way to catalog,
                analyse, and discuss your music collection — especially for bands with complex,
                layered songwriting like Tool, A Perfect Circle, Puscifer, Radiohead, or any other
                artist with rich lyrical and sonic depth — this was built for you.
              </p>
              <p>
                The app is band-agnostic. Any artist can be added to the library.
              </p>
            </FAQ>

            <FAQ q="Do I need an account?">
              <p>
                <strong>No.</strong> The entire library — all songs, lyrics, spectrum scores, AI
                analysis, research, and discussion — is publicly readable without logging in.
                Visit{' '}
                <Link to="/view" className="text-indigo-600 hover:underline">the library</Link>{' '}
                and start exploring immediately.
              </p>
              <p>
                You need to sign in (Google OAuth) to post comments and add your personal spectrum
                ratings. Admins have additional access to add bands, albums, and songs, and to
                regenerate AI analysis.
              </p>
            </FAQ>

            <FAQ q="Where does the library data come from?">
              <p>
                The library (bands, albums, songs, lyrics) is managed by the app administrator.
                Lyrics are entered manually or imported from files. The tool is designed to be
                band-agnostic — any band can be added.
              </p>
            </FAQ>
          </FaqGroup>
        </div>

        <div id="spectrum-scoring">
          <FaqGroup title="Spectrum Scoring">
            <FAQ q="What are the six spectrum axes?">
              <p>Each song is rated on a 0–10 scale across six dimensions:</p>
              <div className="space-y-3 mt-2">
                {SCORE_AXES.map((axis) => (
                  <div key={axis} className="flex gap-3 items-start">
                    <AxisTag axis={axis} size="sm" />
                    <span className="text-surface-500">—</span>
                    <span>0: {AXIS_INFO[axis].lo} → 10: {AXIS_INFO[axis].hi}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3">
                These axes are displayed as a radar chart so you can see a song's "shape" at a glance.
              </p>
            </FAQ>

            <FAQ q="What's the difference between Core, Community, AI, and My scores?">
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Core</strong> — manually set by the app administrator. The "official" reference score for the library.</li>
                <li><strong>Community</strong> — the average across all eligible signed-in users who have rated the song.</li>
                <li><strong>AI</strong> — generated by the AI based on the lyrics. A third independent perspective.</li>
                <li><strong>Mine</strong> — your personal scores, visible only to you on the spectrum and rating pages.</li>
              </ul>
              <p>
                All four are shown on the radar chart with different colours so you can compare
                perspectives simultaneously.
              </p>
            </FAQ>

            <FAQ q="How do I add my own scores?">
              <p>
                Sign in, then go to <Link to="/my/rate" className="text-indigo-600 hover:underline">My Ratings</Link>.
                Select a band, and you can score each song across all six axes using the sliders.
                Your scores feed into the Community average and are shown on your personal radar charts.
              </p>
            </FAQ>
          </FaqGroup>
        </div>

        <div id="ai-analysis">
          <FaqGroup title="AI Analysis">
            <FAQ q="How does the AI analysis work?">
              <p>There are three independent AI layers per song, each with its own cache:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  <strong>Lyric Analysis</strong> — reads the primary lyrics and identifies themes,
                  emotional register, conceptual depth, and notable craft elements.
                </li>
                <li>
                  <strong>Song Research</strong> — searches Wikipedia for song, album, and artist pages;
                  summarises the historical and biographical context; generates a musical style profile
                  covering genre, instrumentation, production approach, and sonic texture.
                </li>
                <li>
                  <strong>Deep Analysis</strong> — a comprehensive synthesis pulling together: the song
                  title, lyrics, research, prior lyric analysis, all spectrum scores (core, AI,
                  community), and community discussion comments. Produces five named sections (see below).
                </li>
              </ol>
              <p>
                All AI is powered by OpenAI GPT-4o Mini. Analysis is generated once and cached —
                the first load triggers the AI call, subsequent loads are instant. Admins can
                regenerate any analysis layer at any time.
              </p>
            </FAQ>

            <FAQ q="What are the five Deep Analysis sections?">
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Title Significance</strong> — what the song title means and why it matters</li>
                <li><strong>Historical Context</strong> — where the song sits in the band's journey and the era it was made</li>
                <li><strong>Lyrical Interpretation</strong> — what the lyrics actually mean beneath the surface</li>
                <li><strong>Thematic Synthesis</strong> — how all the threads converge into a unified artistic statement</li>
                <li><strong>Overall Narrative</strong> — the complete picture: what the song is ultimately saying</li>
              </ul>
            </FAQ>

            <FAQ q="What is the 'title as key' concept?">
              <p>
                In progressive and art rock, song titles often state the central concept that the
                lyrics orbit without ever uttering directly. The title names what the song is about;
                the lyrics enact it through imagery alone.
              </p>
              <p>
                The classic example is <strong>"Schism"</strong> by Tool — the word "schism" never
                appears in the lyrics, yet the entire song is built from imagery that enacts division.
                The Deep Analysis prompt specifically instructs the AI to apply this lens to every song.
              </p>
              <p>
                This means the Title Significance section is often the most illuminating part of the
                analysis, especially for bands with high conceptual depth.
              </p>
            </FAQ>

            <FAQ q="Is the AI always right?">
              <p>
                No. The AI produces informed, rigorous critical opinion — but it is fallible. It may
                misread lyrics, have gaps in Wikipedia coverage for obscure songs, or reach
                interpretations you disagree with. That's part of what the comment section is for.
              </p>
              <p>
                Treat the AI analysis as one very well-read fan's take, not as definitive truth.
                Your interpretation is equally valid.
              </p>
            </FAQ>

            <FAQ q="Why do some songs show 'No research available'?">
              <p>
                The research layer searches Wikipedia for the song, album, and artist. Not all songs
                have dedicated Wikipedia articles, especially deep cuts. In those cases, the AI draws
                on its training knowledge and notes the gap.
              </p>
              <p>
                If a song shows "No research available," it means neither the song nor the album page
                was found on Wikipedia. The band page is almost always found.
              </p>
            </FAQ>
          </FaqGroup>
        </div>

        <div id="comments-community">
          <FaqGroup title="Comments & Community">
            <FAQ q="How do comments work?">
              <p>
                Every song has a Discussion section visible to all users, including guests. Anyone
                can read the comments. To post, you need to sign in.
              </p>
              <p>
                Comments are for sharing your interpretation of the song — what you think it means,
                what the imagery evokes, connections to the band's other work, anything that adds to
                the conversation.
              </p>
            </FAQ>

            <FAQ q="How do comments affect the AI analysis?">
              <p>
                When the Deep Analysis is regenerated, the AI reads the 30 most recent comments and
                incorporates compelling community insights into the Thematic Synthesis and Overall
                Narrative sections.
              </p>
              <p>
                This means the analysis gets richer as discussion grows. A song with 20 thoughtful
                comments will produce a noticeably deeper synthesis than the same song without any
                discussion.
              </p>
            </FAQ>

            <FAQ q="Can I delete a comment?">
              <p>
                You can delete your own comments. The app admin can delete any comment. To delete
                a comment, look for the ✕ button that appears to the right of your comments when
                you are signed in.
              </p>
            </FAQ>

            <FAQ q="Who can see my ratings?">
              <p>
                Your individual axis scores are visible only to you on the "Mine" tab of the spectrum
                and rating pages. What is public is the community average — a blend of all eligible
                raters with personal scores anonymised.
              </p>
            </FAQ>
          </FaqGroup>
        </div>

        <div id="sharing">
          <FaqGroup title="Sharing">
            <FAQ q="How do I share a song's analysis?">
              <p>
                Every song has a dedicated share page. On any song page or in the public library,
                look for the <strong>Share ↗</strong> button or link. This opens a standalone card
                showing the song's spectrum profile, AI analysis highlights, and a shareable URL.
              </p>
              <p>
                From the share page you can copy the direct link or share to X (Twitter).
                The page also works well as a screenshot for Instagram or other platforms.
              </p>
            </FAQ>

            <FAQ q="Will shared links show a preview on social media?">
              <p>
                Share links work as direct URLs — the page loads and displays correctly for anyone
                who clicks the link. Full dynamic Open Graph preview images (the cards that appear
                in Twitter/Instagram feeds before clicking) require server-side rendering, which
                is not currently implemented.
              </p>
              <p>
                The best approach for rich social posts is to screenshot the share page card and
                attach it as an image, then paste the link in the post.
              </p>
            </FAQ>
          </FaqGroup>
        </div>

        <div id="account-access">
          <FaqGroup title="Account & Access">
            <FAQ q="How do I sign in?">
              <p>
                Sign in with your Google account using the Sign In button in the header or on the
                landing page. No password is required — just Google OAuth.
              </p>
            </FAQ>

            <FAQ q="What can I do without an account?">
              <p>
                Everything read-only: browse the full library, read all AI analysis, view all
                spectrum scores (core, community, AI), read lyrics, and read all comments.
              </p>
            </FAQ>

            <FAQ q="What can I do with an account?">
              <p>
                Submit your own spectrum scores across all six axes, post comments in song
                discussion sections, and access the share page with your name attributed to comments.
              </p>
            </FAQ>

            <FAQ q="Is this affiliated with any band or label?">
              <p>
                No. Band Spectrum Mapper is a completely independent fan project. It is not
                affiliated with, endorsed by, or sponsored by any artist, band, record label,
                or management company. See the{' '}
                <Link to="/legal" className="text-indigo-600 hover:underline">Legal page</Link>{' '}
                for full details.
              </p>
            </FAQ>

            <FAQ q="How do I report a problem or give feedback?">
              <p>
                This is a personal project — there's no formal support channel. If something is
                broken or you have a suggestion, the best approach is to post a comment on a
                relevant song (the admin reads them all) or raise an issue on the project's
                GitHub repository if it is publicly hosted.
              </p>
            </FAQ>
          </FaqGroup>
        </div>

        {/* Quick axis reference */}
        <div className="mt-12 card">
          <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-4">
            Quick Reference — The Six Axes
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SCORE_AXES.map((axis) => (
              <div key={axis} className="text-xs">
                <AxisTag axis={axis} size="sm" />
                <p className="text-surface-500 leading-tight mt-0.5 ml-3.5">0–10 · {AXIS_INFO[axis].lo}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4 mt-10 text-sm">
          <Link to="/" className="text-indigo-600 hover:underline">← Home</Link>
          <Link to="/legal" className="text-indigo-600 hover:underline">Legal Notice →</Link>
        </div>
      </div>
    </div>
  );
}
