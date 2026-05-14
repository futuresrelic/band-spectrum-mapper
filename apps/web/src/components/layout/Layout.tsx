import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Nav from './Nav';
import SocialChatPanel from '../social/SocialChatPanel';

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile backdrop */}
      {navOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, static on md+ */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:relative md:translate-x-0 md:z-auto ${
          navOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <Nav onClose={() => setNavOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-20 bg-white border-b border-surface-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setNavOpen(true)}
            className="text-surface-700 hover:text-surface-900 text-xl leading-none"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="text-sm font-semibold text-surface-900">Band Spectrum Mapper</span>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* Global AI Social Strategist — available on every admin page */}
      <SocialChatPanel />
    </div>
  );
}
