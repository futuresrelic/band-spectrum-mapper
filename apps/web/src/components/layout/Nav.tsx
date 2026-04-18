import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/library', label: 'Library' },
  { to: '/spectrum', label: 'Spectrum' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/compare', label: 'Compare' },
  { to: '/imports', label: 'Imports' },
  { to: '/settings', label: 'Settings' },
];

export default function Nav() {
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
      </ul>
    </nav>
  );
}
