import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
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

export default function App() {
  return (
    <Routes>
      {/* Public read-only viewer — no nav shell */}
      <Route path="/view" element={<ViewerIndexPage />} />
      <Route path="/view/:bandSlug" element={<ViewerBandPage />} />

      {/* Main app with nav */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
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
      </Route>
    </Routes>
  );
}
