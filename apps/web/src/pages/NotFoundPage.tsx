// Global catch-all — any unmatched route lands here instead of a blank
// screen. Added Z.17.7 after /wiki/bands, /wiki/albums, /wiki/songs, and
// /wiki/artists were found to have no matching route at all.

import { Link } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <SiteHeader />
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-6xl font-black tracking-tight text-gray-800 mb-4">404</p>
        <h1 className="text-xl font-semibold text-gray-200 mb-2">Page not found</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-8">
          Nothing lives at this address. It may have moved, or the link might be wrong.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/wiki"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Go to Wiki
          </Link>
          <Link
            to="/landing"
            className="text-sm font-medium px-4 py-2 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
