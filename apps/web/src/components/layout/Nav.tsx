import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface NavItem {
  to: string;
  label: string;
  newTab?: boolean;
}

interface NavSection {
  heading: string;
  links: NavItem[];
}

const mainSections: NavSection[] = [
  {
    heading: 'Core',
    links: [
      { to: '/dashboard',   label: 'Dashboard' },
      { to: '/library',     label: 'Library' },
      { to: '/spectrum',    label: 'Spectrum' },
      { to: '/analysis',    label: 'Analysis' },
      { to: '/compare',     label: 'Compare' },
    ],
  },
  {
    heading: 'Content',
    links: [
      { to: '/imports',        label: 'Imports' },
      { to: '/lyrics-builder', label: 'Lyrics Builder' },
      { to: '/discography',    label: 'Discography' },
      { to: '/song-spectrum',  label: 'Song Spectrum' },
    ],
  },
  {
    heading: 'Visualizations',
    links: [
      { to: '/cloud',              label: 'Song Cloud' },
      { to: '/word-cloud',         label: 'Word Cloud' },
      { to: '/song-nodes',         label: 'Song Nodes' },
      { to: '/cinema',             label: 'Cinema Mode' },
      { to: '/cinema/lyrics',      label: 'Lyrics Universe' },
      { to: '/cinema/lyrics-flow', label: 'Lyrics Flow' },
      { to: '/spectrum-studio',    label: 'Spectrum Studio' },
    ],
  },
  {
    heading: 'Community',
    links: [
      { to: '/social',         label: 'Social' },
      { to: '/social-planner', label: 'Content Planner' },
      { to: '/trivia',         label: 'Trivia' },
      { to: '/settings',       label: 'Settings' },
    ],
  },
];

const adminSections: NavSection[] = [
  {
    heading: 'Batch & Analysis',
    links: [
      { to: '/admin/ai-batch',      label: 'AI Batch Runner' },
      { to: '/admin/data-health',   label: 'Data Health' },
      { to: '/admin/lyrics-batch',  label: 'Lyrics Batch Fetch' },
      { to: '/admin/missing-lyrics',label: 'Missing Lyrics' },
      { to: '/admin/missing-artwork',label: 'Missing Artwork' },
    ],
  },
  {
    heading: 'Content Admin',
    links: [
      { to: '/admin/bootlegs',       label: 'Bootleg Importer' },
      { to: '/admin/knowledge',      label: 'AI Knowledge Feed' },
      { to: '/admin/data-grid',      label: 'Data Grid' },
      { to: '/admin/game',           label: 'Album Art Quiz' },
    ],
  },
  {
    heading: 'Users & Site',
    links: [
      { to: '/admin/users',          label: 'User Moderation' },
      { to: '/admin/contributions',  label: 'Contributions' },
      { to: '/admin/hub',            label: '⚡ Admin Hub' },
      { to: '/admin/db-health',      label: 'DB Health' },
      { to: '/admin/db',             label: 'DB Migrations' },
      { to: '/settings?tab=icons',  label: 'App Icons & Branding' },
      { to: '/view',                label: 'Public Site ↗', newTab: true },
    ],
  },
];

function NavSectionGroup({ sections, dimLinks }: { sections: NavSection[]; dimLinks?: boolean }) {
  return (
    <>
      {sections.map(({ heading, links }) => (
        <li key={heading}>
          <p className="px-4 pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-surface-600 select-none">
            {heading}
          </p>
          <ul>
            {links.map(({ to, label, newTab }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  target={newTab ? '_blank' : undefined}
                  rel={newTab ? 'noopener noreferrer' : undefined}
                  className={({ isActive }) =>
                    `block px-4 py-1.5 text-sm transition-colors ${
                      isActive && !newTab
                        ? 'bg-surface-800 text-white font-medium'
                        : dimLinks
                          ? 'text-surface-400 hover:bg-surface-800 hover:text-white'
                          : 'text-surface-200 hover:bg-surface-800 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </>
  );
}

export default function Nav({ onClose }: { onClose?: () => void }) {
  const { user, login, logout } = useAuth();

  return (
    <nav className="w-52 shrink-0 bg-surface-900 text-white flex flex-col h-full min-h-screen overflow-hidden">
      <div className="px-4 py-5 border-b border-surface-800 flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-surface-200">
            Band Spectrum
          </span>
          <p className="text-xs text-surface-700 mt-0.5">Mapper</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden text-surface-500 hover:text-white text-lg leading-none mt-0.5"
            aria-label="Close menu"
          >
            ✕
          </button>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto py-2 space-y-0" onClick={onClose}>
        <NavSectionGroup sections={mainSections} />

        {user?.isAdmin && (
          <>
            <li>
              <p className="px-4 pt-4 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-surface-500 select-none border-t border-surface-800 mt-2">
                Admin
              </p>
            </li>
            <NavSectionGroup sections={adminSections} dimLinks />
          </>
        )}
      </ul>

      {/* Auth section at sidebar bottom */}
      <div className="border-t border-surface-800 px-4 py-4">
        {user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name ?? user.email}
                  className="w-6 h-6 rounded-full shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-surface-700 shrink-0 flex items-center justify-center text-xs">
                  {(user.name ?? user.email)[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <span className="text-xs text-surface-200 truncate block">
                  {user.name ?? user.email}
                </span>
                {user.isAdmin && (
                  <span className="text-xs text-surface-500">Admin</span>
                )}
              </div>
            </div>
            <button
              className="text-xs text-surface-500 hover:text-surface-200 transition-colors"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            className="w-full text-xs text-surface-200 bg-surface-800 hover:bg-surface-700 transition-colors rounded px-3 py-2 text-center"
            onClick={login}
          >
            Sign in with Google
          </button>
        )}
      </div>
    </nav>
  );
}
