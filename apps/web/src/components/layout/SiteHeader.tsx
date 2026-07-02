import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface SiteHeaderProps {
  theme?: 'dark' | 'light';
  /** Optional active section for highlighted nav link */
  active?: 'discover' | 'library' | 'explore' | 'cinema' | 'games' | 'leaderboard' | 'playlist' | 'wiki';
}

const NAV = [
  { label: 'Discover',    to: '/discover'    },
  { label: 'Library',     to: '/view'        },
  { label: 'Explore',     to: '/explore'     },
  { label: 'Cinema',      to: '/cinema'      },
  { label: 'Games',       to: '/games'       },
  { label: 'Leaderboard', to: '/leaderboard' },
  { label: 'Playlist',    to: '/playlist'    },
  { label: 'Wiki',        to: '/wiki'        },
] as const;

export default function SiteHeader({ theme = 'dark', active }: SiteHeaderProps) {
  const { user } = useAuth();
  const isDark = theme === 'dark';

  return (
    <header
      className={`sticky top-0 z-20 backdrop-blur ${
        isDark
          ? 'bg-gray-950/95 border-b border-gray-800'
          : 'bg-white/95 border-b border-surface-200'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-4 min-w-0">
        {/* Logo — abbreviated on xs, full name on sm+ */}
        <Link
          to="/landing"
          className={`text-sm font-bold tracking-tight shrink-0 transition-colors ${
            isDark ? 'text-white hover:text-gray-300' : 'text-surface-900 hover:text-surface-600'
          }`}
        >
          <span className="hidden sm:inline">Band Spectrum Mapper</span>
          <span className="sm:hidden font-black">BSM</span>
        </Link>

        {/* Nav — scrollable on mobile so items never break the viewport */}
        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto min-w-0 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
          {NAV.map(({ label, to }) => {
            const isActive = active === label.toLowerCase();
            return (
              <Link
                key={to}
                to={to}
                className={`px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? isDark
                      ? 'bg-white/10 text-white font-medium'
                      : 'bg-surface-100 text-surface-900 font-medium'
                    : isDark
                    ? 'text-gray-400 hover:text-white hover:bg-white/5'
                    : 'text-surface-600 hover:text-surface-900 hover:bg-surface-50'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User section — name hidden on mobile, just the avatar */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <Link
              to="/my/profile"
              className="flex items-center gap-2 group"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-full ring-2 ring-transparent group-hover:ring-indigo-500 transition-all"
                />
              ) : (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-transparent group-hover:ring-indigo-500 transition-all ${
                  isDark ? 'bg-gray-700 text-gray-300' : 'bg-surface-200 text-surface-700'
                }`}>
                  {(user.username ?? user.name ?? user.email)[0]?.toUpperCase()}
                </div>
              )}
              <span className={`text-sm max-w-[120px] truncate transition-colors hidden sm:block ${
                isDark
                  ? 'text-gray-300 group-hover:text-white'
                  : 'text-surface-600 group-hover:text-surface-900'
              }`}>
                {user.username ?? user.name ?? 'Profile'}
              </span>
            </Link>
          ) : (
            <a
              href="/api/auth/google"
              className={`text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 rounded-lg transition-colors ${
                isDark
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              Sign In
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
