import { useRef, useState } from 'react';

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

const ACCEPT = '.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus';
const MAX_MB = 150;

function fmt(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AudioUploader({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File too large (${fmt(file.size)}). Maximum is ${MAX_MB} MB.`);
      return;
    }
    onFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
          ${dragging ? 'border-indigo-400 bg-indigo-900/20' : 'border-surface-600 hover:border-surface-400'}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="text-3xl mb-3">🎵</div>
        <p className="text-sm text-surface-300 font-medium mb-1">
          Drop an audio file here or click to browse
        </p>
        <p className="text-xs text-surface-500">
          MP3 · WAV · FLAC · OGG · M4A · AAC · OPUS · Max {MAX_MB} MB
        </p>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onInputChange}
        disabled={disabled}
      />
    </div>
  );
}
