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
import AdminDbHealthPage from './pages/AdminDbHealthPage';
import AdminMissingLyricsPage from './pages/AdminMissingLyricsPage';
import AdminMissingArtworkPage from './pages/AdminMissingArtworkPage';
import AdminMissingBandLogoPage from './pages/AdminMissingBandLogoPage';
import AdminLyricsBatchPage from './pages/AdminLyricsBatchPage';
import AdminSongLinksPage from './pages/AdminSongLinksPage';
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
import SocialPostGeneratorPage from './pages/SocialPostGeneratorPage';
import SongSpectrumPage from './pages/SongSpectrumPage';
import WordCloudPage from './pages/WordCloudPage';
import SongNodesPage from './pages/SongNodesPage';
import TriviaPage from './pages/TriviaPage';
import SocialPlannerPage from './pages/SocialPlannerPage';
import PlayPage from './pages/PlayPage';
import AdminGamePage from './pages/AdminGamePage';
import ExplorePage from './pages/ExplorePage';
import WordHuntPage from './pages/WordHuntPage';
import LyricChainPage from './pages/LyricChainPage';
import LeaderboardPage from './pages/LeaderboardPage';
import GamesPage from './pages/GamesPage';
import GuessSongPage from './pages/GuessSongPage';
import GraphHuntPage from './pages/GraphHuntPage';
import LyricDissectionPage from './pages/LyricDissectionPage';
import TimelinePage from './pages/TimelinePage';
import Band2048Page from './pages/Band2048Page';
import SpectrumStudioPage from './pages/SpectrumStudioPage';
import CinemaPage from './pages/CinemaPage';
import SpectrumGuesserPage from './pages/SpectrumGuesserPage';
import LyricMatchPage from './pages/LyricMatchPage';
import AlbumBracketPage from './pages/AlbumBracketPage';
import LyricsUniversePage from './pages/LyricsUniversePage';
import LyricsFlowPage from './pages/LyricsFlowPage';
import AdminDataGridPage from './pages/AdminDataGridPage';
import AdminHubPage from './pages/AdminHubPage';
import AdminBootlegsPage from './pages/AdminBootlegsPage';
import DataHealthPage from './pages/DataHealthPage';
import PatternLabPage from './pages/PatternLabPage';
import AdminGamesPage from './pages/AdminGamesPage';
import SongConnectionsPage from './pages/SongConnectionsPage';
import LyricCompletePage from './pages/LyricCompletePage';
import LyricDuelPage from './pages/LyricDuelPage';
import CrosswordPage from './pages/CrosswordPage';
import AdminCrosswordPage from './pages/AdminCrosswordPage';
import WordSearchPage from './pages/WordSearchPage';
import RecordCatcherPage from './pages/RecordCatcherPage';
import AdminPlatformerPage from './pages/AdminPlatformerPage';
import AdminPlatformerLevelsPage from './pages/AdminPlatformerLevelsPage';
import PlatformerPage from './pages/PlatformerPage';
import PlaylistMakerPage from './pages/PlaylistMakerPage';
import LyricLabPage from './pages/LyricLabPage';
import AdminBandLogosPage from './pages/AdminBandLogosPage';
import MinesweeperPage from './pages/MinesweeperPage';
import DiscoverPage from './pages/DiscoverPage';
import BandRpgPage from './pages/BandRpgPage';
import BandRpgCollectionPage from './pages/BandRpgCollectionPage';
import BandRpgPublicCuratorPage from './pages/BandRpgPublicCuratorPage';
import BandRpgPublicFestivalPage from './pages/BandRpgPublicFestivalPage';
import BandRpgPublicTourPage from './pages/BandRpgPublicTourPage';
import BandRpgGamePage from './pages/BandRpgGamePage';
import BandRpgCampaignPage from './pages/BandRpgCampaignPage';
import BandRpgAdventureDetailPage from './pages/BandRpgAdventureDetailPage';
import CommunityPage from './pages/CommunityPage';
import AdminBandRpgPage from './pages/AdminBandRpgPage';
import WikiIndexPage from './pages/wiki/WikiIndexPage';
import WikiBandsBrowsePage from './pages/wiki/WikiBandsBrowsePage';
import WikiAlbumsBrowsePage from './pages/wiki/WikiAlbumsBrowsePage';
import WikiSongsBrowsePage from './pages/wiki/WikiSongsBrowsePage';
import WikiArtistsBrowsePage from './pages/wiki/WikiArtistsBrowsePage';
import WikiBandPage from './pages/wiki/WikiBandPage';
import WikiAlbumPage from './pages/wiki/WikiAlbumPage';
import WikiSongPage from './pages/wiki/WikiSongPage';
import WikiArtistPage from './pages/wiki/WikiArtistPage';
import NotFoundPage from './pages/NotFoundPage';

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
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/rate" element={<RateRedirect />} />
        <Route path="/share/songs/:songId" element={<ShareSongPage />} />
        <Route path="/share/albums/:albumId" element={<ShareAlbumPage />} />
        <Route path="/view" element={<ViewerIndexPage />} />
        <Route path="/view/:bandSlug" element={<ViewerBandPage />} />
        <Route path="/explore"          element={<ExplorePage />} />
        <Route path="/cinema"           element={<CinemaPage />} />
        <Route path="/cinema/lyrics"      element={<LyricsUniversePage />} />
        <Route path="/cinema/lyrics-flow" element={<LyricsFlowPage />} />
        <Route path="/leaderboard"     element={<LeaderboardPage />} />
        <Route path="/games"           element={<GamesPage />} />
        <Route path="/guess-the-song" element={<GuessSongPage />} />
        <Route path="/graph-hunt"      element={<GraphHuntPage />} />
        <Route path="/spectrum-studio" element={<SpectrumStudioPage />} />
        <Route path="/playlist" element={<PlaylistMakerPage />} />
        <Route path="/playlist/:id" element={<PlaylistMakerPage />} />
        {/* ── Band RPG public pages — Phase Y.1 ── */}
        <Route path="/band-rpg/curator/:userId"  element={<BandRpgPublicCuratorPage />} />
        <Route path="/band-rpg/festival/:id"     element={<BandRpgPublicFestivalPage />} />
        <Route path="/band-rpg/tour/:id"         element={<BandRpgPublicTourPage />} />
        {/* ── Community Discovery — Phase Y.2 ── */}
        <Route path="/community" element={<CommunityPage />} />

        {/* ── Music Wiki — encyclopedic view of bands, albums, songs, artists ── */}
        <Route path="/wiki" element={<WikiIndexPage />} />
        <Route path="/wiki/bands" element={<WikiBandsBrowsePage />} />
        <Route path="/wiki/albums" element={<WikiAlbumsBrowsePage />} />
        <Route path="/wiki/songs" element={<WikiSongsBrowsePage />} />
        <Route path="/wiki/artists" element={<WikiArtistsBrowsePage />} />
        <Route path="/wiki/bands/:slug" element={<WikiBandPage />} />
        <Route path="/wiki/albums/:bandSlug/:albumSlug" element={<WikiAlbumPage />} />
        <Route path="/wiki/songs/:songId" element={<WikiSongPage />} />
        <Route path="/wiki/artists/:memberId" element={<WikiArtistPage />} />

        {/* ── USER: rating surface + game, any logged-in Google user ── */}
        <Route path="/my" element={<UserLayout />}>
          <Route index element={<Navigate to="/my/rate" replace />} />
          <Route path="rate" element={<UserRatePage />} />
          <Route path="contribute" element={<ContributePage />} />
          <Route path="profile" element={<UserProfilePage />} />
        </Route>
        <Route path="/play" element={<PlayPage />} />
        <Route path="/play/word-hunt" element={<WordHuntPage />} />
        <Route path="/play/lyric-chain" element={<LyricChainPage />} />
        <Route path="/play/lyric-dissection" element={<LyricDissectionPage />} />
        <Route path="/play/timeline" element={<TimelinePage />} />
        <Route path="/play/2048" element={<Band2048Page />} />
        <Route path="/play/spectrum-guesser" element={<SpectrumGuesserPage />} />
        <Route path="/play/lyric-match" element={<LyricMatchPage />} />
        <Route path="/play/bracket" element={<AlbumBracketPage />} />
        <Route path="/play/lyric-complete" element={<LyricCompletePage />} />
        <Route path="/play/lyric-duel" element={<LyricDuelPage />} />
        <Route path="/play/crossword" element={<CrosswordPage />} />
        <Route path="/play/word-search" element={<WordSearchPage />} />
        <Route path="/play/record-catcher" element={<RecordCatcherPage />} />
        <Route path="/play/platformer" element={<PlatformerPage />} />
        <Route path="/play/minesweeper" element={<MinesweeperPage />} />
        <Route path="/play/band-rpg" element={<BandRpgPage />} />
        <Route path="/play/band-rpg/collection" element={<BandRpgCollectionPage />} />
        <Route path="/play/band-rpg/adventures" element={<BandRpgCampaignPage />} />
        <Route path="/play/band-rpg/adventures/:id" element={<BandRpgAdventureDetailPage />} />
        <Route path="/play/band-rpg/game/:slug" element={<BandRpgGamePage />} />

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
          <Route path="social" element={<SocialPostGeneratorPage />} />
          <Route path="social-planner" element={<SocialPlannerPage />} />
          <Route path="song-spectrum" element={<SongSpectrumPage />} />
          <Route path="word-cloud" element={<WordCloudPage />} />
          <Route path="lyric-lab" element={<LyricLabPage />} />
          <Route path="song-nodes" element={<SongNodesPage />} />
          <Route path="song-connections" element={<SongConnectionsPage />} />
          <Route path="trivia" element={<TriviaPage />} />
          <Route path="admin/game" element={<AdminGamePage />} />
          <Route path="discography" element={<DiscographyImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/contributions" element={<AdminContributionsPage />} />
          <Route path="admin/knowledge" element={<AdminKnowledgePage />} />
          <Route path="admin/db" element={<AdminDbPage />} />
          <Route path="admin/db-health" element={<AdminDbHealthPage />} />
          <Route path="admin/missing-lyrics" element={<AdminMissingLyricsPage />} />
          <Route path="admin/missing-artwork" element={<AdminMissingArtworkPage />} />
          <Route path="admin/missing-band-logos" element={<AdminMissingBandLogoPage />} />
          <Route path="admin/lyrics-batch" element={<AdminLyricsBatchPage />} />
          <Route path="admin/song-links" element={<AdminSongLinksPage />} />
          <Route path="admin/data-grid" element={<AdminDataGridPage />} />
          <Route path="admin/hub" element={<AdminHubPage />} />
          <Route path="admin/bootlegs" element={<AdminBootlegsPage />} />
          <Route path="admin/data-health" element={<DataHealthPage />} />
          <Route path="admin/games" element={<AdminGamesPage />} />
          <Route path="admin/crossword-builder" element={<AdminCrosswordPage />} />
          <Route path="admin/platformer" element={<AdminPlatformerPage />} />
          <Route path="admin/platformer-levels" element={<AdminPlatformerLevelsPage />} />
          <Route path="admin/band-logos" element={<AdminBandLogosPage />} />
          <Route path="admin/band-rpg" element={<AdminBandRpgPage />} />
          <Route path="pattern-lab" element={<PatternLabPage />} />
        </Route>

        {/* Catch-all — any unmatched path shows a real page, never a blank screen */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
