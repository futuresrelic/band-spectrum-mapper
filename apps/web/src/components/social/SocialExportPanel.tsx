import { useState } from 'react';

type Theme  = 'dark' | 'minimal' | 'manuscript' | 'neon';
type Format = 'square' | 'story';

const THEMES: { id: Theme; label: string; description: string }[] = [
  { id: 'dark',       label: 'Dark Cinematic', description: 'Deep navy, vivid gradients — the core BSM look' },
  { id: 'minimal',    label: 'Minimal',        description: 'Clean white, soft colors — editorial' },
  { id: 'manuscript', label: 'Manuscript',     description: 'Near-black, warm tones — philosophical document' },
  { id: 'neon',       label: 'Neon',           description: 'Pure black, glowing neon — high contrast' },
];

const FORMATS: { id: Format; label: string; size: string; description: string }[] = [
  { id: 'square', label: 'Square',  size: '1080 × 1080', description: 'Facebook, Instagram, Threads' },
  { id: 'story',  label: 'Story',   size: '1080 × 1920', description: 'Instagram/Facebook Stories' },
];

export default function SocialExportPanel({ songId }: { songId: string }) {
  const [theme,    setTheme]    = useState<Theme>('dark');
  const [format,   setFormat]   = useState<Format>('square');
  const [isOpen,   setIsOpen]   = useState(false);
  const [previewing, setPreviewing] = useState(false);

  function downloadUrl() {
    return `/api/og/songs/${songId}/export?format=${format}&theme=${theme}`;
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = downloadUrl();
    a.download = '';
    a.click();
  }

  function handlePreview() {
    setPreviewing(true);
    window.open(downloadUrl(), '_blank');
    setTimeout(() => setPreviewing(false), 1500);
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors border border-white/20"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export for socials
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Export for social media</h3>
        <button onClick={() => setIsOpen(false)} className="text-white/40 hover:text-white/70 text-lg leading-none">×</button>
      </div>

      {/* Format selector */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-widest mb-2">Format</p>
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`text-left rounded-lg px-3 py-2.5 border transition-colors ${
                format === f.id
                  ? 'bg-indigo-600/30 border-indigo-400/60 text-white'
                  : 'border-white/10 hover:border-white/20 text-white/70'
              }`}
            >
              <p className="text-xs font-semibold">{f.label}</p>
              <p className="text-xs opacity-60 mt-0.5">{f.size}</p>
              <p className="text-xs opacity-50 mt-0.5">{f.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Theme selector */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-widest mb-2">Theme</p>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`text-left rounded-lg px-3 py-2.5 border transition-colors ${
                theme === t.id
                  ? 'bg-indigo-600/30 border-indigo-400/60 text-white'
                  : 'border-white/10 hover:border-white/20 text-white/70'
              }`}
            >
              <p className="text-xs font-semibold">{t.label}</p>
              <p className="text-xs opacity-50 mt-0.5 leading-tight">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleDownload}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PNG
        </button>
        <button
          onClick={handlePreview}
          disabled={previewing}
          className="px-3 py-2.5 rounded-lg border border-white/20 hover:border-white/40 text-white/70 hover:text-white text-sm transition-colors disabled:opacity-50"
          title="Preview in new tab"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </div>

      <p className="text-xs text-white/30 text-center">
        Server-rendered PNG · consistent across all devices
      </p>
    </div>
  );
}
