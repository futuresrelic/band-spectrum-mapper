import { useState, useCallback, useEffect, useRef } from 'react';
import { platformerApi, type AvatarPromptData, type CharacterSkin } from '../api/platformer';

// ── Preset trait chips ────────────────────────────────────────────────────────

const PRESET_TRAITS = [
  'Bald', 'Shaved head', 'Beard', 'Long hair', 'Short hair', 'Glasses',
  'Stage makeup', 'Theatrical', 'Intense expression', 'Aggressive',
  'Psychedelic', 'Vintage', 'Futuristic', 'Mohawk', 'Dreadlocks',
];

function addTrait(description: string, trait: string): string {
  const t = description.trimEnd();
  if (!t) return trait + '.';
  if (t.endsWith('.') || t.endsWith(',')) return `${t} ${trait}.`;
  return `${t}, ${trait}.`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'loading' | 'editing' | 'generating' | 'picking' | 'done';

interface Props {
  memberId: string;
  onClose: () => void;
  onDone: (skin: CharacterSkin) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AvatarPromptEditor({ memberId, onClose, onDone }: Props) {
  const [step, setStep]                     = useState<Step>('loading');
  const [promptData, setPromptData]         = useState<AvatarPromptData | null>(null);
  const [description, setDescription]       = useState('');
  const [originalDescription, setOriginalDescription] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [visualNotes, setVisualNotes]       = useState('');
  const [styleLocked, setStyleLocked]       = useState(true);
  const [showStyle, setShowStyle]           = useState(false);
  const [showNegative, setShowNegative]     = useState(false);
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [isDeletingRef, setIsDeletingRef]   = useState(false);
  const [showRegenOffer, setShowRegenOffer] = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [variations, setVariations]         = useState<string[]>([]);
  const [doneSkin, setDoneSkin]             = useState<CharacterSkin | null>(null);
  const [generatingCount, setGeneratingCount] = useState(1);
  const fileInputRef                        = useRef<HTMLInputElement>(null);
  const fetchRef                            = useRef(0);

  const loadPrompt = useCallback(() => {
    const id = ++fetchRef.current;
    setStep('loading');
    setError(null);
    platformerApi.generateAvatarPrompt(memberId)
      .then((data) => {
        if (fetchRef.current !== id) return;
        setPromptData(data);
        setDescription(data.characterDescription);
        setOriginalDescription(data.originalDescription ?? data.characterDescription);
        setNegativePrompt(data.lastNegativePrompt ?? '');
        setVisualNotes(data.visualNotes ?? '');
        setReferenceImageUrl(data.referenceImageDataUrl);
        setStep('editing');
      })
      .catch((e: unknown) => {
        if (fetchRef.current !== id) return;
        const msg = (e as { error?: string })?.error ?? (e instanceof Error ? e.message : 'Failed to load prompt');
        setError(msg);
        setStep('editing');
      });
  }, [memberId]);

  useEffect(() => { loadPrompt(); }, [loadPrompt]);

  // Build the final assembled prompt (for inspector)
  function buildFinalPrompt(): string {
    if (!promptData) return '';
    let desc = description.trim();
    if (visualNotes.trim()) desc += `. ${visualNotes.trim()}`;
    let prompt = styleLocked ? promptData.bsmStylePrefix + desc + ' ' + promptData.bsmStyleSuffix : desc;
    if (negativePrompt.trim()) prompt += ` Avoid: ${negativePrompt.trim()}.`;
    return prompt;
  }

  const handleGenerate = useCallback(async (count: number) => {
    if (!description.trim()) return;
    setError(null);
    setGeneratingCount(count);
    setStep('generating');
    try {
      const result = await platformerApi.aiGenerateSkin({
        memberId,
        characterDescription: description,
        negativePrompt: negativePrompt.trim() || null,
        visualNotes: visualNotes.trim() || null,
        count,
      });
      if (count > 1 && result.variations && result.variations.length > 0) {
        setVariations(result.variations);
        setStep('picking');
      } else if (result.skin) {
        setDoneSkin(result.skin);
        setStep('done');
        onDone(result.skin);
      } else {
        setError('No image returned. Try again.');
        setStep('editing');
      }
    } catch (e: unknown) {
      const msg = (e as { error?: string })?.error ?? (e instanceof Error ? e.message : 'Generation failed');
      setError(msg);
      setStep('editing');
    }
  }, [description, negativePrompt, visualNotes, memberId, onDone]);

  const handlePickVariation = useCallback(async (dataUrl: string) => {
    setGeneratingCount(1);
    setStep('generating');
    try {
      const result = await platformerApi.saveVariation({ memberId, dataUrl });
      setDoneSkin(result.skin);
      setStep('done');
      onDone(result.skin);
    } catch (e: unknown) {
      const msg = (e as { error?: string })?.error ?? (e instanceof Error ? e.message : 'Save failed');
      setError(msg);
      setStep('picking');
    }
  }, [memberId, onDone]);

  const handleReferenceFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setError('Reference image must be under 4MB.');
      return;
    }

    setIsUploadingRef(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      await platformerApi.uploadMemberReference(memberId, dataUrl);
      setReferenceImageUrl(dataUrl);
      setShowRegenOffer(true);
    } catch (e: unknown) {
      const msg = (e as { error?: string })?.error ?? (e instanceof Error ? e.message : 'Upload failed');
      setError(msg);
    } finally {
      setIsUploadingRef(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [memberId]);

  const handleClearReference = useCallback(async () => {
    setIsDeletingRef(true);
    setError(null);
    try {
      await platformerApi.clearMemberReference(memberId);
      setReferenceImageUrl(null);
      setShowRegenOffer(false);
    } catch (e: unknown) {
      const msg = (e as { error?: string })?.error ?? (e instanceof Error ? e.message : 'Clear failed');
      setError(msg);
    } finally {
      setIsDeletingRef(false);
    }
  }, [memberId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const memberLabel = promptData
    ? `${promptData.memberName}${promptData.memberRole ? ` · ${promptData.memberRole}` : ''}${promptData.bandName ? ` (${promptData.bandName})` : ''}`
    : 'Band Member';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[90dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <p className="text-white font-semibold text-sm">Avatar Prompt Editor</p>
            <p className="text-gray-400 text-xs mt-0.5">{memberLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-lg leading-none px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

          {/* Loading state */}
          {(step === 'loading' || (step === 'generating' && generatingCount === 1 && variations.length === 0)) && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">
                {step === 'loading' ? 'Generating appearance description…' : 'Generating avatar…'}
              </p>
              <p className="text-gray-600 text-xs">This may take up to 30 seconds.</p>
            </div>
          )}

          {/* Generating variations */}
          {step === 'generating' && generatingCount > 1 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Generating {generatingCount} variations…</p>
              <p className="text-gray-600 text-xs">This may take up to 60 seconds.</p>
            </div>
          )}

          {/* Variation picker */}
          {step === 'picking' && (
            <div className="space-y-3">
              <p className="text-gray-300 text-sm">Choose the best result — only the selected image will be saved.</p>
              {referenceImageUrl ? (
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  {/* Reference image on left */}
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Reference</p>
                    <div className="aspect-square rounded-lg overflow-hidden border border-gray-700">
                      <img src={referenceImageUrl} alt="Reference" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  {/* 2x2 variations grid on right */}
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Generated Variations</p>
                    <div className="grid grid-cols-2 gap-2">
                      {variations.map((v, i) => (
                        <button
                          key={i}
                          onClick={() => { void handlePickVariation(v); }}
                          className="group relative aspect-square rounded-lg overflow-hidden border-2 border-gray-700 hover:border-indigo-400 transition-colors"
                        >
                          <img src={v} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 text-white font-semibold text-sm transition-opacity">
                              Select
                            </span>
                          </div>
                          <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                            {i + 1}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {variations.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => { void handlePickVariation(v); }}
                      className="group relative aspect-square rounded-lg overflow-hidden border-2 border-gray-700 hover:border-indigo-400 transition-colors"
                    >
                      <img src={v} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 text-white font-semibold text-sm transition-opacity">
                          Select
                        </span>
                      </div>
                      <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                        {i + 1}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Done */}
          {step === 'done' && doneSkin && (
            <div className="flex flex-col items-center py-12 gap-4">
              <div className="w-32 h-32 rounded-lg overflow-hidden border border-gray-700">
                <img src={doneSkin.dataUrl} alt="Generated avatar" className="w-full h-full object-cover" />
              </div>
              <p className="text-green-400 font-semibold text-sm">Avatar saved successfully!</p>
              <button onClick={onClose} className="text-xs text-gray-400 hover:text-white transition-colors">
                Close
              </button>
            </div>
          )}

          {/* Editing */}
          {step === 'editing' && (
            <>
              {/* Error */}
              {error && (
                <div className="bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              {/* Reference Image panel */}
              <div className="space-y-1.5">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Reference Photo</p>
                <p className="text-[10px] text-gray-600">Reference is used by AI to improve facial description accuracy</p>
                {referenceImageUrl ? (
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-700 shrink-0">
                      <img src={referenceImageUrl} alt="Reference" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-gray-300 font-medium">Reference photo set</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingRef}
                          className="text-[11px] px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                        >
                          {isUploadingRef ? 'Uploading…' : 'Replace'}
                        </button>
                        <button
                          onClick={() => { void handleClearReference(); }}
                          disabled={isDeletingRef}
                          className="text-[11px] px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                        >
                          {isDeletingRef ? 'Clearing…' : 'Clear'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingRef}
                    className="w-full flex flex-col items-center gap-2 py-4 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 hover:border-indigo-600 hover:text-indigo-400 transition-colors disabled:opacity-50"
                  >
                    <span className="text-2xl">📷</span>
                    <span className="text-xs font-medium">{isUploadingRef ? 'Uploading…' : 'Add Reference Photo'}</span>
                    <span className="text-[10px] text-gray-600">Max 4MB · JPG or PNG</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { void handleReferenceFileChange(e); }}
                />

                {/* Regen offer after upload */}
                {showRegenOffer && (
                  <div className="flex items-center gap-2 bg-indigo-900/30 border border-indigo-700/40 rounded-lg px-3 py-2">
                    <p className="text-xs text-indigo-300 flex-1">
                      Reference updated. Regenerate prompt to use new reference?
                    </p>
                    <button
                      onClick={() => { setShowRegenOffer(false); loadPrompt(); }}
                      className="text-[11px] px-2.5 py-1 rounded bg-indigo-700 text-white hover:bg-indigo-600 transition-colors shrink-0"
                    >
                      Regenerate
                    </button>
                    <button
                      onClick={() => setShowRegenOffer(false)}
                      className="text-gray-500 hover:text-gray-300 text-xs px-1 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Style Lock */}
              <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStyleLocked((v) => !v)}
                      className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${styleLocked ? 'bg-indigo-600' : 'bg-gray-600'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${styleLocked ? 'translate-x-4' : 'translate-x-0.5'}`}
                      />
                    </button>
                    <span className="text-xs text-gray-300 font-medium">Lock to BSM Style</span>
                  </div>
                  {promptData && (
                    <button
                      onClick={() => setShowStyle((v) => !v)}
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {showStyle ? 'Hide' : 'Show'} style frame
                    </button>
                  )}
                </div>
                {showStyle && promptData && (
                  <div className="mt-2 space-y-1 border-t border-gray-700/40 pt-2">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold">Prefix</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed italic">{promptData.bsmStylePrefix}</p>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mt-1">Suffix</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed italic">{promptData.bsmStyleSuffix}</p>
                  </div>
                )}
                {!styleLocked && (
                  <p className="text-[10px] text-amber-500/70 mt-1.5">
                    Style lock is off — the BSM pixel art frame will not wrap your description.
                  </p>
                )}
              </div>

              {/* Character description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    Character Description
                  </label>
                  <button
                    onClick={() => setDescription(originalDescription)}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    title="Reset to auto-generated description"
                  >
                    Reset to original
                  </button>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-y focus:outline-none focus:border-indigo-500 transition-colors font-mono leading-relaxed"
                  placeholder="Rock musician (vocalist, Band name). Short hair, intense expression…"
                />
              </div>

              {/* Preset trait chips */}
              <div className="space-y-1.5">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Quick Add Traits</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_TRAITS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setDescription((d) => addTrait(d, t))}
                      className="text-[11px] px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-indigo-500 transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visual Notes */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                  Visual Notes
                </label>
                <p className="text-[10px] text-gray-600">Quick appearance overrides added to the prompt</p>
                <input
                  type="text"
                  value={visualNotes}
                  onChange={(e) => setVisualNotes(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="e.g. Bald, Goatee, Long hair, Round glasses"
                />
              </div>

              {/* Negative prompt */}
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowNegative((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
                >
                  <span className="text-[9px]">{showNegative ? '▼' : '▶'}</span>
                  Negative Prompt (optional)
                </button>
                {showNegative && (
                  <>
                    <input
                      type="text"
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="generic pop singer, long hair, baseball cap, smiling teenager"
                    />
                    <p className="text-[10px] text-gray-600">Appended to the prompt as: "Avoid: …"</p>
                  </>
                )}
              </div>

              {/* Prompt Inspector */}
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowPromptInspector((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
                >
                  <span className="text-[9px]">{showPromptInspector ? '▼' : '▶'}</span>
                  {showPromptInspector ? 'Hide Final Prompt' : 'Show Final Prompt'}
                </button>
                {showPromptInspector && (
                  <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold mb-1.5">
                      Final prompt sent to OpenAI
                    </p>
                    <p className="text-[11px] text-gray-400 font-mono leading-relaxed whitespace-pre-wrap break-all">
                      {buildFinalPrompt()}
                    </p>
                  </div>
                )}
              </div>

              {/* Prompt source info */}
              <div className="bg-gray-800/40 border border-gray-700/30 rounded-lg px-3 py-2.5 space-y-1">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide font-semibold">Prompt Source</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[11px]">
                  <span className="text-gray-600">Member</span>
                  <span className="text-gray-400">{promptData?.memberName || '—'}</span>
                  <span className="text-gray-600">Role</span>
                  <span className="text-gray-400">{promptData?.memberRole || '—'}</span>
                  <span className="text-gray-600">Band</span>
                  <span className="text-gray-400">{promptData?.bandName || '—'}</span>
                  <span className="text-gray-600">Description source</span>
                  <span className="text-gray-400">{referenceImageUrl ? 'AI vision from reference photo' : 'AI-generated, editable'}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer — editing */}
        {step === 'editing' && (
          <div className="px-5 py-4 border-t border-gray-800 shrink-0 flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={loadPrompt}
              className="px-3 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
            >
              Regenerate Prompt
            </button>
            <button
              onClick={() => { void handleGenerate(4); }}
              disabled={!description.trim()}
              className="px-3 py-2 text-xs rounded-lg bg-gray-700 border border-gray-600 text-gray-200 hover:bg-gray-600 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Generate 4 Variations
            </button>
            <button
              onClick={() => { void handleGenerate(1); }}
              disabled={!description.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Generate Avatar
            </button>
          </div>
        )}

        {/* Footer — variation picker */}
        {step === 'picking' && (
          <div className="px-5 py-4 border-t border-gray-800 shrink-0 flex items-center gap-2 justify-between">
            <button
              onClick={() => setStep('editing')}
              className="px-3 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition-colors"
            >
              ← Back to editor
            </button>
            <button
              onClick={() => { void handleGenerate(4); }}
              className="px-3 py-2 text-xs rounded-lg bg-gray-700 border border-gray-600 text-gray-200 hover:bg-gray-600 hover:text-white transition-colors"
            >
              Regenerate variations
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
