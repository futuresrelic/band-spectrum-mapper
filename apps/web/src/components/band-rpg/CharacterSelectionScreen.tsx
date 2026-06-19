import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { platformerApi } from '../../api/platformer';
import type { BandRpgSelectedBand, BandRpgSelectedCharacter } from '../../api/bandRpg';

interface SelectableCharacter {
  id:      string;
  name:    string;
  role:    string | null;
  dataUrl: string | null;
}

const ARCHIVIST: SelectableCharacter = {
  id:      'archivist',
  name:    'The Archivist',
  role:    'Guide',
  dataUrl: null,
};

interface Props {
  selectedBand: BandRpgSelectedBand;
  onSelect:     (char: BandRpgSelectedCharacter) => void;
  onBack:       () => void;
}

export default function CharacterSelectionScreen({ selectedBand, onSelect, onBack }: Props) {
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['platformer-members', selectedBand.id],
    queryFn:  () => platformerApi.getMembers([selectedBand.id]),
    staleTime: 5 * 60_000,
  });

  const { data: skins = [], isLoading: loadingSkins } = useQuery({
    queryKey: ['platformer-skins', selectedBand.id],
    queryFn:  () => platformerApi.getSkins({ bandIds: [selectedBand.id] }),
    staleTime: 5 * 60_000,
  });

  const isLoading = loadingMembers || loadingSkins;

  const characters = useMemo<SelectableCharacter[]>(() => {
    // Map approved skins by memberId (first skin wins)
    const skinByMember = new Map<string, string>();
    for (const s of skins) {
      if (s.memberId && !skinByMember.has(s.memberId)) skinByMember.set(s.memberId, s.dataUrl);
    }

    // Members (with or without skin)
    const memberChars: SelectableCharacter[] = members.map((m) => ({
      id:      m.id,
      name:    m.name,
      role:    m.role,
      dataUrl: skinByMember.get(m.id) ?? null,
    }));

    // Band-level skins not assigned to a specific member
    const unassigned: SelectableCharacter[] = skins
      .filter((s) => !s.memberId)
      .map((s) => ({
        id:      s.id,
        name:    s.name,
        role:    s.band?.name ?? null,
        dataUrl: s.dataUrl,
      }));

    return [...memberChars, ...unassigned];
  }, [members, skins]);

  function handleSelect(c: SelectableCharacter) {
    onSelect({
      id:      c.id,
      name:    c.name,
      role:    c.role,
      dataUrl: c.dataUrl,
    });
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-gray-800 bg-black/30">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-1"
          >
            ← Band
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Choose Your Character</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              <span className="text-violet-400">{selectedBand.name}</span> · Pick who explores The Archives
            </p>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="text-gray-500 text-center py-16 text-sm">Loading characters…</div>
        )}

        {!isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {characters.map((c) => (
              <CharacterCard key={c.id} char={c} onSelect={handleSelect} />
            ))}
            {/* Archivist fallback — always available */}
            <CharacterCard key="archivist" char={ARCHIVIST} onSelect={handleSelect} isDefault />
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterCard({
  char,
  onSelect,
  isDefault = false,
}: {
  char: SelectableCharacter;
  onSelect: (c: SelectableCharacter) => void;
  isDefault?: boolean;
}) {
  return (
    <button
      onClick={() => onSelect(char)}
      className={`group flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${
        isDefault
          ? 'bg-gray-900/30 border-gray-700 hover:border-gray-500'
          : 'bg-gray-900/50 hover:bg-gray-800/80 border-gray-800 hover:border-violet-500/50'
      }`}
    >
      {/* Portrait */}
      <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center border border-gray-700 bg-gray-800">
        {char.dataUrl ? (
          <img
            src={char.dataUrl}
            alt={char.name}
            className="w-full h-full object-cover"
          />
        ) : isDefault ? (
          <span className="text-3xl">🧙</span>
        ) : (
          <span className="text-2xl font-bold text-gray-400 group-hover:text-violet-400 transition-colors">
            {char.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="text-center min-w-0 w-full">
        <p className="text-white text-sm font-semibold line-clamp-2 leading-snug">{char.name}</p>
        {char.role && (
          <p className={`text-xs mt-0.5 ${isDefault ? 'text-gray-500' : 'text-violet-400/80'}`}>
            {char.role}
          </p>
        )}
        {isDefault && (
          <p className="text-gray-600 text-xs mt-1">Default</p>
        )}
      </div>
    </button>
  );
}
