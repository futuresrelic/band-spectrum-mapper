import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const links = [
  { to: '/dashboard',   label: 'Dashboard' },
  { to: '/library',     label: 'Library' },
  { to: '/spectrum',    label: 'Spectrum' },
  { to: '/analysis',    label: 'Analysis' },
  { to: '/compare',     label: 'Compare' },
  { to: '/imports',     label: 'Imports' },
  { to: '/discography', label: 'Discography' },
  { to: '/settings',    label: 'Settings' },
];

const adminLinks = [
  { to: '/admin/users', label: 'User Moderation' },
];

export default function Nav() {
  const { user, login, logout } = useAuth();

  return (
    <nav className="w-52 shrink-0 bg-surface-900 text-white flex flex-col min-h-screen">
      <div className="px-4 py-6 border-b border-surface-800">
        <span className="text-xs font-semibold uppercase tracking-widest text-surface-200">
          Band Spectrum
        </span>
        <p className="text-xs text-surface-700 mt-0.5">Mapper</p>
      </div>

      <ul className="flex-1 py-4 space-y-0.5">
        {links.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `block px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-surface-800 text-white font-medium'
                    : 'text-surface-200 hover:bg-surface-800 hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          </li>
        ))}

        {user?.isAdmin && (
          <>
            <li className="pt-3 pb-1 px-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-surface-600">Admin</span>
            </li>
            {adminLinks.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `block px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-surface-800 text-white font-medium'
                        : 'text-surface-400 hover:bg-surface-800 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
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
