import { useState, useRef, useEffect } from 'react';

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

type CaptureState = 'idle' | 'recording' | 'processing';

export default function BrowserAudioCapture({ onFile, disabled }: Props) {
  const [state, setState] = useState<CaptureState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<BlobPart[]>([]);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef     = useRef<string>('audio/webm');

  // Clean up timer on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function startCapture() {
    setError(null);
    try {
      // Ask the browser to share a tab — user picks the YouTube tab and
      // must tick "Share tab audio" in the Chrome picker.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        // video: false is technically valid but some browsers ignore it;
        // we just don't use the video track.
        video: { width: 1, height: 1 } as MediaTrackConstraints,
      } as DisplayMediaStreamOptions);

      // Drop the video track immediately — we only want audio
      stream.getVideoTracks().forEach((t) => t.stop());

      if (stream.getAudioTracks().length === 0) {
        setError('No audio track captured. Make sure to tick "Share tab audio" in the Chrome picker.');
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Pick best supported MIME type for recording
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
        .find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      mimeRef.current = mime || 'audio/webm';

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        const ext  = mimeRef.current.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `browser-capture.${ext}`, { type: blob.type });
        setState('processing');
        onFile(file);
      };

      // If user stops sharing from the browser UI (clicks "Stop sharing")
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      });

      recorder.start(1000); // chunk every second so we don't lose data
      setState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
        setError('Capture cancelled or permission denied. Try again and select the YouTube tab.');
      } else if (msg.toLowerCase().includes('notsupported')) {
        setError('Your browser does not support tab audio capture. Use Chrome or Edge.');
      } else {
        setError(`Capture failed: ${msg}`);
      }
    }
  }

  function stopCapture() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    recorderRef.current?.stop();
  }

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  if (state === 'recording') {
    return (
      <div className="border border-red-700/50 bg-red-950/30 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-sm font-semibold text-white">Recording…</span>
          <span className="font-mono text-red-400 text-sm tabular-nums">{mins}:{secs}</span>
        </div>
        <p className="text-xs text-surface-400">
          Play the song in your YouTube tab. Come back here and click{' '}
          <strong className="text-white">Stop &amp; Analyze</strong> when it ends.
        </p>
        <button
          onClick={stopCapture}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded transition-colors"
        >
          Stop &amp; Analyze
        </button>
      </div>
    );
  }

  if (state === 'processing') {
    return (
      <div className="border border-indigo-700/40 bg-indigo-950/20 rounded-lg p-4">
        <div className="flex items-center gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
          <span className="text-sm text-surface-300">Processing captured audio…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-dashed border-indigo-800/60 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-white">Capture from browser tab</span>
        <span className="text-[11px] bg-sky-900/40 text-sky-300 border border-sky-700/40 rounded px-1.5 py-0.5 font-medium">
          no download needed
        </span>
      </div>

      <ol className="text-xs text-surface-400 space-y-1 list-decimal list-inside">
        <li>Open YouTube in another tab and find the song</li>
        <li>Click <strong className="text-white">Start capture</strong> below</li>
        <li>
          In the Chrome picker, select your YouTube tab and tick{' '}
          <strong className="text-white">Share tab audio</strong>
        </li>
        <li>Press play on YouTube — let it run through the song</li>
        <li>Click <strong className="text-white">Stop &amp; Analyze</strong> when done</li>
      </ol>

      <p className="text-[11px] text-surface-600">
        Works in Chrome and Edge. Firefox does not support tab audio capture.
        The audio is never stored on your machine — it goes straight to the analyser.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={() => { void startCapture(); }}
        disabled={disabled}
        className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded transition-colors"
      >
        🎙 Start capture
      </button>
    </div>
  );
}
