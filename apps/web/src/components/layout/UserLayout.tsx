import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function UserLayout() {
  const { user, login, logout } = useAuth();

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="bg-surface-900 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold tracking-wide text-surface-100">
            Band Spectrum Mapper
          </span>
          <Link
            to="/view"
            className="text-xs text-surface-400 hover:text-surface-200 transition-colors"
          >
            Browse results
          </Link>
          <Link
            to="/my/contribute"
            className="text-xs text-surface-400 hover:text-surface-200 transition-colors"
          >
            Contribute a band
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name ?? user.email} className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-surface-700 flex items-center justify-center text-xs">
                  {(user.name ?? user.email)[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs text-surface-300 max-w-[160px] truncate">
                {user.name ?? user.email}
              </span>
              <button
                className="text-xs text-surface-500 hover:text-surface-200 transition-colors"
                onClick={logout}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              className="text-xs bg-surface-800 hover:bg-surface-700 text-surface-200 transition-colors rounded px-3 py-1.5"
              onClick={login}
            >
              Sign in with Google
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
