import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import SiteHeader from '../layout/SiteHeader';

interface NavItem {
  id: string;
  label: string;
}

interface Props {
  children: ReactNode;
  nav: NavItem[];         // section IDs + labels for the sticky sidebar
  title: string;
  subtitle?: string;
  eyebrow?: ReactNode;    // small label above the title (e.g. "Band · Rock")
}

export default function WikiLayout({ children, nav, title, subtitle, eyebrow }: Props) {
  const { hash } = useLocation();
  const activeId = hash.replace('#', '');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <SiteHeader active="wiki" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Page header */}
        <div className="mb-8">
          {eyebrow && (
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">{eyebrow}</div>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white" style={{ textWrap: 'balance' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-gray-400 text-sm leading-relaxed max-w-2xl">{subtitle}</p>
          )}
        </div>

        <div className="flex gap-8 items-start">
          {/* Sticky sidebar nav */}
          {nav.length > 0 && (
            <aside className="hidden lg:block w-48 shrink-0 sticky top-20">
              <nav className="flex flex-col gap-0.5">
                {nav.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      activeId === item.id
                        ? 'bg-indigo-900/40 text-indigo-300 font-medium'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </aside>
          )}

          {/* Main content */}
          <main className="flex-1 min-w-0 space-y-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Reusable wiki section wrapper ─────────────────────────────────────────────

interface SectionProps {
  id: string;
  title: string;
  children: ReactNode;
  badge?: ReactNode;
}

export function WikiSection({ id, title, children, badge }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-200 tracking-tight">{title}</h2>
        {badge}
        <div className="flex-1 h-px bg-gray-800" />
      </div>
      {children}
    </section>
  );
}

// ── Simple stat cell ──────────────────────────────────────────────────────────

interface StatProps {
  label: string;
  value: ReactNode;
}

export function WikiStat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-widest text-gray-500">{label}</dt>
      <dd className="text-sm font-semibold text-gray-100 tabular-nums">{value}</dd>
    </div>
  );
}

// ── Spectrum bar ──────────────────────────────────────────────────────────────

interface SpectrumBarProps {
  label: string;
  value: number;  // 0–10
}

export function SpectrumBar({ label, value }: SpectrumBarProps) {
  const pct = Math.round((value / 10) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-24 shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-gray-400 w-6 text-right">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// ── Bread-crumb navigation ────────────────────────────────────────────────────

interface Crumb { label: string; to: string }

export function WikiBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-6 flex-wrap">
      <Link to="/wiki" className="hover:text-indigo-400 transition-colors">Wiki</Link>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-gray-700">/</span>
          {i < crumbs.length - 1 ? (
            <Link to={c.to} className="hover:text-indigo-400 transition-colors">{c.label}</Link>
          ) : (
            <span className="text-gray-300">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
