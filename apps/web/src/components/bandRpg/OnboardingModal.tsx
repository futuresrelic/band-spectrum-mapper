import { useState } from 'react';

const STORAGE_KEY = 'bsm_rpg_onboarded_v1';

interface Slide {
  icon: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: '🗺️',
    title: 'Welcome to Band RPG',
    body: 'Band RPG is a music-themed adventure game where you explore levels, talk to characters, solve puzzles, and uncover the story of legendary bands and their music.',
  },
  {
    icon: '📦',
    title: 'Adventures',
    body: 'Adventures are self-contained storylines — like chapters of a game. Each adventure has its own levels, characters, quests, and story. Start a new one or continue where you left off.',
  },
  {
    icon: '🎵',
    title: 'Song Recovery',
    body: 'As you explore, you can collect songs, albums, and musical artifacts. These count toward your curator score and unlock new storylines tied to real-world music history.',
  },
  {
    icon: '🏆',
    title: 'Curator Progression',
    body: 'Your curator level grows as you complete quests, collect items, and discover content. Higher curator levels unlock new adventures, badges, and community features.',
  },
  {
    icon: '🎪',
    title: 'Concerts, Festivals & Tours',
    body: 'Build setlists, book concerts, organise festivals, and run tours. These community-driven events let you collaborate with other curators and compete on the leaderboard.',
  },
];

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore storage errors
  }
}

interface Props {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: Props) {
  const [slide, setSlide] = useState(0);

  function handleClose() {
    markOnboardingComplete();
    onClose();
  }

  function handleNext() {
    if (slide < SLIDES.length - 1) {
      setSlide(s => s + 1);
    } else {
      handleClose();
    }
  }

  const current = SLIDES[slide]!;
  const isLast = slide === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-indigo-800/60 text-white"
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)' }}
      >
        {/* Skip */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/70 text-sm transition-colors"
        >
          Skip
        </button>

        {/* Content */}
        <div className="px-8 pt-10 pb-6 text-center">
          <div className="text-5xl mb-4">{current.icon}</div>
          <h2 className="text-xl font-bold text-white mb-3">{current.title}</h2>
          <p className="text-indigo-200 text-sm leading-relaxed">{current.body}</p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === slide ? 'bg-indigo-400 w-4' : 'bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="px-8 pb-8 flex gap-3">
          {slide > 0 && (
            <button
              onClick={() => setSlide(s => s - 1)}
              className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/60 hover:text-white hover:border-white/40 text-sm transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
          >
            {isLast ? "Let's Play!" : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
