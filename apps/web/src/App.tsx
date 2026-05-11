import { type ReactNode } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import UserLayout from './components/layout/UserLayout';
import DashboardPage from './pages/DashboardPage';
import LibraryPage from './pages/LibraryPage';
import BandDetailPage from './pages/BandDetailPage';
import AlbumDetailPage from './pages/AlbumDetailPage';
import SongDetailPage from './pages/SongDetailPage';
import SpectrumPage from './pages/SpectrumPage';
import LyricsAnalysisPage from './pages/LyricsAnalysisPage';
import ComparePage from './pages/ComparePage';
import ImportsPage from './pages/ImportsPage';
import SettingsPage from './pages/SettingsPage';
import DiscographyImportPage from './pages/DiscographyImportPage';
import ViewerIndexPage from './pages/ViewerIndexPage';
import ViewerBandPage from './pages/ViewerBandPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminContributionsPage from './pages/AdminContributionsPage';
import AdminKnowledgePage from './pages/AdminKnowledgePage';
import AdminDbPage from './pages/AdminDbPage';
import LyricsBuilderPage from './pages/LyricsBuilderPage';
import AiBatchRunnerPage from './pages/AiBatchRunnerPage';
import UserRatePage from './pages/UserRatePage';
import ContributePage from './pages/ContributePage';
import TagSongsPage from './pages/TagSongsPage';
import LandingPage from './pages/LandingPage';
import LegalPage from './pages/LegalPage';
import HelpPage from './pages/HelpPage';
import ShareSongPage from './pages/ShareSongPage';
import ShareAlbumPage from './pages/ShareAlbumPage';
import UserProfilePage from './pages/UserProfilePage';
import SongCloudPage from './pages/SongCloudPage';

// Redirects based on login/admin state: admin→/dashboard, user→/my/rate, guest→/landing
function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/landing" replace />;
  if (user.isAdmin) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/my/rate" replace />;
}

// /rate?songId=xxx → /my/rate?songId=xxx (short shareable deep-link)
function RateRedirect() {
  const [searchParams] = useSearchParams();
  const songId = searchParams.get('songId');
  return <Navigate to={`/my/rate${songId ? `?songId=${encodeURIComponent(songId)}` : ''}`} replace />;
}

// Wraps admin routes — non-admin users are redirected away
function AdminGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-surface-500 text-sm">
        Loading...
      </div>
    );
  }
  if (!user) return <Navigate to="/landing" replace />;
  if (!user.isAdmin) return <Navigate to="/my/rate" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* ── PUBLIC: landing, viewer, share, legal, help — no login needed ── */}
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/rate" element={<RateRedirect />} />
        <Route path="/share/songs/:songId" element={<ShareSongPage />} />
        <Route path="/share/albums/:albumId" element={<ShareAlbumPage />} />
        <Route path="/view" element={<ViewerIndexPage />} />
        <Route path="/view/:bandSlug" element={<ViewerBandPage />} />

        {/* ── USER: rating surface, any logged-in Google user ── */}
        <Route path="/my" element={<UserLayout />}>
          <Route index element={<Navigate to="/my/rate" replace />} />
          <Route path="rate" element={<UserRatePage />} />
          <Route path="contribute" element={<ContributePage />} />
          <Route path="profile" element={<UserProfilePage />} />
        </Route>

        {/* ── ADMIN: full app, isAdmin required ── */}
        <Route
          path="/"
          element={
            <AdminGuard>
              <Layout />
            </AdminGuard>
          }
        >
          <Route index element={<RootRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="library/bands/:bandId" element={<BandDetailPage />} />
          <Route path="library/albums/:albumId" element={<AlbumDetailPage />} />
          <Route path="library/songs/:songId" element={<SongDetailPage />} />
          <Route path="library/tags/:tagSlug" element={<TagSongsPage />} />
          <Route path="spectrum" element={<SpectrumPage />} />
          <Route path="analysis" element={<LyricsAnalysisPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="imports" element={<ImportsPage />} />
          <Route path="lyrics-builder" element={<LyricsBuilderPage />} />
          <Route path="admin/ai-batch" element={<AiBatchRunnerPage />} />
          <Route path="cloud" element={<SongCloudPage />} />
          <Route path="discography" element={<DiscographyImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/contributions" element={<AdminContributionsPage />} />
          <Route path="admin/knowledge" element={<AdminKnowledgePage />} />
          <Route path="admin/db" element={<AdminDbPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
