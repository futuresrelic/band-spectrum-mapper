import { type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import UserRatePage from './pages/UserRatePage';

// Redirects based on login/admin state: admin→/dashboard, user→/my/rate, guest→/view
function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/view" replace />;
  if (user.isAdmin) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/my/rate" replace />;
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
  if (!user) return <Navigate to="/view" replace />;
  if (!user.isAdmin) return <Navigate to="/my/rate" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* ── PUBLIC: read-only viewer, no login needed ── */}
        <Route path="/view" element={<ViewerIndexPage />} />
        <Route path="/view/:bandSlug" element={<ViewerBandPage />} />

        {/* ── USER: rating surface, any logged-in Google user ── */}
        <Route path="/my" element={<UserLayout />}>
          <Route index element={<Navigate to="/my/rate" replace />} />
          <Route path="rate" element={<UserRatePage />} />
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
          <Route path="spectrum" element={<SpectrumPage />} />
          <Route path="analysis" element={<LyricsAnalysisPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="imports" element={<ImportsPage />} />
          <Route path="discography" element={<DiscographyImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
